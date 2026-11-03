import type { ISODate, ISODateTime } from '../data/types';
import { daysBetween, parseDate, today } from './dates';

const inr0 = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0, minimumFractionDigits: 0 });
const inr2 = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2, minimumFractionDigits: 2 });
const num = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 1 });

/** ₹4,85,000 — Indian digit grouping. Pass `exact` for paise. */
export function inr(n: number, exact = false): string {
  if (!Number.isFinite(n)) return '₹0';
  if (exact) return inr2.format(n);
  return inr0.format(Math.round(n));
}

/** ₹4.85L / ₹1.2Cr / ₹48K for chart axes and tight spaces */
export function inrCompact(n: number): string {
  const a = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (a >= 1e7) return `${sign}₹${trim(a / 1e7)}Cr`;
  if (a >= 1e5) return `${sign}₹${trim(a / 1e5)}L`;
  if (a >= 1e3) return `${sign}₹${trim(a / 1e3)}K`;
  return `${sign}₹${Math.round(a)}`;
}
function trim(v: number) {
  return v >= 100 ? v.toFixed(0) : v >= 10 ? v.toFixed(1).replace(/\.0$/, '') : v.toFixed(2).replace(/\.?0+$/, '');
}

export function number(n: number): string {
  return num.format(n);
}

export function hours(h: number): string {
  return `${num.format(Math.round(h * 10) / 10)} h`;
}

/** 2h 45m */
export function duration(h: number): string {
  const totalMin = Math.round(h * 60);
  const hh = Math.floor(totalMin / 60);
  const mm = totalMin % 60;
  if (hh === 0) return `${mm}m`;
  return mm ? `${hh}h ${mm}m` : `${hh}h`;
}

export function clock(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const hh = Math.floor(s / 3600);
  const mm = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** 22 Oct 2026 */
export function date(d: ISODate | undefined | null): string {
  if (!d) return '—';
  const p = parseDate(d);
  return `${p.getDate()} ${MONTHS[p.getMonth()]} ${p.getFullYear()}`;
}

/** 22 Oct */
export function dateShort(d: ISODate): string {
  const p = parseDate(d);
  return `${p.getDate()} ${MONTHS[p.getMonth()]}`;
}

export function time(ts: ISODateTime): string {
  return new Date(ts).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true });
}

export function dateTime(ts: ISODateTime): string {
  const d = new Date(ts);
  return `${d.getDate()} ${MONTHS[d.getMonth()]}, ${time(ts)}`;
}

/** "in 3 days", "today", "2 days ago" */
export function relativeDay(d: ISODate, from: ISODate = today()): string {
  const diff = daysBetween(from, d);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  if (diff > 0) return diff < 45 ? `In ${diff} days` : `In ${Math.round(diff / 30)} months`;
  const a = -diff;
  return a < 45 ? `${a} days ago` : `${Math.round(a / 30)} months ago`;
}

export function timeAgo(ts: ISODateTime): string {
  const s = (Date.now() - new Date(ts).getTime()) / 1000;
  if (s < 60) return 'Just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  const d = Math.floor(s / 86400);
  if (d < 30) return `${d}d ago`;
  return date(ts.slice(0, 10));
}

export function pct(v: number, digits = 0): string {
  return `${v.toFixed(digits)}%`;
}

export function initials(name: string): string {
  const parts = name
    .replace(/^(Dr|Mr|Ms|Mrs)\.?\s+/i, '')
    .trim()
    .split(/\s+/)
    .filter((w, i, all) => i === 0 || all.length < 2 || !/^(pvt|ltd|llp|private|limited|inc)\.?$/i.test(w));
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

export function pluralize(n: number, one: string, many = one + 's') {
  return `${n} ${n === 1 ? one : many}`;
}
