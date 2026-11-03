/* Aggregations shared by the Overview and Reports pages (all derived from rows). */
import type { Database, ID } from '../data/types';
import { buckets, inRange, type DateRange } from './dates';
import { invoiceFinancials, invoiceTotals, isOutstanding, sessionDate, sessionHours, type InvoiceFinancials } from './selectors';

export function collectedBetween(db: Database, from: string, to: string) {
  return db.payments.filter((p) => p.status === 'Completed' && inRange(p.date, from, to)).reduce((s, p) => s + p.amount, 0);
}

export function invoicedBetween(db: Database, from: string, to: string) {
  return db.invoices
    .filter((i) => i.state !== 'Draft' && i.state !== 'Cancelled' && inRange(i.issueDate, from, to))
    .reduce((s, i) => s + invoiceTotals(i).total, 0);
}

export function hoursBetweenDates(db: Database, from: string, to: string, opts: { billable?: boolean; userId?: ID } = {}) {
  return db.sessions
    .filter((s) => inRange(sessionDate(s), from, to) && (opts.billable === undefined || s.billable === opts.billable) && (!opts.userId || s.userId === opts.userId))
    .reduce((h, s) => h + sessionHours(s), 0);
}

export function pctChange(cur: number, prev: number): number | null {
  if (prev === 0) return cur === 0 ? 0 : null;
  return ((cur - prev) / prev) * 100;
}

export function revenueSeries(db: Database, range: DateRange) {
  const bs = buckets(range.from, range.to, range.bucket);
  return bs.map((b) => ({
    label: b.label,
    title: b.from === b.to ? b.label : `${b.label} – ${b.to.slice(8, 10)}/${b.to.slice(5, 7)}`,
    from: b.from,
    to: b.to,
    collected: collectedBetween(db, b.from, b.to),
    invoiced: invoicedBetween(db, b.from, b.to),
  }));
}

export function hoursSeries(db: Database, range: DateRange, userId?: ID) {
  return buckets(range.from, range.to, range.bucket).map((b) => ({
    label: b.label,
    from: b.from,
    to: b.to,
    billable: hoursBetweenDates(db, b.from, b.to, { billable: true, userId }),
    nonBillable: hoursBetweenDates(db, b.from, b.to, { billable: false, userId }),
  }));
}

export interface OutstandingRow { id: ID; f: InvoiceFinancials }
export function outstandingInvoices(db: Database): OutstandingRow[] {
  return db.invoices
    .map((i) => ({ id: i.id, f: invoiceFinancials(i, db.payments) }))
    .filter((r) => isOutstanding(r.f.status))
    .sort((a, b) => b.f.daysOverdue - a.f.daysOverdue || b.f.balance - a.f.balance);
}
