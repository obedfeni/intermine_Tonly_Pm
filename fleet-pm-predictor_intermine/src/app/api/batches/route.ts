import { NextResponse } from 'next/server';
import { getRecentBatches } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const batches = await getRecentBatches(20);
  return NextResponse.json({ batches });
}
