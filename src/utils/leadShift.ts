/**
 * Shift-aware late/on-time logic for leads.
 * Operators work Mon–Fri 7pm–4am, Sat 7pm–2am (Tashkent = UTC+5). Sunday off.
 * SLA: Call within 10 minutes of "working time" (countdown only during shift).
 * Lead arrival (Date column) is in US Central time.
 */

const TASHKENT_UTC_OFFSET_MS = 5 * 60 * 60 * 1000;
const SLA_MINUTES = 10;

/** US Central DST: 2nd Sunday March – 1st Sunday November. Returns offset in hours (e.g. -5 for CDT, -6 for CST). */
function getCentralOffsetHours(year: number, month: number, day: number): number {
  const getFirstSunday = (y: number, m: number) => {
    const first = new Date(Date.UTC(y, m, 1));
    const firstDow = first.getUTCDay();
    return firstDow === 0 ? 1 : 8 - firstDow;
  };
  const marchSecondSun = getFirstSunday(year, 2) + 7;
  const novFirstSun = getFirstSunday(year, 10);
  const d = new Date(Date.UTC(year, month, day));
  const dstStart = new Date(Date.UTC(year, 2, marchSecondSun));
  const dstEnd = new Date(Date.UTC(year, 10, novFirstSun));
  const inDST = d >= dstStart && d < dstEnd;
  return inDST ? -5 : -6;
}

/**
 * Parse a date string as US Central time. Leads arrive in US Central.
 * Handles ISO (2026-03-14, 2026-03-14T20:00:00), date-only, and common formats.
 */
export function parseAsUSCentral(dateStr: string | null | undefined): Date | null {
  if (!dateStr || typeof dateStr !== 'string') return null;
  const s = dateStr.trim();
  if (!s) return null;

  let year: number, month: number, day: number, hour: number, min: number, sec: number;
  const isoMatch = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (isoMatch) {
    [, year, month, day, hour, min, sec] = isoMatch.map((x, i) => (i > 0 ? parseInt(x || '0', 10) : 0));
    month -= 1;
  } else {
    const d = new Date(s);
    if (isNaN(d.getTime())) return null;
    year = d.getFullYear();
    month = d.getMonth();
    day = d.getDate();
    hour = d.getHours();
    min = d.getMinutes();
    sec = d.getSeconds();
  }

  const offset = getCentralOffsetHours(year, month, day);
  const offsetStr = offset >= 0 ? `+${String(offset).padStart(2, '0')}:00` : `-${String(-offset).padStart(2, '0')}:00`;
  const iso = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}T${String(hour).padStart(2, '0')}:${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}${offsetStr}`;
  const parsed = new Date(iso);
  return isNaN(parsed.getTime()) ? null : parsed;
}

/** Get Tashkent local time components from a UTC Date */
function toTashkent(date: Date): { hours: number; minutes: number; dayOfWeek: number } {
  const utcMs = date.getTime();
  const tashkentMs = utcMs + TASHKENT_UTC_OFFSET_MS;
  const t = new Date(tashkentMs);
  return {
    hours: t.getUTCHours() + t.getUTCMinutes() / 60 + t.getUTCMilliseconds() / 3600000,
    minutes: t.getUTCMinutes(),
    dayOfWeek: t.getUTCDay(), // 0=Sun, 1=Mon, ..., 6=Sat
  };
}

/** Check if a UTC moment is within operator shift (Tashkent time) */
function isWithinShift(date: Date): boolean {
  const { hours, dayOfWeek } = toTashkent(date);
  if (dayOfWeek === 0) return false; // Sunday off
  if (dayOfWeek === 6) {
    // Saturday: 7pm (19) to 2am next day (2)
    return hours >= 19 || hours < 2;
  }
  // Mon–Fri: 7pm (19) to 4am next day (4)
  return hours >= 19 || hours < 4;
}

/** Get the start of the next shift after a given UTC date (in UTC) */
function getNextShiftStart(date: Date): Date {
  const { hours, dayOfWeek } = toTashkent(date);

  // If currently in shift, caller uses lead arrival directly
  if (isWithinShift(date)) return date;

  // Outside shift: find next 7pm (19:00) in Tashkent on Mon–Sat
  const tashkentDate = new Date(date.getTime() + TASHKENT_UTC_OFFSET_MS);
  const y = tashkentDate.getUTCFullYear();
  const m = tashkentDate.getUTCMonth();
  const d = tashkentDate.getUTCDate();

  // Outside shift: next 7pm is today (Mon–Sat before 7pm) or Monday (if Sunday)
  const daysToAdd = dayOfWeek === 0 ? 1 : 0;

  // 19:00 Tashkent = 14:00 UTC
  return new Date(Date.UTC(y, m, d + daysToAdd, 14, 0, 0, 0));
}

/** Get effective start of 10-min SLA window (when countdown begins) */
function getEffectiveSlaStart(leadArrival: Date): Date {
  if (isWithinShift(leadArrival)) return leadArrival;
  return getNextShiftStart(leadArrival);
}

export type LeadTimingResult = 'On time' | 'Late' | 'Pending';

/**
 * Determine if a lead was called on time or late.
 * - Lead arrival: when lead came in (Date column or created_at)
 * - Date contacted: when operator called (empty = not yet called)
 * - SLA: 10 minutes of working time from effective start
 */
export function getLeadTiming(
  leadArrival: Date | null,
  dateContacted: Date | null
): LeadTimingResult {
  if (!leadArrival || isNaN(leadArrival.getTime())) return 'Pending';
  if (!dateContacted || isNaN(dateContacted.getTime())) return 'Pending';

  const effectiveStart = getEffectiveSlaStart(leadArrival);
  const deadline = new Date(effectiveStart.getTime() + SLA_MINUTES * 60 * 1000);

  return dateContacted.getTime() <= deadline.getTime() ? 'On time' : 'Late';
}
