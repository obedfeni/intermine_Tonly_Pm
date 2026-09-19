"""
POST /api/predict

Body:
  {
    "readings": [{ "truckId": "ET001", "rowRef": 18, "date": "2026-08-15T00:00:00.000Z" | null, "odometerKm": 12442 }, ...],
    "asOfDate": "2026-08-31T00:00:00.000Z"
  }

Response:
  {
    "predictions": [ { "truckId": ..., "currentOdometerKm": ..., "avgDailyKm": ..., ... }, ... ],
    "algorithm": "RANSAC linear regression (scikit-learn), OLS refit on inliers",
    "computedAt": "..."
  }

This file is intentionally self-contained (the ML logic used to live in a
sibling _ml_core.py, imported with `from _ml_core import ...`, but Vercel's
Python function bundler for this file-based BaseHTTPRequestHandler style of
function does not reliably package a second local module alongside the
entrypoint — it deploys fine, but crashes at import time on the live
platform with `ModuleNotFoundError: No module named '_ml_core'` even though
both files are committed side by side in the repo and everything works
locally. Merging everything into the one entrypoint file Vercel actually
bundles sidesteps that platform quirk entirely.)

--- Robust per-truck odometer trend estimation ---

The problem: a hand-typed charging log inevitably contains a few odometer
readings with a mistyped digit (an extra or dropped digit turns 15,188 into
51,188 or 1,188). A plain average/least-squares fit through those points
would badly distort both the "current odometer" reading and the predicted
daily driving rate.

The fix: fit each truck's odometer-vs-time trend with RANSAC (RANdom SAmple
Consensus) — a classic robust-regression algorithm from computer vision and
robotics (see Fischler & Bolles, 1981) that repeatedly fits a line to small
random subsets of the data and keeps the fit that the largest number of
points agree with ("inliers"). Points that don't fit that consensus line
("outliers") are excluded from every downstream calculation, and reported
back to the UI so a human can go verify the source row if they want.

This is the same idea as the neighbor-comparison filter used in the
spreadsheet version of this tool, but statistically principled: instead of a
fixed "3,000 km disagreement" rule, RANSAC's residual threshold is derived
from the data itself (median absolute deviation of an initial robust fit),
and it fits ALL points jointly rather than only comparing local neighbors —
so it isn't fooled by two consecutive bad readings the way a purely local
rule can be.
"""
from __future__ import annotations

import json
import math
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler
from typing import Literal

import numpy as np
from sklearn.linear_model import RANSACRegressor, LinearRegression

MAX_BODY_BYTES = 15 * 1024 * 1024  # charging logs can run to ~1,500 rows

DataQuality = Literal["OK", "INSUFFICIENT_DATA", "CONFLICTING_TREND"]


@dataclass
class Reading:
    row_ref: int
    date: datetime | None
    odometer_km: float


@dataclass
class TruckPrediction:
    truck_id: str
    current_odometer_km: float | None
    avg_daily_km: float | None
    daily_km_std_err: float | None
    r_squared: float | None
    inlier_count: int
    outlier_count: int
    outlier_row_refs: list[int] = field(default_factory=list)
    first_reading_date: str | None = None
    last_reading_date: str | None = None
    quality: DataQuality = "OK"


def _to_dict(pred: TruckPrediction) -> dict:
    return {
        "truckId": pred.truck_id,
        "currentOdometerKm": pred.current_odometer_km,
        "avgDailyKm": pred.avg_daily_km,
        "dailyKmStdErr": pred.daily_km_std_err,
        "rSquared": pred.r_squared,
        "inlierCount": pred.inlier_count,
        "outlierCount": pred.outlier_count,
        "outlierRowRefs": pred.outlier_row_refs,
        "firstReadingDate": pred.first_reading_date,
        "lastReadingDate": pred.last_reading_date,
        "quality": pred.quality,
    }


def predict_truck(truck_id: str, readings: list[Reading]) -> TruckPrediction:
    # Only dated, numeric readings can be placed on a time axis for regression.
    dated = sorted(
        [r for r in readings if r.date is not None],
        key=lambda r: (r.date, r.row_ref),
    )

    if len(dated) == 0:
        return TruckPrediction(
            truck_id=truck_id,
            current_odometer_km=None,
            avg_daily_km=None,
            daily_km_std_err=None,
            r_squared=None,
            inlier_count=0,
            outlier_count=0,
            quality="INSUFFICIENT_DATA",
        )

    if len(dated) == 1:
        only = dated[0]
        return TruckPrediction(
            truck_id=truck_id,
            current_odometer_km=only.odometer_km,
            avg_daily_km=None,
            daily_km_std_err=None,
            r_squared=None,
            inlier_count=1,
            outlier_count=0,
            first_reading_date=only.date.isoformat(),
            last_reading_date=only.date.isoformat(),
            quality="INSUFFICIENT_DATA",
        )

    t0 = dated[0].date
    x = np.array([(r.date - t0).total_seconds() / 86400.0 for r in dated]).reshape(-1, 1)
    y = np.array([r.odometer_km for r in dated])

    n = len(dated)

    if n == 2:
        # Not enough points for RANSAC to detect an outlier — take the two
        # readings at face value.
        slope = (y[1] - y[0]) / max(x[1, 0] - x[0, 0], 1e-6)
        quality: DataQuality = "OK" if slope >= 0 else "CONFLICTING_TREND"
        return TruckPrediction(
            truck_id=truck_id,
            current_odometer_km=float(y[-1]),
            avg_daily_km=float(slope) if slope >= 0 else None,
            daily_km_std_err=None,
            r_squared=None,
            inlier_count=2,
            outlier_count=0,
            first_reading_date=dated[0].date.isoformat(),
            last_reading_date=dated[-1].date.isoformat(),
            quality=quality,
        )

    inlier_mask = _fit_ransac(x, y)
    inlier_idx = np.where(inlier_mask)[0]
    outlier_idx = np.where(~inlier_mask)[0]

    if len(inlier_idx) < 2:
        # RANSAC couldn't find a consensus (extremely noisy truck) — fall
        # back to treating everything as inliers rather than reporting nothing.
        inlier_idx = np.arange(n)
        outlier_idx = np.array([], dtype=int)

    xi = x[inlier_idx]
    yi = y[inlier_idx]

    slope, intercept, r_squared, std_err = _ols_with_stats(xi, yi)

    inlier_readings = [dated[i] for i in inlier_idx]
    # Dates only carry day-level precision, so two readings from the same
    # calendar day are common (multiple charging sessions per shift). Break
    # ties by row_ref (log order) so we still pick the truly-last reading
    # rather than an arbitrary one from that day.
    last_inlier = max(inlier_readings, key=lambda r: (r.date, r.row_ref))
    first_inlier = min(inlier_readings, key=lambda r: (r.date, r.row_ref))

    quality = "OK"
    if slope < 0:
        quality = "CONFLICTING_TREND"
    elif len(inlier_idx) < 3:
        quality = "INSUFFICIENT_DATA"

    return TruckPrediction(
        truck_id=truck_id,
        current_odometer_km=float(last_inlier.odometer_km),
        avg_daily_km=float(slope) if quality != "CONFLICTING_TREND" else None,
        daily_km_std_err=float(std_err) if std_err is not None else None,
        r_squared=float(r_squared) if r_squared is not None else None,
        inlier_count=int(len(inlier_idx)),
        outlier_count=int(len(outlier_idx)),
        outlier_row_refs=[dated[i].row_ref for i in outlier_idx],
        first_reading_date=first_inlier.date.isoformat(),
        last_reading_date=last_inlier.date.isoformat(),
        quality=quality,
    )


def _fit_ransac(x: np.ndarray, y: np.ndarray) -> np.ndarray:
    """Fits RANSAC and returns a boolean inlier mask. Falls back gracefully
    if RANSAC can't converge (e.g. too few points relative to min_samples)."""
    n = len(y)
    min_samples = min(2, n)
    try:
        model = RANSACRegressor(
            estimator=LinearRegression(),
            min_samples=min_samples,
            residual_threshold=None,  # auto: MAD of residuals from an initial fit
            max_trials=200,
            random_state=42,
        )
        model.fit(x, y)
        return np.asarray(model.inlier_mask_, dtype=bool)
    except Exception:
        return np.ones(n, dtype=bool)


def _ols_with_stats(x: np.ndarray, y: np.ndarray) -> tuple[float, float, float | None, float | None]:
    """Plain least-squares fit on (presumed-clean) points, returning
    slope, intercept, R-squared, and the slope's standard error."""
    n = len(y)
    x_flat = x.flatten()
    x_mean = x_flat.mean()
    y_mean = y.mean()

    sxx = np.sum((x_flat - x_mean) ** 2)
    if sxx == 0 or n < 2:
        return float(y_mean), float(y_mean), None, None

    sxy = np.sum((x_flat - x_mean) * (y - y_mean))
    slope = sxy / sxx
    intercept = y_mean - slope * x_mean

    y_pred = slope * x_flat + intercept
    residuals = y - y_pred
    ss_res = np.sum(residuals**2)
    ss_tot = np.sum((y - y_mean) ** 2)
    r_squared = 1 - ss_res / ss_tot if ss_tot > 0 else None

    if n > 2:
        mse = ss_res / (n - 2)
        std_err = math.sqrt(mse / sxx) if sxx > 0 else None
    else:
        std_err = None

    return float(slope), float(intercept), r_squared, std_err


def run_predictions(readings_by_truck: dict[str, list[Reading]]) -> list[dict]:
    return [_to_dict(predict_truck(truck_id, readings)) for truck_id, readings in readings_by_truck.items()]


def _parse_iso(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        # Python's fromisoformat doesn't accept a trailing "Z" before 3.11's
        # handling improvements landed everywhere we might run — normalize it.
        v = value.replace("Z", "+00:00")
        dt = datetime.fromisoformat(v)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
    except (ValueError, TypeError):
        return None


class handler(BaseHTTPRequestHandler):
    def _send_json(self, status: int, payload: dict) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self) -> None:  # CORS preflight, harmless for same-origin use
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_GET(self) -> None:
        self._send_json(
            200,
            {
                "ok": True,
                "message": "POST a { readings, asOfDate } body to run predictions.",
            },
        )

    def do_POST(self) -> None:
        try:
            length = int(self.headers.get("Content-Length", 0))
            if length <= 0 or length > MAX_BODY_BYTES:
                self._send_json(400, {"error": "Request body missing or too large."})
                return

            raw = self.rfile.read(length)
            body = json.loads(raw)
        except (json.JSONDecodeError, ValueError):
            self._send_json(400, {"error": "Request body must be valid JSON."})
            return

        readings_payload = body.get("readings")
        if not isinstance(readings_payload, list) or len(readings_payload) == 0:
            self._send_json(400, {"error": "'readings' must be a non-empty array."})
            return

        by_truck: dict[str, list[Reading]] = defaultdict(list)
        for item in readings_payload:
            try:
                truck_id = str(item["truckId"])
                row_ref = int(item["rowRef"])
                odometer_km = float(item["odometerKm"])
            except (KeyError, TypeError, ValueError):
                continue  # skip malformed rows rather than fail the whole batch
            date = _parse_iso(item.get("date"))
            by_truck[truck_id].append(Reading(row_ref=row_ref, date=date, odometer_km=odometer_km))

        if not by_truck:
            self._send_json(400, {"error": "No valid readings found in request body."})
            return

        try:
            predictions = run_predictions(by_truck)
        except Exception as exc:  # noqa: BLE001 — surface a clean 500 instead of a crash trace
            self._send_json(500, {"error": f"Prediction engine failed: {exc}"})
            return

        self._send_json(
            200,
            {
                "predictions": predictions,
                "algorithm": "RANSAC linear regression (scikit-learn), OLS refit on inliers",
                "computedAt": datetime.now(timezone.utc).isoformat(),
            },
        )
