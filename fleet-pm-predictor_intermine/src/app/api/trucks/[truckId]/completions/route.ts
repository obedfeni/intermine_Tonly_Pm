import { NextRequest, NextResponse } from 'next/server';
import {
  getActiveScheduleForTruck,
  getPmCompletionsForTruck,
  getTruckByTruckId,
  insertPmCompletion,
  markScheduleCompleted,
} from '@/lib/db';
import type { PmCompletion } from '@/lib/types';
import { z } from 'zod';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  pmName: z.string().max(120).nullable().optional(),
  odometerKm: z.number().finite().nonnegative(),
  completedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'completedDate must be YYYY-MM-DD'),
  notes: z.string().max(500).nullable().optional(),
  /** If this completion is closing out a specific scheduled PM, pass its id explicitly. */
  scheduleId: z.string().uuid().nullable().optional(),
});

/** GET the PM completion history for one truck — shown in the truck detail panel. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ truckId: string }> }) {
  const { truckId: rawTruckId } = await params;
  const truckId = rawTruckId.toUpperCase();

  try {
    const truck = await getTruckByTruckId(truckId);
    if (!truck) return NextResponse.json({ error: 'Truck not found.' }, { status: 404 });

    const rows = await getPmCompletionsForTruck(truck.id);
    const completions: PmCompletion[] = rows.map((r) => ({
      id: r.id,
      truckId,
      pmName: r.pm_name,
      odometerKm: r.odometer_km,
      completedDate: r.completed_date,
      notes: r.notes,
      createdAt: r.created_at,
    }));

    return NextResponse.json({ completions });
  } catch (err) {
    console.error('Failed to load PM history:', err);
    const message = err instanceof Error ? err.message : 'Unknown error.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * Log a PM as done: truck, PM name, and the odometer reading at the moment
 * it happened — all entered by the user, not derived from any prediction.
 * If a scheduled PM is open for this truck (either passed explicitly as
 * scheduleId, or the truck's one active schedule entry if not), it's closed
 * out automatically so the schedule view doesn't need a separate step.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ truckId: string }> }) {
  const { truckId: rawTruckId } = await params;
  const truckId = rawTruckId.toUpperCase();

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await req.json());
  } catch (err) {
    const message = err instanceof z.ZodError ? err.issues.map((i) => i.message).join('; ') : 'Invalid request body.';
    return NextResponse.json({ error: message }, { status: 400 });
  }

  try {
    const truck = await getTruckByTruckId(truckId);
    if (!truck) return NextResponse.json({ error: 'Truck not found.' }, { status: 404 });

    const completion = await insertPmCompletion({
      truckDbId: truck.id,
      pmName: body.pmName ?? null,
      odometerKm: body.odometerKm,
      completedDate: body.completedDate,
      notes: body.notes ?? null,
    });

    const scheduleId = body.scheduleId ?? (await getActiveScheduleForTruck(truck.id))?.id ?? null;
    if (scheduleId) {
      try {
        await markScheduleCompleted(scheduleId, completion.id);
      } catch {
        // The schedule entry may have already been resolved/cancelled by the
        // time this runs — the completion log itself is still valid, so
        // don't fail the whole request over a stale schedule link.
      }
    }

    const result: PmCompletion = {
      id: completion.id,
      truckId,
      pmName: completion.pm_name,
      odometerKm: completion.odometer_km,
      completedDate: completion.completed_date,
      notes: completion.notes,
      createdAt: completion.created_at,
    };

    return NextResponse.json({ completion: result });
  } catch (err) {
    console.error('Failed to log PM completion:', err);
    const message = err instanceof Error ? err.message : 'Unknown error.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
