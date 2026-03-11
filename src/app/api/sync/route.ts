import { NextResponse } from 'next/server';
import db from '@/lib/db';

const RC_BASE = 'https://platform.ringcentral.com/restapi';
const DELAY_BETWEEN_REQUESTS_MS = 1200;
const MAX_PAGES = 200;
const TARGET_PER_EXTENSION = 500;

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

const globalAny = global as any;
if (!globalAny.syncRunning) globalAny.syncRunning = false;

export async function POST(request: Request) {
  const { token, extensionIds } = await request.json();

  if (!token || !extensionIds?.length) {
    return NextResponse.json({ error: 'Missing token or extensionIds' }, { status: 400 });
  }

  if (globalAny.syncRunning) {
    return NextResponse.json({ status: 'already_running' });
  }

  const normalizeExtId = (id: string | number) => String(id).replace(/\.0$/, '');
  const extIdStrings = extensionIds.map(normalizeExtId);

  globalAny.syncRunning = true;

  let totalInserted = 0;
  const perExtensionInserted: Record<string, number> = {};
  const lastRequestTime = { value: 0 };

  const doFetchWithDelay = async (url: string, headers: HeadersInit) => {
    const now = Date.now();
    const elapsed = now - lastRequestTime.value;
    if (elapsed < DELAY_BETWEEN_REQUESTS_MS) {
      await sleep(DELAY_BETWEEN_REQUESTS_MS - elapsed);
    }
    lastRequestTime.value = Date.now();
    return fetch(url, { headers });
  };

  try {
    const now = new Date();
    const oneYearAgo = new Date(now);
    oneYearAgo.setFullYear(now.getFullYear() - 1);
    const dateFrom = oneYearAgo.toISOString();
    const dateTo = now.toISOString();

    const baseRetryDelayMs = 60_000;
    for (const extId of extIdStrings) {
      let page = 1;
      let hasMore = true;
      let consecutive429s = 0;

      while (hasMore && page <= MAX_PAGES) {
        const url = `${RC_BASE}/v1.0/account/~/extension/${encodeURIComponent(
          extId
        )}/call-log?view=Detailed&type=Voice&perPage=100&page=${page}&dateFrom=${encodeURIComponent(
          dateFrom
        )}&dateTo=${encodeURIComponent(dateTo)}`;

        let res = await doFetchWithDelay(url, { Authorization: `Bearer ${token}` });
        if (res.status === 429) {
          consecutive429s += 1;

          const retryAfter =
            res.headers.get('retry-after') ||
            res.headers.get('x-rate-limit-window');

          const waitMs = retryAfter
            ? parseInt(retryAfter, 10) * 1000
            : baseRetryDelayMs * Math.pow(2, consecutive429s - 1);

          console.log(
            `[sync] 429 rate limit hit on ext ${extId} page ${page}. Waiting ${waitMs / 1000}s before retry...`
          );

          await sleep(waitMs);
          res = await doFetchWithDelay(url, { Authorization: `Bearer ${token}` });
        } else {
          consecutive429s = 0;
        }

        if (!res.ok) {
          console.error(
            '[sync] RingCentral call-log error for ext',
            extId,
            res.status,
            await res.text()
          );
          break;
        }

        const data = await res.json();
        const records = (data.records || []) as any[];

        // Insert records one by one (no transaction support in serverless)
        for (const c of records) {
          try {
            const from = c.from?.phoneNumber || c.from?.extensionNumber || '';
            const to = c.to?.phoneNumber || c.to?.extensionNumber || '';

            await db.prepare(`
              INSERT INTO calls 
              (id, call_id, from_number, to_number, direction, result, user_extension, start_time, duration, recording_url)
              VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
              ON CONFLICT (call_id) DO NOTHING
            `).run(
              `${c.id}-${c.sessionId}`,
              c.id,
              from,
              to,
              c.direction,
              c.result,
              extId,
              c.startTime,
              c.duration,
              c.recording?.contentUri || ''
            );

            perExtensionInserted[extId] = (perExtensionInserted[extId] || 0) + 1;
            totalInserted += 1;
          } catch (err) {
            console.error('[sync] Failed to insert call:', err);
          }
        }

        if ((perExtensionInserted[extId] || 0) >= TARGET_PER_EXTENSION) {
          hasMore = false;
        } else {
          hasMore = records.length === 100;
        }

        page++;
      }
      await sleep(2000);
    }
  } finally {
    globalAny.syncRunning = false;
  }

  return NextResponse.json({
    status: 'done',
    inserted: totalInserted,
    perExtensionInserted,
  });
}
