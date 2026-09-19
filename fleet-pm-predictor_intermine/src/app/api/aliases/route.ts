import { NextRequest, NextResponse } from 'next/server';
import { addTruckIdAlias, getTruckIdAliases } from '@/lib/db';
import { z } from 'zod';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const aliases = await getTruckIdAliases();
  return NextResponse.json({ aliases });
}

const postSchema = z.object({
  rawLabel: z.string().min(1).max(40),
  truckId: z.string().min(1).max(40),
  note: z.string().max(200).optional(),
});

export async function POST(req: NextRequest) {
  let body: z.infer<typeof postSchema>;
  try {
    body = postSchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: 'Body must be { rawLabel, truckId, note? }.' }, { status: 400 });
  }

  await addTruckIdAlias(body.rawLabel.toUpperCase(), body.truckId.toUpperCase(), body.note);
  const aliases = await getTruckIdAliases();
  return NextResponse.json({ aliases });
}
