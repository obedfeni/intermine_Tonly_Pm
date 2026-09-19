import { NextRequest, NextResponse } from 'next/server';
import { clearTruckTarget, deactivateTruck, getAllTrucksWithLatestRun, updateTruckTarget } from '@/lib/db';
import { computeFleetRow } from '@/lib/types';
import { z } from 'zod';

export const runtime = 'nodejs';

const patchSchema = z.object({
  pmName: z.string().max(120).nullable().optional(),
  pmTargetKm: z.number().finite().nonnegative().nullable().optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ truckId: string }> }) {
  const { truckId: rawTruckId } = await params;
  const truckId = rawTruckId.toUpperCase();

  let body: z.infer<typeof patchSchema>;
  try {
    body = patchSchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: 'Body must be { pmName?: string|null, pmTargetKm?: number|null }.' }, { status: 400 });
  }

  try {
    const truck =
      body.pmTargetKm === null && body.pmName === undefined
        ? await clearTruckTarget(truckId)
        : await updateTruckTarget(truckId, { pmName: body.pmName, pmTargetKm: body.pmTargetKm });

    // Recompute the fleet row from the truck's most recent prediction run —
    // no need to re-invoke the ML engine just because the target changed.
    const rows = await getAllTrucksWithLatestRun();
    const row = rows.find((r) => r.truck_id === truckId);
    if (!row) return NextResponse.json({ error: 'Truck not found.' }, { status: 404 });

    const fleetRow = computeFleetRow(truck.truck_id, truck.pm_name, truck.pm_target_km, {
      currentOdometerKm: row.current_odometer_km,
      avgDailyKm: row.avg_daily_km,
      dailyKmStdErr: row.daily_km_std_err,
      rSquared: row.r_squared,
      inlierCount: row.inlier_count ?? 0,
      outlierCount: row.outlier_count ?? 0,
      firstReadingDate: row.first_reading_date,
      lastReadingDate: row.last_reading_date,
      quality: row.quality ?? 'INSUFFICIENT_DATA',
    });

    return NextResponse.json({ truck: fleetRow });
  } catch (err) {
    console.error('Failed to update truck:', err);
    const message = err instanceof Error ? err.message : 'Unknown error.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * Soft-delete a truck: marks it inactive rather than removing its row, so
 * it stops appearing on the dashboard AND (unlike a raw SQL DELETE) stays
 * gone the next time a log/sheet containing its rows is re-uploaded — see
 * the comment on deactivateTruck() in src/lib/db.ts.
 */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ truckId: string }> }) {
  const { truckId: rawTruckId } = await params;
  const truckId = rawTruckId.toUpperCase();

  try {
    await deactivateTruck(truckId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('Failed to remove truck:', err);
    const message = err instanceof Error ? err.message : 'Unknown error.';
    return NextResponse.json({ error: message }, { status: 404 });
  }
}
