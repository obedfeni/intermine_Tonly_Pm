import { NextResponse } from 'next/server';
import { getAllTrucksWithLatestRun } from '@/lib/db';
import { computeFleetRow, type FleetRow } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const rows = await getAllTrucksWithLatestRun();

    const fleet: FleetRow[] = rows.map((t) => {
      if (!t.run_id) {
        // Truck exists but has never had a prediction run (shouldn't normally
        // happen, since a truck is only created during ingest, but handle it
        // gracefully rather than crashing the dashboard).
        return computeFleetRow(t.truck_id, t.pm_name, t.pm_target_km, {
          currentOdometerKm: null,
          avgDailyKm: null,
          dailyKmStdErr: null,
          rSquared: null,
          inlierCount: 0,
          outlierCount: 0,
          firstReadingDate: null,
          lastReadingDate: null,
          quality: 'INSUFFICIENT_DATA',
        });
      }
      return computeFleetRow(t.truck_id, t.pm_name, t.pm_target_km, {
        currentOdometerKm: t.current_odometer_km,
        avgDailyKm: t.avg_daily_km,
        dailyKmStdErr: t.daily_km_std_err,
        rSquared: t.r_squared,
        inlierCount: t.inlier_count ?? 0,
        outlierCount: t.outlier_count ?? 0,
        firstReadingDate: t.first_reading_date,
        lastReadingDate: t.last_reading_date,
        quality: t.quality ?? 'INSUFFICIENT_DATA',
      });
    });

    return NextResponse.json({ fleet });
  } catch (err) {
    console.error('Failed to load trucks:', err);
    const message = err instanceof Error ? err.message : 'Unknown error.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
