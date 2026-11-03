import type { ISODate, ISODateTime } from '../data/types';

/** All calendar dates are handled in the browser's local time zone. */
export function toISODate(d: Date): ISODate {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function parseDate(s: ISODate): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

export function today(): ISODate {
  return toISODate(new Date());
}

export function addDays(date: ISODate | Date, days: number): ISODate {
  const d = typeof date === 'string' ? parseDate(date) : new Date(date);
  d.setDate(d.getDate() + days);
  return toISODate(d);
}

/** Whole days from a → b (b - a). */
export function daysBetween(a: ISODate, b: ISODate): number {
  return Math.round((parseDate(b).getTime() - parseDate(a).getTime()) / 86400000);
}

export function startOfWeek(date: ISODate): ISODate {
  const d = parseDate(date);
  const dow = (d.getDay() + 6) % 7; // Monday = 0
  d.setDate(d.getDate() - dow);
  return toISODate(d);
}

export function startOfMonth(date: ISODate): ISODate {
  return date.slice(0, 8) + '01';
}

export function addMonths(date: ISODate, n: number): ISODate {
  const d = parseDate(startOfMonth(date));
  d.setMonth(d.getMonth() + n);
  return toISODate(d);
}

export function dateOf(ts: ISODateTime): ISODate {
  return toISODate(new Date(ts));
}

export function hoursBetween(start: ISODateTime, end: ISODateTime): number {
  return (new Date(end).getTime() - new Date(start).getTime()) / 3600000;
}

/** `YYYY-MM-DDTHH:mm` for datetime-local inputs */
export function toLocalInput(ts: ISODateTime): string {
  const d = new Date(ts);
  return `${toISODate(d)}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function fromLocalInput(v: string): ISODateTime {
  return new Date(v).toISOString();
}

export type RangeKey = '7d' | '30d' | '90d' | 'month' | 'quarter' | '6m' | '12m' | 'ytd' | 'all';

export const RANGE_LABELS: Record<RangeKey, string> = {
  '7d': 'Last 7 days',
  '30d': 'Last 30 days',
  '90d': 'Last 90 days',
  month: 'This month',
  quarter: 'This quarter',
  '6m': 'Last 6 months',
  '12m': 'Last 12 months',
  ytd: 'Financial year to date',
  all: 'All time',
};

export interface DateRange {
  from: ISODate;
  to: ISODate;
  /** The equally long period immediately before, for comparisons */
  prevFrom: ISODate;
  prevTo: ISODate;
  bucket: 'day' | 'week' | 'month';
}

export function resolveRange(key: RangeKey, now: ISODate = today()): DateRange {
  let from: ISODate;
  switch (key) {
    case '7d': from = addDays(now, -6); break;
    case '30d': from = addDays(now, -29); break;
    case '90d': from = addDays(now, -89); break;
    case 'month': from = startOfMonth(now); break;
    case 'quarter': {
      const d = parseDate(now);
      from = toISODate(new Date(d.getFullYear(), Math.floor(d.getMonth() / 3) * 3, 1));
      break;
    }
    case '6m': from = addMonths(now, -5); break;
    case '12m': from = addMonths(now, -11); break;
    case 'ytd': {
      // Indian financial year starts 1 April
      const d = parseDate(now);
      const fyStartYear = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1;
      from = `${fyStartYear}-04-01`;
      break;
    }
    case 'all': from = '2020-01-01'; break;
  }
  const span = daysBetween(from, now) + 1;
  const prevTo = addDays(from, -1);
  const prevFrom = addDays(prevTo, -(span - 1));
  const bucket = span <= 31 ? 'day' : span <= 120 ? 'week' : 'month';
  return { from, to: now, prevFrom, prevTo, bucket };
}

export function inRange(d: ISODate, from: ISODate, to: ISODate) {
  return d >= from && d <= to;
}

export interface Bucket {
  key: string;
  label: string;
  from: ISODate;
  to: ISODate;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function buckets(from: ISODate, to: ISODate, unit: 'day' | 'week' | 'month'): Bucket[] {
  const out: Bucket[] = [];
  if (unit === 'day') {
    for (let d = from; d <= to; d = addDays(d, 1)) {
      const p = parseDate(d);
      out.push({ key: d, label: `${p.getDate()} ${MONTHS[p.getMonth()]}`, from: d, to: d });
    }
  } else if (unit === 'week') {
    for (let d = startOfWeek(from); d <= to; d = addDays(d, 7)) {
      const p = parseDate(d);
      out.push({ key: d, label: `${p.getDate()} ${MONTHS[p.getMonth()]}`, from: d < from ? from : d, to: addDays(d, 6) > to ? to : addDays(d, 6) });
    }
  } else {
    for (let d = startOfMonth(from); d <= to; d = addMonths(d, 1)) {
      const p = parseDate(d);
      const end = addDays(addMonths(d, 1), -1);
      out.push({ key: d, label: `${MONTHS[p.getMonth()]} ${String(p.getFullYear()).slice(2)}`, from: d < from ? from : d, to: end > to ? to : end });
    }
  }
  return out;
}

export function monthLabel(d: ISODate) {
  const p = parseDate(d);
  return `${MONTHS[p.getMonth()]} ${p.getFullYear()}`;
}
