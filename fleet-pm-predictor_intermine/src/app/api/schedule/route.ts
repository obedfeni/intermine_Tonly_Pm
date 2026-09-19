import { NextRequest, NextResponse } from 'next/server';
import { createPmSchedule, getActiveScheduleForTruck, getAllScheduledPms, getTruckByTruckId } from '@/lib/db';
import type { ScheduledPm } from '@/lib/types';
import { z } from 'zod';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  truckId: z.string().min(1),
  pmName: z.string().max(120).nullable().optional(),
  targetKm: z.number().finite().nonnegative().nullable().optional(),
  scheduledDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'scheduledDate must be YYYY-MM-DD'),
});

function toScheduledPm(r: { id: string; truck_label: string; pm_name: string | null; target_km: number | null; scheduled_date: string; status: string; created_at: string }): ScheduledPm {
  return {
    id: r.id,
    truckId: r.truck_label,
    pmName: r.pm_name,
    targetKm: r.target_km,
    scheduledDate: r.scheduled_date,
    status: r.status as ScheduledPm['status'],
    createdAt: r.created_at,
  };
}

/** GET every currently-open (SCHEDULED) PM, for the printable/sendable schedule view. */
export async function GET() {
  try {
    const rows = await getAllScheduledPms();
    return NextResponse.json({ schedule: rows.map(toScheduledPm) });
  } catch (err) {
    console.error('Failed to load PM schedule:', err);
    const message = err instanceof Error ? err.message : 'Unknown error.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** Formally schedule a PM — freezes today's predicted date/target km into a fixed schedule entry. */
export async function POST(req: NextRequest) {
  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await req.json());
  } catch (err) {
    const message = err instanceof z.ZodError ? err.issues.map((i) => i.message).join('; ') : 'Invalid request body.';
    return NextResponse.json({ error: message }, { status: 400 });
  }

  try {
    const truckId = body.truckId.toUpperCase();
    const truck = await getTruckByTruckId(truckId);
    if (!truck) return NextResponse.json({ error: 'Truck not found.' }, { status: 404 });

    const existing = await getActiveScheduleForTruck(truck.id);
    if (existing) {
      return NextResponse.json(
        { error: 'This truck already has an open scheduled PM.', entry: toScheduledPm({ ...existing, truck_label: truckId }) },
        { status: 409 }
      );
    }

    const entry = await createPmSchedule({
      truckDbId: truck.id,
      pmName: body.pmName ?? null,
      targetKm: body.targetKm ?? null,
      scheduledDate: body.scheduledDate,
    });

    return NextResponse.json({ entry: toScheduledPm({ ...entry, truck_label: truckId }) });
  } catch (err) {
    console.error('Failed to create PM schedule entry:', err);
    const message = err instanceof Error ? err.message : 'Unknown error.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
