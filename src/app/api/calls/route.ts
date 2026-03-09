import { NextResponse } from 'next/server';
import db from '@/lib/db';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const range = searchParams.get('range') || 'all';
  const extensionIds = searchParams.get('extensionIds')?.split(',') || [];

  if (!extensionIds.length) {
    return NextResponse.json({ error: 'Missing extensionIds' }, { status: 400 });
  }

  const now = new Date();
  let cutoff: Date | null = null;

  if (range === 'daily') {
    cutoff = new Date(now);
    cutoff.setDate(now.getDate() - 1);
  } else if (range === 'weekly') {
    cutoff = new Date(now);
    cutoff.setDate(now.getDate() - 7);
  } else if (range === 'monthly') {
    cutoff = new Date(now);
    cutoff.setMonth(now.getMonth() - 1);
  } else if (range === 'yearly') {
    cutoff = new Date(now);
    cutoff.setFullYear(now.getFullYear() - 1);
  } else if (range === 'custom') {
    const from = searchParams.get('dateFrom');
    if (from) cutoff = new Date(from);
  }

  // Build placeholders for IN clause and normalize extension IDs (strip any trailing ".0")
  const normalizeExtId = (id: string) => id.replace(/\.0$/, '');
  const normalizedIds = extensionIds.map(normalizeExtId);
  const placeholders = normalizedIds.map(() => '?').join(',');

  let rows: any[];
  if (cutoff) {
    rows = db.prepare(
      `SELECT * FROM calls WHERE REPLACE(user_extension, '.0', '') IN (${placeholders}) AND start_time >= ? ORDER BY start_time DESC`
    ).all(...normalizedIds, cutoff.toISOString());
  } else {
    rows = db.prepare(
      `SELECT * FROM calls WHERE REPLACE(user_extension, '.0', '') IN (${placeholders}) ORDER BY start_time DESC`
    ).all(...normalizedIds);
  }

  // Enforce a hard cap of last 500 calls per user/extension
  const MAX_PER_EXTENSION = 500;
  const perExtensionCount: Record<string, number> = {};

  const limitedRows = rows.filter((r: any) => {
    const ext = normalizeExtId(String(r.user_extension));
    const current = perExtensionCount[ext] ?? 0;
    if (current >= MAX_PER_EXTENSION) return false;
    perExtensionCount[ext] = current + 1;
    return true;
  });

  const records = limitedRows.map((r: any) => ({
    id: r.call_id,
    direction: r.direction,
    result: r.result,
    startTime: r.start_time,
    duration: r.duration,
    from: { phoneNumber: r.from_number },
    to: { phoneNumber: r.to_number },
    extension: { id: normalizeExtId(String(r.user_extension)) }
  }));

  return NextResponse.json({ records, total: records.length });
}
