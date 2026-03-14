import { NextResponse } from 'next/server';

const MONDAY_API = 'https://api.monday.com/v2';

const USER_BOARD_MAP: Record<string, string[]> = {
  'Alex Chester': ['New leads Alex', 'Follow up Alex'],
  'Ethan': ['New leads Ethan', 'Follow up Ethan'],
  'Winston': ['New leads Winston', 'Follow up Winston'],
  'Jessica': ['New leads Jessica', 'Follow up Jessica'],
};

export const MONDAY_USERS = ['Alex Chester', 'Ethan', 'Winston', 'Jessica'] as const;

async function mondayGraphql(query: string, variables?: Record<string, unknown>) {
  const token = process.env.MONDAY_API_TOKEN;
  if (!token) throw new Error('MONDAY_API_TOKEN is not set');
  const res = await fetch(MONDAY_API, {
    method: 'POST',
    headers: { Authorization: token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
    cache: 'no-store',
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Monday API error ${res.status}: ${text}`);
  }
  return res.json();
}

function getThisMonthRange(): { from: Date; to: Date } {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), 1);
  const to = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
  return { from, to };
}

function parseDateFromColumn(col: { text?: string; value?: string }): Date | null {
  const text = col.text?.trim();
  const val = col.value;
  if (text) {
    const d = new Date(text);
    if (!isNaN(d.getTime())) return d;
  }
  if (val) {
    try {
      const v = typeof val === 'string' ? JSON.parse(val) : val;
      const dateStr = v?.date ?? v?.startDate ?? v?.start_date;
      if (dateStr) {
        const d = new Date(dateStr);
        if (!isNaN(d.getTime())) return d;
      }
    } catch {
      // ignore
    }
  }
  return null;
}

function parseDateColumn(val: string): Date | null {
  if (!val || !val.trim()) return null;
  const s = val.trim();
  try {
    const parsed = new Date(s);
    if (!isNaN(parsed.getTime())) return parsed;
  } catch {
    // ignore
  }
  try {
    const v = JSON.parse(s);
    const dateStr = v?.date ?? v?.startDate;
    if (dateStr) {
      const d = new Date(dateStr);
      if (!isNaN(d.getTime())) return d;
    }
  } catch {
    // ignore
  }
  return null;
}

const STATUS_VALUES = ['Not touched', 'Follow up', 'Rejected', 'N/A', 'Not valid lead', 'Processing'] as const;

function getColumnValue(col: { column?: { title?: string }; text?: string; value?: string; type?: string }): string {
  if (col.text) return String(col.text).trim();
  if (col.value) {
    try {
      const v = typeof col.value === 'string' ? JSON.parse(col.value) : col.value;
      const raw = v?.label ?? v?.text ?? v?.name ?? v?.status_label ?? String(col.value ?? '');
      return String(raw).trim();
    } catch {
      return String(col.value ?? '').trim();
    }
  }
  return '';
}

function normalizeStatus(raw: string): string {
  const s = (raw || '').trim();
  if (!s) return 'Not touched';
  if (STATUS_VALUES.includes(s as (typeof STATUS_VALUES)[number])) return s;
  const lower = s.toLowerCase();
  if (lower.includes('n/a') || lower === 'na') return 'N/A';
  if (lower.includes('process')) return 'Processing';
  if (lower.includes('not valid') || lower.includes('invalid')) return 'Not valid lead';
  if (lower.includes('follow')) return 'Follow up';
  if (lower.includes('not touch') || lower.includes('not called')) return 'Not touched';
  if (lower.includes('reject')) return 'Rejected';
  return 'Other';
}

export interface MondayLead {
  id: string;
  name: string;
  createdAt: string;
  columns: Record<string, string>;
  status: string;
  company: string;
  date: string;
  platform: string;
  position: string;
  type: string;
  state: string;
  number: string;
  email: string;
  note: string;
  dateContact: string;
}

export async function GET(request: Request) {
  try {
    const token = process.env.MONDAY_API_TOKEN;
    if (!token) {
      return NextResponse.json({ error: 'MONDAY_API_TOKEN is not set' }, { status: 500 });
    }

    const { searchParams } = new URL(request.url);
    const userName = searchParams.get('user');
    if (!userName || !USER_BOARD_MAP[userName]) {
      return NextResponse.json({ error: 'Invalid user. Use: Alex Chester, Ethan, Winston, Jessica' }, { status: 400 });
    }

    const boardNames = USER_BOARD_MAP[userName];
    const { from: monthFrom, to: monthTo } = getThisMonthRange();

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
      boardNames.some((n) => (b.name || '').trim() === n.trim())
    );

    const itemsPageFields = `
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
    `;

    const boardsItemsQuery = `
      query($boardId: ID!) {
        boards(ids: [$boardId]) {
          id
          name
          items_page(limit: 500) {
            cursor
            items { ${itemsPageFields} }
          }
        }
      }
    `;

    const nextItemsQuery = `
      query($cursor: String!) {
        next_items_page(limit: 500, cursor: $cursor) {
          cursor
          items { ${itemsPageFields} }
        }
      }
    `;

    const allLeads: MondayLead[] = [];
    const statusCounts: Record<string, number> = {
      'N/A': 0,
      'Processing': 0,
      'Not valid lead': 0,
      'Follow up': 0,
      'Not touched': 0,
      'Rejected': 0,
      'Other': 0,
    };

    type MondayItem = { id: string; name?: string; created_at?: string; column_values?: { column?: { id?: string; title?: string }; id?: string; type?: string; text?: string; value?: string }[] };

    for (const board of matchedBoards) {
      let cursor: string | null = null;
      let items: MondayItem[] = [];

      do {
        let res: { data?: { boards?: { items_page?: { cursor?: string; items?: MondayItem[] } }[]; next_items_page?: { cursor?: string; items?: MondayItem[] } } };
        if (!cursor) {
          res = await mondayGraphql(boardsItemsQuery, { boardId: board.id });
          const page = res?.data?.boards?.[0]?.items_page;
          items = page?.items || [];
          cursor = page?.cursor || null;
        } else {
          res = await mondayGraphql(nextItemsQuery, { cursor });
          const page = res?.data?.next_items_page;
          items = page?.items || [];
          cursor = page?.cursor || null;
        }

        for (const item of items) {
        const columns: Record<string, string> = {};
        let status = '';
        let company = '';
        let date = '';
        let platform = '';
        let position = '';
        let type = '';
        let state = '';
        let number = '';
        let email = '';
        let note = '';
        let dateContact = '';
        let leadDateParsed: Date | null = null;

        let statusFromStatus2 = '';
        let statusFromStatus = '';
        let statusFromAny = '';
        for (const col of item.column_values || []) {
          const title = (col.column?.title || '').toLowerCase();
          const rawTitle = (col.column?.title || '').trim();
          const val = getColumnValue(col);
          columns[col.column?.title || col.column?.id || ''] = val;

          // Only use explicit Status columns - NEVER Person/People/Assignee (those have names like "Ethan")
          const isPersonColumn = title.includes('person') || title.includes('people') || title.includes('assignee') || title.includes('owner') || col.type === 'people';
          if (isPersonColumn) continue;

          if (rawTitle === 'Status 2' || title === 'status 2') statusFromStatus2 = val;
          else if (rawTitle === 'Status' || title === 'status') statusFromStatus = val;
          else if (title.includes('status') && val && col.type === 'status') statusFromAny = val;
          if (title.includes('company')) company = val;
          if (title === 'date' && !title.includes('contact')) {
            date = val;
            leadDateParsed = parseDateFromColumn(col) ?? parseDateColumn(val);
          }
          if (title.includes('platform')) platform = val;
          if (title.includes('position')) position = val;
          if (title === 'type') type = val;
          if (title.includes('state')) state = val;
          if (title.includes('number') || title === 'phone') number = val;
          if (title.includes('email')) email = val;
          if (title.includes('note')) note = val;
          if (title.includes('date contact') || title.includes('datecontact')) dateContact = val;
        }
        status = statusFromStatus2 || statusFromStatus || statusFromAny || '';

        // Filter by "Date" column (lead date) - NOT "Date contacted". Fall back to created_at if Date is empty.
        const leadDate = leadDateParsed ?? parseDateColumn(date) ?? null;
        const createdAt = item.created_at ? new Date(item.created_at) : null;
        const dateForFilter = leadDate ?? createdAt;
        if (dateForFilter && (dateForFilter < monthFrom || dateForFilter > monthTo)) continue;

        const displayStatus = normalizeStatus(status || '');
        const lead: MondayLead = {
          id: item.id,
          name: item.name || '',
          createdAt: item.created_at || '',
          columns,
          status: displayStatus,
          company: company || '',
          date,
          platform,
          position,
          type,
          state,
          number,
          email,
          note,
          dateContact,
        };

        allLeads.push(lead);

        const statusKey = Object.keys(statusCounts).includes(displayStatus) ? displayStatus : 'Other';
        statusCounts[statusKey] = (statusCounts[statusKey] || 0) + 1;
        }

      } while (cursor);

      await new Promise((r) => setTimeout(r, 300));
    }

    return NextResponse.json({
      user: userName,
      totalLeads: allLeads.length,
      statusCounts,
      leads: allLeads,
    });
  } catch (err: unknown) {
    console.error('[monday/leads] Error:', err);
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
