import { NextRequest, NextResponse } from 'next/server';
import { cancelSchedule } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Cancels an open scheduled PM (e.g. it was scheduled by mistake, or superseded). */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    await cancelSchedule(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('Failed to cancel schedule entry:', err);
    const message = err instanceof Error ? err.message : 'Unknown error.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
