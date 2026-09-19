import { neon, type NeonQueryFunction } from '@neondatabase/serverless';

/**
 * Thin, typed data-access layer over the Neon serverless driver.
 * No ORM — just parameterized tagged-template SQL, which keeps the whole
 * app dependency-light and avoids native-binary build steps (important for
 * reliable Vercel builds).
 *
 * Reads DATABASE_URL first (Neon's own convention), falling back to
 * POSTGRES_URL (what the older Vercel Postgres integration injects) so this
 * works with either naming.
 */
function getConnectionString(): string {
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!url) {
    throw new Error(
      'No database connection string found. Set DATABASE_URL (or POSTGRES_URL) in your environment — see .env.example.'
    );
  }
  return url;
}

// The real neon() client is constructed lazily, on first *query*, not at
// module load. Next.js's build-time "collect page data" step imports every
// route module (including this one) to statically analyze it, with no
// DATABASE_URL present yet — eagerly calling neon(getConnectionString())
// at module scope would throw during `next build` even though the env var
// is correctly configured in Vercel's runtime. A tiny lazy proxy sidesteps
// that: it only touches process.env when a request actually runs a query.
let _sql: NeonQueryFunction<false, false> | null = null;
function getSql(): NeonQueryFunction<false, false> {
  if (!_sql) _sql = neon(getConnectionString());
  return _sql;
}

// The Neon HTTP driver's tagged-template `sql` function returns rows as a
// plain array directly (unlike the old @vercel/postgres `{ rows: [...] }`
// shape) — every helper below returns that array straight through.
export const sql = ((strings: TemplateStringsArray, ...values: unknown[]) =>
  getSql()(strings, ...values)) as unknown as NeonQueryFunction<false, false>;

// ---------- Types ----------

export type DataQuality = 'OK' | 'INSUFFICIENT_DATA' | 'CONFLICTING_TREND';
export type IngestSourceType = 'FILE' | 'GOOGLE_SHEET';

export interface Truck {
  id: string;
  truck_id: string;
  pm_name: string | null;
  pm_target_km: number | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface TruckIdAlias {
  id: string;
  raw_label: string;
  truck_id: string;
  note: string | null;
}

export interface IngestBatch {
  id: string;
  source: IngestSourceType;
  source_name: string;
  row_count: number;
  created_at: string;
}

export interface ReadingInsert {
  truckDbId: string;
  sourceRowRef: number | null;
  rawTruckLabel: string;
  readingDate: Date | null;
  odometerKm: number;
  isInlier: boolean;
}

export interface PredictionRunInsert {
  truckDbId: string;
  currentOdometerKm: number | null;
  avgDailyKm: number | null;
  dailyKmStdErr: number | null;
  rSquared: number | null;
  inlierCount: number;
  outlierCount: number;
  firstReadingDate: Date | null;
  lastReadingDate: Date | null;
  quality: DataQuality;
  pmTargetKmSnapshot: number | null;
  kmRemaining: number | null;
  predictedDays: number | null;
  predictedDaysLow: number | null;
  predictedDaysHigh: number | null;
  predictedDate: Date | null;
}

export interface TruckWithLatestRun extends Truck {
  run_id: string | null;
  current_odometer_km: number | null;
  avg_daily_km: number | null;
  daily_km_std_err: number | null;
  r_squared: number | null;
  inlier_count: number | null;
  outlier_count: number | null;
  first_reading_date: string | null;
  last_reading_date: string | null;
  quality: DataQuality | null;
  km_remaining: number | null;
  predicted_days: number | null;
  predicted_days_low: number | null;
  predicted_days_high: number | null;
  predicted_date: string | null;
  run_created_at: string | null;
}

// ---------- Trucks ----------

export async function getOrCreateTruck(truckId: string): Promise<Truck> {
  const existing = (await sql`select * from trucks where truck_id = ${truckId}`) as Truck[];
  if (existing[0]) return existing[0];
  const inserted = (await sql`
    insert into trucks (truck_id) values (${truckId})
    on conflict (truck_id) do update set truck_id = excluded.truck_id
    returning *
  `) as Truck[];
  return inserted[0]!;
}

/** Plain lookup — unlike getOrCreateTruck, never creates a row. Used by the PM history/schedule routes, which should 404 on an unknown truck rather than silently inventing one. */
export async function getTruckByTruckId(truckId: string): Promise<Truck | null> {
  const rows = (await sql`select * from trucks where truck_id = ${truckId}`) as Truck[];
  return rows[0] ?? null;
}

export async function updateTruckTarget(
  truckId: string,
  fields: { pmName?: string | null; pmTargetKm?: number | null }
): Promise<Truck> {
  const result = (await sql`
    update trucks
    set
      pm_name = coalesce(${fields.pmName ?? null}, pm_name),
      pm_target_km = case when ${fields.pmTargetKm ?? null}::double precision is not null
                          then ${fields.pmTargetKm ?? null}
                          else pm_target_km end
    where truck_id = ${truckId}
    returning *
  `) as Truck[];
  if (!result[0]) throw new Error(`Truck ${truckId} not found`);
  return result[0];
}

/** Clears a target back to null (distinct from "leave unchanged"). */
export async function clearTruckTarget(truckId: string): Promise<Truck> {
  const result = (await sql`
    update trucks set pm_name = null, pm_target_km = null
    where truck_id = ${truckId}
    returning *
  `) as Truck[];
  if (!result[0]) throw new Error(`Truck ${truckId} not found`);
  return result[0];
}

/**
 * Soft-delete: marks a truck inactive instead of removing its row. This is
 * what makes removal "stick" across future uploads — a hard SQL DELETE has
 * no memory of the truck ever having existed, so the very next ingest that
 * still contains that truck's rows just recreates it (via getOrCreateTruck's
 * upsert) with the schema default active = true. Deactivating instead keeps
 * the row (and its history) around but flagged, and getOrCreateTruck's
 * select-first lookup returns that same inactive row on future uploads
 * instead of inserting a fresh active one — the ingest route then skips it.
 */
export async function deactivateTruck(truckId: string): Promise<Truck> {
  const result = (await sql`
    update trucks set active = false where truck_id = ${truckId}
    returning *
  `) as Truck[];
  if (!result[0]) throw new Error(`Truck ${truckId} not found`);
  return result[0];
}

/** Undoes deactivateTruck — brings a removed truck back into the active fleet. */
export async function reactivateTruck(truckId: string): Promise<Truck> {
  const result = (await sql`
    update trucks set active = true where truck_id = ${truckId}
    returning *
  `) as Truck[];
  if (!result[0]) throw new Error(`Truck ${truckId} not found`);
  return result[0];
}

export async function getAllTrucksWithLatestRun(): Promise<TruckWithLatestRun[]> {
  const result = (await sql`
    select
      t.*,
      r.id as run_id,
      r.current_odometer_km,
      r.avg_daily_km,
      r.daily_km_std_err,
      r.r_squared,
      r.inlier_count,
      r.outlier_count,
      r.first_reading_date,
      r.last_reading_date,
      r.quality,
      r.km_remaining,
      r.predicted_days,
      r.predicted_days_low,
      r.predicted_days_high,
      r.predicted_date,
      r.created_at as run_created_at
    from trucks t
    left join lateral (
      select * from prediction_runs pr
      where pr.truck_id = t.id
      order by pr.created_at desc
      limit 1
    ) r on true
    where t.active = true
    order by t.truck_id asc
  `) as TruckWithLatestRun[];
  return result;
}

// ---------- Truck ID aliases ----------

export async function getTruckIdAliases(): Promise<TruckIdAlias[]> {
  return (await sql`select * from truck_id_aliases order by raw_label asc`) as TruckIdAlias[];
}

export async function addTruckIdAlias(rawLabel: string, truckId: string, note?: string) {
  await sql`
    insert into truck_id_aliases (raw_label, truck_id, note)
    values (${rawLabel}, ${truckId}, ${note ?? null})
    on conflict (raw_label) do update set truck_id = excluded.truck_id, note = excluded.note
  `;
}

// ---------- Ingest batches ----------

export async function createIngestBatch(
  source: IngestSourceType,
  sourceName: string,
  rowCount: number
): Promise<IngestBatch> {
  const result = (await sql`
    insert into ingest_batches (source, source_name, row_count)
    values (${source}, ${sourceName}, ${rowCount})
    returning *
  `) as IngestBatch[];
  return result[0]!;
}

export async function getRecentBatches(limit = 20): Promise<IngestBatch[]> {
  return (await sql`
    select * from ingest_batches order by created_at desc limit ${limit}
  `) as IngestBatch[];
}

// ---------- Readings ----------

export async function insertReadings(batchId: string, readings: ReadingInsert[]) {
  // The Neon HTTP driver has no native bulk-insert helper, so batch with
  // Promise.all in reasonably sized chunks to stay well under connection
  // limits on serverless.
  const CHUNK = 25;
  for (let i = 0; i < readings.length; i += CHUNK) {
    const chunk = readings.slice(i, i + CHUNK);
    await Promise.all(
      chunk.map((r) =>
        sql`
          insert into readings
            (truck_id, batch_id, source_row_ref, raw_truck_label, reading_date, odometer_km, is_inlier)
          values
            (${r.truckDbId}, ${batchId}, ${r.sourceRowRef}, ${r.rawTruckLabel},
             ${r.readingDate ? r.readingDate.toISOString() : null}, ${r.odometerKm}, ${r.isInlier})
        `
      )
    );
  }
}

export async function getReadingsForTruck(truckDbId: string, batchId?: string) {
  return batchId
    ? await sql`
        select * from readings
        where truck_id = ${truckDbId} and batch_id = ${batchId}
        order by coalesce(source_row_ref, 0) asc
      `
    : await sql`
        select * from readings
        where truck_id = ${truckDbId}
        order by coalesce(source_row_ref, 0) asc
      `;
}

// ---------- Prediction runs ----------

export async function insertPredictionRuns(batchId: string, runs: PredictionRunInsert[]) {
  for (const r of runs) {
    await sql`
      insert into prediction_runs (
        truck_id, batch_id, current_odometer_km, avg_daily_km, daily_km_std_err,
        r_squared, inlier_count, outlier_count, first_reading_date, last_reading_date,
        quality, pm_target_km_snapshot, km_remaining, predicted_days,
        predicted_days_low, predicted_days_high, predicted_date
      ) values (
        ${r.truckDbId}, ${batchId}, ${r.currentOdometerKm}, ${r.avgDailyKm}, ${r.dailyKmStdErr},
        ${r.rSquared}, ${r.inlierCount}, ${r.outlierCount},
        ${r.firstReadingDate ? r.firstReadingDate.toISOString() : null},
        ${r.lastReadingDate ? r.lastReadingDate.toISOString() : null},
        ${r.quality}, ${r.pmTargetKmSnapshot}, ${r.kmRemaining}, ${r.predictedDays},
        ${r.predictedDaysLow}, ${r.predictedDaysHigh},
        ${r.predictedDate ? r.predictedDate.toISOString() : null}
      )
    `;
  }
}

export async function getTruckRunHistory(truckDbId: string, limit = 50) {
  return await sql`
    select pr.*, b.source, b.source_name, b.created_at as batch_created_at
    from prediction_runs pr
    join ingest_batches b on b.id = pr.batch_id
    where pr.truck_id = ${truckDbId}
    order by pr.created_at desc
    limit ${limit}
  `;
}

// ---------- PM completions (history log) ----------

export interface PmCompletionRow {
  id: string;
  truck_id: string;
  pm_name: string | null;
  odometer_km: number;
  completed_date: string;
  notes: string | null;
  created_at: string;
}

export async function insertPmCompletion(params: {
  truckDbId: string;
  pmName: string | null;
  odometerKm: number;
  completedDate: string; // 'YYYY-MM-DD'
  notes: string | null;
}): Promise<PmCompletionRow> {
  const result = (await sql`
    insert into pm_completions (truck_id, pm_name, odometer_km, completed_date, notes)
    values (${params.truckDbId}, ${params.pmName}, ${params.odometerKm}, ${params.completedDate}, ${params.notes})
    returning *
  `) as PmCompletionRow[];
  return result[0]!;
}

export async function getPmCompletionsForTruck(truckDbId: string, limit = 50): Promise<PmCompletionRow[]> {
  return (await sql`
    select * from pm_completions
    where truck_id = ${truckDbId}
    order by completed_date desc, created_at desc
    limit ${limit}
  `) as PmCompletionRow[];
}

// ---------- PM schedule ----------

export type PmScheduleStatus = 'SCHEDULED' | 'COMPLETED' | 'CANCELLED';

export interface PmScheduleRow {
  id: string;
  truck_id: string;
  pm_name: string | null;
  target_km: number | null;
  scheduled_date: string;
  status: PmScheduleStatus;
  completion_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface PmScheduleWithTruck extends PmScheduleRow {
  truck_label: string;
}

export async function getActiveScheduleForTruck(truckDbId: string): Promise<PmScheduleRow | null> {
  const rows = (await sql`
    select * from pm_schedule
    where truck_id = ${truckDbId} and status = 'SCHEDULED'
    order by scheduled_date asc
    limit 1
  `) as PmScheduleRow[];
  return rows[0] ?? null;
}

export async function createPmSchedule(params: {
  truckDbId: string;
  pmName: string | null;
  targetKm: number | null;
  scheduledDate: string; // 'YYYY-MM-DD'
}): Promise<PmScheduleRow> {
  const result = (await sql`
    insert into pm_schedule (truck_id, pm_name, target_km, scheduled_date)
    values (${params.truckDbId}, ${params.pmName}, ${params.targetKm}, ${params.scheduledDate})
    returning *
  `) as PmScheduleRow[];
  return result[0]!;
}

export async function getAllScheduledPms(): Promise<PmScheduleWithTruck[]> {
  return (await sql`
    select s.*, t.truck_id as truck_label
    from pm_schedule s
    join trucks t on t.id = s.truck_id
    where s.status = 'SCHEDULED'
    order by s.scheduled_date asc
  `) as PmScheduleWithTruck[];
}

/** Closes out a scheduled PM once its completion has been logged. */
export async function markScheduleCompleted(id: string, completionId: string): Promise<PmScheduleRow> {
  const result = (await sql`
    update pm_schedule set status = 'COMPLETED', completion_id = ${completionId}
    where id = ${id} and status = 'SCHEDULED'
    returning *
  `) as PmScheduleRow[];
  if (!result[0]) throw new Error('Schedule entry not found or already resolved');
  return result[0];
}

export async function cancelSchedule(id: string): Promise<void> {
  await sql`update pm_schedule set status = 'CANCELLED' where id = ${id} and status = 'SCHEDULED'`;
}
