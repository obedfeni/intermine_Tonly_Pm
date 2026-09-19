/** Shared types between the Next.js API layer, the Python ML function, and the UI. */

export type DataQuality = 'OK' | 'INSUFFICIENT_DATA' | 'CONFLICTING_TREND';

/** One reading sent to the Python /api/py/predict function. */
export interface PredictReadingInput {
  truckId: string;
  rowRef: number;
  /** ISO date string, or null if the row's date couldn't be parsed. */
  date: string | null;
  odometerKm: number;
}

export interface PredictRequestBody {
  readings: PredictReadingInput[];
  /** ISO date string for "today" — passed explicitly so results are reproducible. */
  asOfDate: string;
}

/** Per-truck robust-regression result returned by the Python function. */
export interface TruckPrediction {
  truckId: string;
  currentOdometerKm: number | null;
  avgDailyKm: number | null;
  dailyKmStdErr: number | null;
  rSquared: number | null;
  inlierCount: number;
  outlierCount: number;
  outlierRowRefs: number[];
  firstReadingDate: string | null;
  lastReadingDate: string | null;
  quality: DataQuality;
}

export interface PredictResponseBody {
  predictions: TruckPrediction[];
  algorithm: string;
  computedAt: string;
}

/** Fully merged view used by the dashboard: prediction + user-entered target. */
export interface FleetRow {
  truckId: string;
  pmName: string | null;
  pmTargetKm: number | null;
  currentOdometerKm: number | null;
  avgDailyKm: number | null;
  dailyKmStdErr: number | null;
  rSquared: number | null;
  inlierCount: number;
  outlierCount: number;
  firstReadingDate: string | null;
  lastReadingDate: string | null;
  quality: DataQuality;
  kmRemaining: number | null;
  predictedDays: number | null;
  predictedDaysLow: number | null;
  predictedDaysHigh: number | null;
  predictedDate: string | null;
  status: StatusCode;
}

export type StatusCode =
  | 'ENTER_TARGET'
  | 'NO_DATA'
  | 'CHECK_LOG'
  | 'INSUFFICIENT_DATA'
  | 'OVERDUE'
  | 'DUE_SOON' // <= 7 days
  | 'DUE_MEDIUM' // 8-14 days
  | 'DUE_LATER' // 15-30 days
  | 'OK'; // > 30 days

export const STATUS_META: Record<StatusCode, { label: string; color: 'gray' | 'red' | 'orange' | 'yellow' | 'green' | 'purple' }> = {
  ENTER_TARGET: { label: 'Enter target km', color: 'gray' },
  NO_DATA: { label: 'No log data', color: 'gray' },
  CHECK_LOG: { label: 'Check log data', color: 'purple' },
  INSUFFICIENT_DATA: { label: 'Not enough trend data', color: 'gray' },
  OVERDUE: { label: 'Overdue', color: 'red' },
  DUE_SOON: { label: 'Due ≤ 7 days', color: 'red' },
  DUE_MEDIUM: { label: 'Due 8–14 days', color: 'orange' },
  DUE_LATER: { label: 'Due 15–30 days', color: 'yellow' },
  OK: { label: '> 30 days', color: 'green' },
};

export function computeFleetRow(
  truckId: string,
  pmName: string | null,
  pmTargetKm: number | null,
  pred: Omit<TruckPrediction, 'truckId' | 'outlierRowRefs'>
): FleetRow {
  const { currentOdometerKm, avgDailyKm, quality } = pred;

  let kmRemaining: number | null = null;
  let predictedDays: number | null = null;
  let predictedDaysLow: number | null = null;
  let predictedDaysHigh: number | null = null;
  let predictedDate: string | null = null;
  let status: StatusCode;

  if (pmTargetKm == null) {
    status = 'ENTER_TARGET';
  } else if (currentOdometerKm == null) {
    status = 'NO_DATA';
  } else if (quality === 'CONFLICTING_TREND') {
    status = 'CHECK_LOG';
    kmRemaining = pmTargetKm - currentOdometerKm;
  } else {
    kmRemaining = pmTargetKm - currentOdometerKm;
    if (kmRemaining <= 0) {
      status = 'OVERDUE';
      predictedDays = 0;
      predictedDate = new Date().toISOString();
    } else if (quality === 'INSUFFICIENT_DATA' || avgDailyKm == null || avgDailyKm <= 0) {
      status = 'INSUFFICIENT_DATA';
    } else {
      predictedDays = Math.round(kmRemaining / avgDailyKm);
      const stdErr = pred.dailyKmStdErr ?? 0;
      if (stdErr > 0) {
        const rateLow = Math.max(avgDailyKm - 1.645 * stdErr, 0.01); // ~90% CI
        const rateHigh = avgDailyKm + 1.645 * stdErr;
        predictedDaysHigh = Math.round(kmRemaining / rateLow);
        predictedDaysLow = Math.round(kmRemaining / rateHigh);
      }
      const d = new Date();
      d.setUTCDate(d.getUTCDate() + predictedDays);
      predictedDate = d.toISOString();

      if (predictedDays <= 7) status = 'DUE_SOON';
      else if (predictedDays <= 14) status = 'DUE_MEDIUM';
      else if (predictedDays <= 30) status = 'DUE_LATER';
      else status = 'OK';
    }
  }

  return {
    truckId,
    pmName,
    pmTargetKm,
    currentOdometerKm,
    avgDailyKm,
    dailyKmStdErr: pred.dailyKmStdErr,
    rSquared: pred.rSquared,
    inlierCount: pred.inlierCount,
    outlierCount: pred.outlierCount,
    firstReadingDate: pred.firstReadingDate,
    lastReadingDate: pred.lastReadingDate,
    quality,
    kmRemaining,
    predictedDays,
    predictedDaysLow,
    predictedDaysHigh,
    predictedDate,
    status,
  };
}

// ---------- PM history & scheduling ----------

/** A completed PM, logged manually by the user (truck + km + date it was done). */
export interface PmCompletion {
  id: string;
  truckId: string;
  pmName: string | null;
  odometerKm: number;
  /** 'YYYY-MM-DD' */
  completedDate: string;
  notes: string | null;
  createdAt: string;
}

export type ScheduleStatus = 'SCHEDULED' | 'COMPLETED' | 'CANCELLED';

/** A PM that's been formally scheduled from a prediction, for the printable/sendable schedule view. */
export interface ScheduledPm {
  id: string;
  truckId: string;
  pmName: string | null;
  targetKm: number | null;
  /** 'YYYY-MM-DD' */
  scheduledDate: string;
  status: ScheduleStatus;
  createdAt: string;
}
