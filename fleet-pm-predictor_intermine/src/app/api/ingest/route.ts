import { NextRequest, NextResponse } from 'next/server';
import {
  addTruckIdAlias,
  createIngestBatch,
  getOrCreateTruck,
  getTruckIdAliases,
  insertPredictionRuns,
  insertReadings,
} from '@/lib/db';
import { fetchGoogleSheetCsv, GoogleSheetAccessError } from '@/lib/googleSheets';
import { parseCsvText, parseFileBuffer, type ParsedLog } from '@/lib/logParser';
import { runPrediction } from '@/lib/predictClient';
import { computeFleetRow, type FleetRow, type PredictReadingInput } from '@/lib/types';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const contentType = req.headers.get('content-type') ?? '';
    let parsed: ParsedLog;
    let sourceType: 'FILE' | 'GOOGLE_SHEET';
    let sourceName: string;

    const aliasRows = await getTruckIdAliases();
    const aliases = aliasRows.map((a) => ({ rawLabel: a.raw_label, truckId: a.truck_id }));

    if (contentType.includes('multipart/form-data')) {
      const form = await req.formData();
      const file = form.get('file');
      const googleSheetUrl = form.get('googleSheetUrl');

      if (file instanceof File) {
        const buf = Buffer.from(await file.arrayBuffer());
        parsed = parseFileBuffer(buf, aliases);
        sourceType = 'FILE';
        sourceName = file.name || 'uploaded-file';
      } else if (typeof googleSheetUrl === 'string' && googleSheetUrl.trim()) {
        const csv = await fetchGoogleSheetCsv(googleSheetUrl);
        parsed = parseCsvText(csv, aliases);
        sourceType = 'GOOGLE_SHEET';
        sourceName = googleSheetUrl.trim();
      } else {
        return NextResponse.json({ error: 'Provide either a file upload or a googleSheetUrl field.' }, { status: 400 });
      }
    } else {
      const body = await req.json().catch(() => null);
      if (!body?.googleSheetUrl) {
        return NextResponse.json({ error: 'Provide either a file upload (multipart) or { googleSheetUrl } JSON body.' }, { status: 400 });
      }
      const csv = await fetchGoogleSheetCsv(body.googleSheetUrl);
      parsed = parseCsvText(csv, aliases);
      sourceType = 'GOOGLE_SHEET';
      sourceName = String(body.googleSheetUrl).trim();
    }

    if (parsed.readings.length === 0) {
      return NextResponse.json(
        { error: 'No usable readings found in the log.', warnings: parsed.warnings },
        { status: 422 }
      );
    }

    // Learn any brand-new "ETxx"-pattern typos automatically for next time —
    // mirrors the spreadsheet's editable "Truck ID Fixes" table, but seeded
    // automatically instead of requiring the user to notice and add rows.
    for (const r of parsed.readings) {
      const upperRaw = r.rawTruckLabel.trim().toUpperCase();
      if (upperRaw !== r.truckId && !aliasRows.some((a) => a.raw_label.toUpperCase() === upperRaw)) {
        await addTruckIdAlias(upperRaw, r.truckId!, 'Auto-detected during ingest');
      }
    }

    // Upsert every truck seen, and build the DB-id lookup. getOrCreateTruck
    // looks the truck up by truck_id first, so a truck that was previously
    // soft-deleted (active = false, via the dashboard's Remove button or an
    // UPDATE ... SET active = false) is returned as-is here — it is NOT
    // reactivated just because the uploaded log still contains its rows.
    const uniqueTruckIds = Array.from(new Set(parsed.readings.map((r) => r.truckId!)));
    const truckByCanonicalId = new Map<string, Awaited<ReturnType<typeof getOrCreateTruck>>>();
    for (const tid of uniqueTruckIds) {
      truckByCanonicalId.set(tid, await getOrCreateTruck(tid));
    }

    // Removed trucks stay removed: skip them entirely for this ingest so a
    // re-uploaded file/sheet that still has their rows can't resurrect them.
    const removedTruckIds = uniqueTruckIds.filter((tid) => !truckByCanonicalId.get(tid)!.active);
    const activeTruckIds = uniqueTruckIds.filter((tid) => truckByCanonicalId.get(tid)!.active);
    const removedSet = new Set(removedTruckIds);
    const activeReadings = parsed.readings.filter((r) => !removedSet.has(r.truckId!));

    if (removedTruckIds.length > 0) {
      parsed.warnings.push(
        `Skipped ${removedTruckIds.length} removed truck(s) still present in this log: ${removedTruckIds.join(', ')}. ` +
          `Reactivate one from the database (UPDATE trucks SET active = true WHERE truck_id = '...') if this was unintended.`
      );
    }

    const batch = await createIngestBatch(sourceType, sourceName, activeReadings.length);

    // Run the ML prediction engine — only on trucks that are still active.
    const predictInput: PredictReadingInput[] = activeReadings.map((r) => ({
      truckId: r.truckId!,
      rowRef: r.rowRef,
      date: r.date ? r.date.toISOString() : null,
      odometerKm: r.odometerKm!,
    }));

    const predictionResult = await runPrediction(
      { readings: predictInput, asOfDate: new Date().toISOString() },
      { origin: req.nextUrl.origin, cookie: req.headers.get('cookie') }
    );
    const predictionByTruck = new Map(predictionResult.predictions.map((p) => [p.truckId, p]));

    // Persist readings, flagging outliers the ML engine identified.
    const outlierRowRefsByTruck = new Map<string, Set<number>>();
    for (const p of predictionResult.predictions) {
      outlierRowRefsByTruck.set(p.truckId, new Set(p.outlierRowRefs));
    }

    await insertReadings(
      batch.id,
      activeReadings.map((r) => ({
        truckDbId: truckByCanonicalId.get(r.truckId!)!.id,
        sourceRowRef: r.rowRef,
        rawTruckLabel: r.rawTruckLabel,
        readingDate: r.date,
        odometerKm: r.odometerKm!,
        isInlier: !(outlierRowRefsByTruck.get(r.truckId!)?.has(r.rowRef) ?? false),
      }))
    );

    // Compute + persist a PredictionRun snapshot per truck, using each
    // truck's currently-saved PM target.
    const fleetRows: FleetRow[] = [];
    const runInserts = [];
    for (const tid of activeTruckIds) {
      const truck = truckByCanonicalId.get(tid)!;
      const pred = predictionByTruck.get(tid);
      if (!pred) continue;

      const fleetRow = computeFleetRow(tid, truck.pm_name, truck.pm_target_km, pred);
      fleetRows.push(fleetRow);

      runInserts.push({
        truckDbId: truck.id,
        currentOdometerKm: pred.currentOdometerKm,
        avgDailyKm: pred.avgDailyKm,
        dailyKmStdErr: pred.dailyKmStdErr,
        rSquared: pred.rSquared,
        inlierCount: pred.inlierCount,
        outlierCount: pred.outlierCount,
        firstReadingDate: pred.firstReadingDate ? new Date(pred.firstReadingDate) : null,
        lastReadingDate: pred.lastReadingDate ? new Date(pred.lastReadingDate) : null,
        quality: pred.quality,
        pmTargetKmSnapshot: truck.pm_target_km,
        kmRemaining: fleetRow.kmRemaining,
        predictedDays: fleetRow.predictedDays,
        predictedDaysLow: fleetRow.predictedDaysLow,
        predictedDaysHigh: fleetRow.predictedDaysHigh,
        predictedDate: fleetRow.predictedDate ? new Date(fleetRow.predictedDate) : null,
      });
    }
    await insertPredictionRuns(batch.id, runInserts);

    fleetRows.sort((a, b) => a.truckId.localeCompare(b.truckId));

    return NextResponse.json({
      batchId: batch.id,
      rowsScanned: parsed.totalRowsScanned,
      rowsSkipped: parsed.skippedRows,
      warnings: parsed.warnings,
      algorithm: predictionResult.algorithm,
      fleet: fleetRows,
    });
  } catch (err) {
    if (err instanceof GoogleSheetAccessError) {
      return NextResponse.json({ error: err.message }, { status: 422 });
    }
    console.error('Ingest failed:', err);
    const message = err instanceof Error ? err.message : 'Unknown error during ingest.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
