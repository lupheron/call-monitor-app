import { NextResponse } from 'next/server';

const MONDAY_API = 'https://api.monday.com/v2';

// Map Monday users to their board names (New leads + Follow up)
const USER_BOARD_MAP: Record<string, string[]> = {
  'Alex Chester': ['New leads Alex', 'Follow up Alex'],
  'Ethan': ['New leads Ethan', 'Follow up Ethan'],
  'Winston': ['New leads Winston', 'Follow up Winston'],
  'Jessica': ['New leads Jessica', 'Follow up Jessica'],
};

const ALL_BOARD_NAMES = [
  'New leads Fred', 'New leads Ethan', 'New leads', 'HR Process BP',
  'New leads Alex', 'New leads Bruce', 'Follow up Fred', 'Invalid leads',
  'Follow up Alex', 'Follow up Ethan', 'Follow up Bruce',
  'New leads Jessica', 'Follow up Jessica', 'New leads Winston', 'Follow up Winston',
];

const STATUS_KEY_MAP: Record<string, string> = {
  'not called': 'notCalled',
  'notcalled': 'notCalled',
  'follow up': 'followUp',
  'followup': 'followUp',
  'hired': 'hired',
  'started load': 'startedLoad',
  'startedload': 'startedLoad',
  'n/a': 'na',
  'na': 'na',
  'rejected': 'rejected',
  'not valid lead': 'notValidLead',
  'notvalidlead': 'notValidLead',
  'not valid': 'notValidLead',
  'not on time call': 'notOnTimeCall',
  'notontimecall': 'notOnTimeCall',
  'not on time': 'notOnTimeCall',
};

function normalizeLabel(label: string): string {
  const n = (label || '').toLowerCase().trim().replace(/\s+/g, '');
  if (STATUS_KEY_MAP[n]) return STATUS_KEY_MAP[n];
  const withSpace = (label || '').toLowerCase().trim();
  return STATUS_KEY_MAP[withSpace] || withSpace.replace(/\s+/g, '');
}

function resolveStatKey(label: string): string | null {
  const n = normalizeLabel(label);
  const keys = ['notCalled', 'followUp', 'hired', 'startedLoad', 'na', 'rejected', 'notValidLead', 'notOnTimeCall'];
  if (keys.includes(n)) return n;
  const withSpace = (label || '').toLowerCase().trim();
  for (const [k, v] of Object.entries(STATUS_KEY_MAP)) {
    if (k === withSpace || k === n) return v;
  }
  return null;
}

async function mondayGraphql(query: string, variables?: Record<string, unknown>) {
  const token = process.env.MONDAY_API_TOKEN;
  if (!token) {
    throw new Error('MONDAY_API_TOKEN is not set');
  }
  const res = await fetch(MONDAY_API, {
    method: 'POST',
    headers: {
      'Authorization': token,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query, variables }),
    cache: 'no-store',
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Monday API error ${res.status}: ${text}`);
  }
  return res.json();
}

export const revalidate = 120;

function getThisMonthRange(): { from: string; to: string } {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), 1);
  const to = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
  return {
    from: from.toISOString(),
    to: to.toISOString(),
  };
}

export async function GET(request: Request) {
  try {
    const token = process.env.MONDAY_API_TOKEN;
    if (!token) {
      return NextResponse.json({ error: 'MONDAY_API_TOKEN is not set' }, { status: 500 });
    }

    const { searchParams } = new URL(request.url);
    const datePreset = searchParams.get('datePreset') || 'this_month';
    let monthRange: { from: string; to: string } | null = null;
    if (datePreset === 'this_month') {
      monthRange = getThisMonthRange();
    } else if (datePreset === 'last_month') {
      const now = new Date();
      const from = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const to = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
      monthRange = { from: from.toISOString(), to: to.toISOString() };
    }

    // 1. Fetch all boards (limit 100)
    const boardsQuery = `
      query {
        boards(limit: 100) {
          id
          name
        }
      }
    `;
    const boardsRes = await mondayGraphql(boardsQuery);
    const allBoards = boardsRes?.data?.boards || [];
    const matchedBoards = allBoards.filter((b: { name: string }) =>
      ALL_BOARD_NAMES.some((n) => (b.name || '').trim() === n.trim())
    );

    if (matchedBoards.length === 0) {
      return NextResponse.json({
        totalLeads: 0,
        notCalled: 0,
        followUp: 0,
        hired: 0,
        startedLoad: 0,
        na: 0,
        rejected: 0,
        notValidLead: 0,
        notOnTimeCall: 0,
        firstTouchStatus: {},
        secondTouchStatus: {},
        boardBreakdown: [],
        boardCount: 0,
      });
    }

    // 2. Fetch items per board (one request per board to avoid timeout on large combined query)
    const itemsQuery = `
      query($boardId: ID!) {
        boards(ids: [$boardId]) {
          id
          name
          items_page(limit: 500) {
            cursor
            items {
              id
              name
              created_at
              column_values {
                id
                type
                text
                value
                column { id title }
              }
            }
          }
        }
      }
    `;

    const boards: Array<{
      id: string;
      name: string;
      items_page?: { items: Array<{ created_at?: string; column_values: unknown[] }> };
    }> = [];

    for (const board of matchedBoards) {
      const res = await mondayGraphql(itemsQuery, { boardId: board.id });
      const b = res?.data?.boards?.[0];
      if (b) boards.push(b);
      // Small delay between requests to avoid rate limiting
      await new Promise((r) => setTimeout(r, 300));
    }

    const stats = {
      totalLeads: 0,
      notCalled: 0,
      followUp: 0,
      hired: 0,
      startedLoad: 0,
      na: 0,
      rejected: 0,
      notValidLead: 0,
      notOnTimeCall: 0,
    };
    const firstTouchStatus: Record<string, number> = {};
    const secondTouchStatus: Record<string, number> = {};
    const boardBreakdown: { boardId: string; boardName: string; count: number }[] = [];

    for (const board of boards) {
      let items = board?.items_page?.items || [];
      if (monthRange) {
        items = items.filter((item: { created_at?: string }) => {
          const createdAt = item.created_at;
          if (!createdAt) return false;
          const d = new Date(createdAt);
          return d >= new Date(monthRange.from) && d <= new Date(monthRange.to);
        });
      }
      let boardTotal = 0;
      for (const item of items) {
        stats.totalLeads += 1;
        boardTotal += 1;
        const columnValues = item.column_values || [];
        for (const col of columnValues) {
          if (col.type !== 'color' && col.type !== 'status') continue;
          const title = ((col.column?.title ?? col.title) || '').toLowerCase();
          const isSecondTouch = title.includes('second') || title.includes('after');
          let label = col.text || '';
          if (!label && col.value) {
            try {
              const v = typeof col.value === 'string' ? JSON.parse(col.value) : col.value;
              label = v?.label ?? v?.text ?? '';
            } catch {
              label = String(col.value || '');
            }
          }
          if (!label) continue;
          const statKey = resolveStatKey(label);
          if (statKey && statKey in stats) {
            (stats as Record<string, number>)[statKey] += 1;
          }
          const target = isSecondTouch ? secondTouchStatus : firstTouchStatus;
          target[label] = (target[label] || 0) + 1;
        }
      }
      boardBreakdown.push({
        boardId: String(board.id),
        boardName: board.name || 'Unknown',
        count: boardTotal,
      });
    }

    // Debug: if all stats are 0, log raw column_values for first item
    const totalStats = stats.notCalled + stats.followUp + stats.hired + stats.startedLoad +
      stats.na + stats.rejected + stats.notValidLead + stats.notOnTimeCall;
    if (totalStats === 0 && stats.totalLeads > 0) {
      const firstItem = boards[0]?.items_page?.items?.[0];
      if (firstItem?.column_values) {
        console.log('[monday] Sample column_values (adjust matching if needed):', JSON.stringify(firstItem.column_values, null, 2));
      }
    }

    return NextResponse.json({
      ...stats,
      firstTouchStatus,
      secondTouchStatus,
      boardBreakdown,
      boardCount: matchedBoards.length,
    });
  } catch (err: unknown) {
    console.error('[monday] Error:', err);
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
