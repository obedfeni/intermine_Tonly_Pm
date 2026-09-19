-- Fleet PM Predictor — database schema (Postgres)
-- Run this once against your Vercel Postgres / Neon database before first use.
-- Easiest path: `npm run db:init` (reads this file and executes it via
-- @vercel/postgres using your DATABASE_URL / POSTGRES_URL env var).
-- You can also paste it directly into the Neon SQL editor or `psql`.

create extension if not exists pgcrypto; -- for gen_random_uuid()

create table if not exists trucks (
  id            uuid primary key default gen_random_uuid(),
  truck_id      text unique not null,        -- canonical ID, e.g. 'ET001'
  pm_name       text,                        -- "Next PM Name" (user-entered)
  pm_target_km  double precision,            -- "Next PM Target km" (user-entered)
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create type ingest_source as enum ('FILE', 'GOOGLE_SHEET');

create table if not exists ingest_batches (
  id          uuid primary key default gen_random_uuid(),
  source      ingest_source not null,
  source_name text not null,                 -- filename or Google Sheet URL
  row_count   integer not null,
  created_at  timestamptz not null default now()
);

create table if not exists readings (
  id              uuid primary key default gen_random_uuid(),
  truck_id        uuid not null references trucks(id) on delete cascade,
  batch_id        uuid not null references ingest_batches(id) on delete cascade,
  source_row_ref  integer,
  raw_truck_label text not null,
  reading_date    timestamptz,
  odometer_km     double precision not null,
  is_inlier       boolean not null default true,
  created_at      timestamptz not null default now()
);

create index if not exists readings_truck_date_idx on readings (truck_id, reading_date);
create index if not exists readings_batch_idx on readings (batch_id);

create type data_quality as enum ('OK', 'INSUFFICIENT_DATA', 'CONFLICTING_TREND');

create table if not exists prediction_runs (
  id                     uuid primary key default gen_random_uuid(),
  truck_id               uuid not null references trucks(id) on delete cascade,
  batch_id               uuid not null references ingest_batches(id) on delete cascade,
  current_odometer_km    double precision,
  avg_daily_km           double precision,
  daily_km_std_err       double precision,
  r_squared              double precision,
  inlier_count           integer not null,
  outlier_count          integer not null,
  first_reading_date     timestamptz,
  last_reading_date      timestamptz,
  quality                data_quality not null default 'OK',
  pm_target_km_snapshot  double precision,
  km_remaining           double precision,
  predicted_days         integer,
  predicted_days_low     integer,
  predicted_days_high    integer,
  predicted_date         timestamptz,
  created_at             timestamptz not null default now()
);

create index if not exists prediction_runs_truck_idx on prediction_runs (truck_id, created_at desc);
create index if not exists prediction_runs_batch_idx on prediction_runs (batch_id);

create table if not exists truck_id_aliases (
  id         uuid primary key default gen_random_uuid(),
  raw_label  text unique not null,           -- e.g. 'ET11'
  truck_id   text not null,                  -- e.g. 'ET011'
  note       text,
  created_at timestamptz not null default now()
);

-- Auto-maintain updated_at on trucks
create or replace function set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trucks_set_updated_at on trucks;
create trigger trucks_set_updated_at
  before update on trucks
  for each row execute function set_updated_at();

-- ---------- PM history & scheduling ----------

-- Completed PMs, logged manually by the user: which truck, which PM, and the
-- odometer reading at the moment it was actually done.
create table if not exists pm_completions (
  id             uuid primary key default gen_random_uuid(),
  truck_id       uuid not null references trucks(id) on delete cascade,
  pm_name        text,
  odometer_km    double precision not null,
  completed_date date not null,
  notes          text,
  created_at     timestamptz not null default now()
);

create index if not exists pm_completions_truck_idx on pm_completions (truck_id, completed_date desc);

create type pm_schedule_status as enum ('SCHEDULED', 'COMPLETED', 'CANCELLED');

-- A PM formally scheduled from a prediction (via the "Schedule" button), so
-- it can be reviewed, printed, or emailed as a fixed list independent of
-- whatever the algorithm predicts on the next upload.
create table if not exists pm_schedule (
  id             uuid primary key default gen_random_uuid(),
  truck_id       uuid not null references trucks(id) on delete cascade,
  pm_name        text,
  target_km      double precision,
  scheduled_date date not null,
  status         pm_schedule_status not null default 'SCHEDULED',
  completion_id  uuid references pm_completions(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists pm_schedule_truck_idx on pm_schedule (truck_id);
create index if not exists pm_schedule_status_idx on pm_schedule (status, scheduled_date);

drop trigger if exists pm_schedule_set_updated_at on pm_schedule;
create trigger pm_schedule_set_updated_at
  before update on pm_schedule
  for each row execute function set_updated_at();
