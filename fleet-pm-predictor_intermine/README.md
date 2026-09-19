# Fleet PM Predictor

Predictive preventive-maintenance dashboard for EV truck fleets. It reads your
charging/odometer log (an uploaded file, or a public Google Sheet), fits a
**robust regression** to each truck's odometer history in Python
(scikit-learn RANSAC), and predicts the date each truck will hit its next PM
target — flagging trucks with too little data, a physically-impossible
downward trend, or a wobbly fit that needs a human to check the log.

This replaces fixed-threshold "if a reading looks weird, ignore it" logic
with an actual outlier-resistant statistical fit, so a single mistyped
odometer reading (a very common real-world data problem) doesn't throw off
the whole prediction — RANSAC finds the trend line that best explains the
*majority* of readings and automatically discards the ones that don't fit.

The dashboard has a built-in English / 简体中文 language toggle (top right,
next to the light/dark mode switch) — every label, button, status, and toast
message is translated; truck IDs and PM names you type in stay as typed.

## Daily numbers are computed live, never hardcoded

Every figure in the dashboard — current odometer, average daily km,
predicted PM date — is recomputed from scratch on every ingest run, never
cached or baked in. If you re-run "Analyze" on the same Google Sheet after
your team adds more rows to it, the app re-fetches the sheet fresh, re-fits
the regression on the full updated history, and replaces the previous
prediction entirely. There's nothing to "reset" as more data comes in — just
click Analyze again whenever new readings have been added.

---

## How it's built

```
Next.js 16 (App Router, TypeScript) ──┐
React 18 + Tailwind CSS               ├── Vercel (single deployment)
Python 3 serverless function (ML)  ───┘
Postgres (Neon) ── persistence
```

- **Frontend** — `src/app` / `src/components`. A single dashboard page:
  upload panel, sortable fleet table with inline-editable PM targets,
  summary cards, and a slide-over detail view with an odometer trend chart
  (Recharts) that visually distinguishes inlier readings, excluded outliers,
  and the fitted trend line.
- **Ingestion** — `src/lib/logParser.ts` parses `.xlsx`/`.csv` uploads
  (SheetJS), `src/lib/googleSheets.ts` fetches a public Google Sheet as CSV.
  Both normalize messy truck-ID labels (`ET1`, `ET 001`, `et001` → `ET001`)
  using a small alias table that self-corrects over time.
- **ML engine** — `api/predict.py`, a single self-contained Python Vercel
  Function (not a Next.js API route — Vercel runs Python and Node functions
  side by side in one deployment). It used to split the ML code into a
  sibling `_ml_core.py` file, but Vercel's Python bundler for this
  file-based `BaseHTTPRequestHandler` style of function doesn't reliably
  package a second local module alongside the entrypoint (it deploys fine,
  then crashes at request time with `ModuleNotFoundError`), so everything
  now lives in the one file Vercel actually bundles. For each truck with ≥3 dated readings it
  runs `RANSACRegressor` (scikit-learn) to separate inliers from outliers,
  then refits ordinary least squares on the inliers alone to get the daily
  km rate, R², and a standard error used to build a confidence interval on
  the predicted PM date.
- **Persistence** — Postgres via `@neondatabase/serverless`, no ORM: a
  small typed data-access layer (`src/lib/db.ts`) with hand-written,
  parameterized SQL (schema in `db/schema.sql`). Every ingest run is stored
  as a `prediction_runs` snapshot, so history is kept even as new logs come
  in and PM targets get edited.

### Why RANSAC over a fixed-threshold filter

The original Excel version flagged an outlier by comparing each reading to
its immediate neighbors — which fails when *two* bad readings land next to
each other (each looks "normal" relative to the other). RANSAC instead
repeatedly samples small subsets of points, fits a line, and counts how many
of the *other* points agree with it within a residual threshold — the line
with the most agreement wins, and everything that disagrees with it is the
outlier set, regardless of how the bad points are distributed. This was
validated against a real fleet log where two consecutive bad readings broke
the old filter and produces a correct, high-confidence (R² > 0.99) trend.

---

## Project layout

```
api/
  predict.py             # Vercel Python Function: POST { readings } -> predictions (RANSAC + OLS, self-contained)
requirements.txt        # Python deps for api/predict.py only (numpy, scikit-learn)

src/
  app/
    api/                 # Next.js route handlers (ingest, trucks, aliases, batches)
    page.tsx             # Dashboard
    layout.tsx
  components/            # UploadPanel, FleetTable, TruckDetailSheet, SummaryCards, ui/*
  lib/
    logParser.ts         # File parsing + truck-ID normalization
    googleSheets.ts       # Public Google Sheet -> CSV fetch
    db.ts                 # Postgres data-access layer (raw SQL, no ORM)
    types.ts              # Status/prediction types + computeFleetRow() status logic
    predictClient.ts      # Calls the Python /api/predict function

db/schema.sql            # Full Postgres schema
scripts/init-db.ts       # One-time script that applies db/schema.sql
vercel.json               # Function memory/timeout config
```

---

## Deploying (GitHub → Vercel)

### 1. Push this repo to GitHub

```bash
cd fleet-pm-app
git init
git add .
git commit -m "Fleet PM Predictor"
gh repo create fleet-pm-predictor --private --source=. --push
# or, without the GitHub CLI:
#   create a new empty repo on github.com, then:
#   git remote add origin https://github.com/<you>/fleet-pm-predictor.git
#   git branch -M main
#   git push -u origin main
```

### 2. Create the database (Neon, via Vercel)

1. Go to [vercel.com/dashboard](https://vercel.com/dashboard) → **Storage** tab → **Create Database** → **Neon** (Postgres). Free tier is enough for one fleet.
2. This creates the database and — once connected to your project (next step) — automatically injects `DATABASE_URL` into your Vercel project's environment variables. You don't need to copy/paste a connection string for the deployed app.

### 3. Import the project into Vercel

1. [vercel.com/new](https://vercel.com/new) → **Import Git Repository** → pick the repo you just pushed.
2. Framework preset: Vercel will detect **Next.js** automatically. Leave build settings as default (`next build`).
3. Under **Environment Variables**, confirm `DATABASE_URL` is present (it will be, if you connected the Neon database to this project in step 2 — you can also connect an existing database to the project from the project's **Storage** tab after import).
4. Click **Deploy**.

### 4. Initialize the database schema

The schema (`db/schema.sql`) needs to be applied once. Two ways:

**Option A — from your machine, against the Neon database:**
```bash
# Copy the connection string from your Neon project dashboard
# (or Vercel project → Storage → your database → .env.local tab)
echo 'DATABASE_URL="postgres://...neon.tech/..."' > .env.local
npm install
npm run db:init
```

**Option B — paste directly into Neon's SQL editor:**
Open your Neon project → **SQL Editor** → paste the entire contents of
`db/schema.sql` → run it.

Either way this is a one-time step (re-running it is safe — it skips
anything that already exists).

### 5. Open the app

Visit the `*.vercel.app` URL Vercel gives you. Upload a log file or paste a
public Google Sheet link to get started.

---

## Using a Google Sheet as the data source

The app fetches a Sheet's data via its public CSV export URL — no Google
account connection or OAuth needed, which keeps this a single-user app with
no login required.

1. In Google Sheets: **File → Share → Publish to web** (or the regular
   **Share** dialog with **General access → Anyone with the link → Viewer**
   — either works, as long as the sheet is publicly viewable).
2. Copy the sheet's normal URL (`https://docs.google.com/spreadsheets/d/<id>/edit#gid=<n>`) and paste it into the app's **Google Sheet** tab on the upload panel.
3. The app converts it to the sheet's CSV export endpoint under the hood and re-fetches it fresh on every ingest — so you can just keep updating the same Sheet and re-run the import in the app whenever you have new readings.

---

## Local development

```bash
npm install
cp .env.example .env.local        # fill in DATABASE_URL (a Neon connection string;
                                   # a free Neon project works fine for local dev too)
npm run db:init                   # applies db/schema.sql
npm run dev                       # starts Next.js — but see note below
```

**Note on the Python function locally:** `npm run dev` only serves the
Next.js app; it does not run the Python function. To test the full
ingest → predict flow locally, use the Vercel CLI, which runs both the
Node and Python functions together the same way Vercel's servers do:

```bash
npm install -g vercel
vercel dev
```

(`vercel dev` will ask you to link the project the first time — say yes,
and it'll pull in the same `DATABASE_URL` you set on the Vercel project if
you don't have `.env.local` set locally.)

Other useful scripts:
```bash
npm run typecheck   # tsc --noEmit
npm run lint         # eslint, flat config (eslint.config.mjs)
npm run build        # production build (what Vercel runs)
```

To test just the Python ML core without spinning up the whole app:
```bash
pip install -r requirements.txt
python3 -c "
from api.predict import Reading, predict_truck
import datetime
readings = [Reading(row_ref=i, date=datetime.date(2026,1,1)+datetime.timedelta(days=i*2), odometer_km=1000+i*140) for i in range(6)]
print(predict_truck('ET001', readings))
"
```

---

## Data model

See `db/schema.sql` for the full DDL. Summary:

- **trucks** — one row per truck ID, holds the current PM name/target (the
  only thing a user edits directly).
- **ingest_batches** — one row per upload/sheet-import, for auditability.
- **readings** — every parsed odometer reading, tagged `is_inlier` from the
  most recent prediction run that included it.
- **prediction_runs** — a full snapshot of a truck's fitted trend, quality
  flag, and predicted PM date at the time of a given ingest — so prediction
  history survives even as new data comes in.
- **truck_id_aliases** — learned corrections for messy truck-ID spellings
  in the source log, applied automatically on future imports.

---

## Status logic

Each truck is classified from its latest prediction run and current PM
target (`src/lib/types.ts` → `computeFleetRow`):

| Status | Meaning |
|---|---|
| `OVERDUE` | Current odometer has already passed the PM target |
| `DUE_SOON` | Predicted to hit target within the near-term window |
| `ON_TRACK` | Predicted comfortably ahead of the target |
| `NO_TARGET` | No PM name/target set for this truck yet |
| `INSUFFICIENT_DATA` | Fewer than 2 reliable (inlier) readings |
| `CHECK_LOG` | Fitted trend is flat/negative — physically impossible for an odometer, almost always bad data worth a manual look |

---

## Troubleshooting: upload fails with a 500/404, or an error that just says "[object Object]"

This almost always means the Python prediction function (`api/predict.py`) is
failing to start on Vercel — not your data, and not the database. When
Vercel's platform itself can't run a function (it crashed, timed out, or
failed to build), it returns its own error shape instead of ours, which is
why you might briefly see the unhelpful text `[object Object]` — that's
already fixed in this version of the code (see `src/lib/predictClient.ts`),
but the *underlying* Python failure still needs fixing. To find the real
reason:

1. Go to your Vercel project → **Deployments** → click your latest deployment.
2. Look for a **Build Logs** tab specifically (not "Runtime Logs" — a build
   failure and a runtime crash show up in different places). Search it for
   `numpy`, `scikit-learn`, or `pip` — a failed dependency install is the
   most common cause.
3. If Build Logs look clean, check **Runtime Logs** / **Functions** instead
   and try the upload again while watching it — the actual Python
   traceback will appear there.

Common fixes if the build log shows a dependency error:
- Make sure `requirements.txt` sits at the project root (not inside `api/`) — it already does in this project, but double check after any manual edits.
- This project pins a Python version via `.python-version` (`3.12`) specifically so Vercel doesn't silently move you to a newer Python release without prebuilt wheels for `numpy==1.26.4` / `scikit-learn==1.5.2`. If Vercel's available versions have moved on since this was written, either bump those two pinned versions in `requirements.txt` to current releases, or check [Vercel's Python version docs](https://vercel.com/docs/functions/runtimes/python/python-version) for the currently supported list.
- Confirm `requirements.txt` still does **not** list `flask`, `fastapi`, or `django` — Vercel auto-detects a Python framework preset from those and it takes over **all** routing for the project, which would silently break both this file-based Python function and the Next.js app sitting next to it.

## Troubleshooting: the site itself shows a Vercel login/"protected" page, or uploads fail after that login page

This is [Vercel Deployment Protection](https://vercel.com/docs/deployment-protection) — a login wall Vercel puts in front of your project's URLs, on by default for most projects. Since this app has no login of its own by design, turn it off: your Vercel project → **Settings** → **Deployment Protection** → set the protection method to **None** → save. If you'd rather keep it on for some reason, note that the internal call this app makes from the Next.js side to the Python prediction function (`src/lib/predictClient.ts`) is written to reuse the exact browser-facing URL and to forward your session cookie, specifically so it keeps working even with protection enabled — but disabling it is simpler for a single-user tool like this one.

## Troubleshooting: `ModuleNotFoundError` in the Python function's logs

If you see this for a module that isn't a real third-party package (something like a leftover reference to a file that used to live in `api/`), it means Vercel's Python function bundler didn't package a second local file alongside `api/predict.py` the way you'd expect from ordinary Python imports. As shipped, `api/predict.py` is a single self-contained file specifically to avoid this — if you split code back out into a second file under `api/`, be aware it may not reliably get bundled with the entrypoint on Vercel even though it works fine locally and in `vercel dev`.

## A note on the `xlsx` (SheetJS) dependency

File parsing uses the `xlsx` package from the npm registry
(`xlsx@^0.18.5`). npm audit flags this version for two known issues
(prototype pollution and a ReDoS pattern) that SheetJS has fixed only in
their own CDN-distributed builds, not in the npm registry package. For a
single-user internal tool ingesting your own files this is a low-severity
risk, but if you want the hardened build, SheetJS's official installation
instructions are here:
<https://docs.sheetjs.com/docs/getting-started/installation/nodejs/> — you'd
swap the npm dependency for their CDN tarball URL per those docs. Google
Sheet imports are unaffected (that path is plain CSV parsing, no `xlsx`
involved).

---

## Tech stack reference

- [Next.js 16](https://nextjs.org/docs) — App Router, Turbopack build
- [scikit-learn `RANSACRegressor`](https://scikit-learn.org/stable/modules/generated/sklearn.linear_model.RANSACRegressor.html)
- [Neon serverless driver](https://github.com/neondatabase/serverless)
- [Recharts](https://recharts.org/)
- [Vercel Python Functions](https://vercel.com/docs/functions/runtimes/python)
