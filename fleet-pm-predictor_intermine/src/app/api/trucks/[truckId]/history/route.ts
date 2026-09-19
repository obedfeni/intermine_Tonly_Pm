import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Returns the truck's readings from its most recent ingest batch (for the
 * trend chart: actual points + which ones the ML engine flagged as
 * outliers) plus its run history (for the "predictions over time" list).
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ truckId: string }> }) {
  const { truckId: rawTruckId } = await params;
  const truckId = rawTruckId.toUpperCase();

  const truckRows = (await sql`select id from trucks where truck_id = ${truckId}`) as { id: string }[];
  const truck = truckRows[0];
  if (!truck) return NextResponse.json({ error: 'Truck not found.' }, { status: 404 });

  const latestBatchRows = (await sql`
    select batch_id from readings where truck_id = ${truck.id}
    order by created_at desc limit 1
  `) as { batch_id: string }[];
  const latestBatchId = latestBatchRows[0]?.batch_id ?? null;

  const readings = latestBatchId
    ? await sql`
        select source_row_ref, reading_date, odometer_km, is_inlier
        from readings
        where truck_id = ${truck.id} and batch_id = ${latestBatchId}
        order by coalesce(source_row_ref, 0) asc
      `
    : [];

  const runs = await sql`
    select pr.*, b.source, b.source_name, b.created_at as batch_created_at
    from prediction_runs pr
    join ingest_batches b on b.id = pr.batch_id
    where pr.truck_id = ${truck.id}
    order by pr.created_at desc
    limit 25
  `;

  return NextResponse.json({ readings, runs });
}
