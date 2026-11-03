/* ------------------------------------------------------------------
   Derived data — the frontend equivalent of SQL views.
   Nothing here is stored; everything is recomputed from the tables so
   pages can never disagree with each other.
------------------------------------------------------------------- */
import type {
  Client, Database, ID, Invoice, InvoiceStatus, ISODate, Payment, Project, Task, WorkSession,
} from '../data/types';
import { dateOf, daysBetween, hoursBetween, today } from './dates';

export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
export const EPS = 0.005;

/* ---------------- Indexes (O(1) FK lookups) ---------------- */
export function indexBy<T extends { id: ID }>(rows: T[]): Map<ID, T> {
  const m = new Map<ID, T>();
  for (const r of rows) m.set(r.id, r);
  return m;
}

/* ---------------- Work sessions ---------------- */
export function sessionHours(s: WorkSession): number {
  return Math.max(0, hoursBetween(s.start, s.end));
}
export function sessionAmount(s: WorkSession): number {
  return s.billable ? round2(sessionHours(s) * s.hourlyRate) : 0;
}
export function sessionDate(s: WorkSession): ISODate {
  return dateOf(s.start);
}

/* ---------------- Invoices ---------------- */
export interface InvoiceTotals {
  subtotal: number;
  discount: number;
  taxable: number;
  tax: number;
  total: number;
}

export function invoiceTotals(inv: Pick<Invoice, 'lineItems' | 'discountPct' | 'taxRate'>): InvoiceTotals {
  const subtotal = round2(inv.lineItems.reduce((s, li) => s + (Number(li.quantity) || 0) * (Number(li.unitPrice) || 0), 0));
  const discount = round2((subtotal * (Number(inv.discountPct) || 0)) / 100);
  const taxable = round2(subtotal - discount);
  const tax = round2((taxable * (Number(inv.taxRate) || 0)) / 100);
  return { subtotal, discount, taxable, tax, total: round2(taxable + tax) };
}

export interface InvoiceFinancials extends InvoiceTotals {
  paid: number; // Completed payments only
  pending: number; // Pending (e.g. cheque not yet cleared)
  balance: number;
  status: InvoiceStatus;
  daysOverdue: number;
}

export function paymentsFor(invoiceId: ID, payments: Payment[]) {
  return payments.filter((p) => p.invoiceId === invoiceId);
}

export function invoiceFinancials(inv: Invoice, payments: Payment[], now: ISODate = today()): InvoiceFinancials {
  const t = invoiceTotals(inv);
  const own = paymentsFor(inv.id, payments);
  const paid = round2(own.filter((p) => p.status === 'Completed').reduce((s, p) => s + p.amount, 0));
  const pending = round2(own.filter((p) => p.status === 'Pending').reduce((s, p) => s + p.amount, 0));
  const balance = round2(Math.max(0, t.total - paid));
  let status: InvoiceStatus;
  if (inv.state === 'Draft') status = 'Draft';
  else if (inv.state === 'Cancelled') status = 'Cancelled';
  else if (balance <= EPS) status = 'Paid';
  else if (inv.dueDate < now) status = 'Overdue';
  else if (paid > EPS) status = 'Partially Paid';
  else status = 'Sent';
  const daysOverdue = status === 'Overdue' ? daysBetween(inv.dueDate, now) : 0;
  return { ...t, paid, pending, balance, status, daysOverdue };
}

/** Is this invoice money the client still owes? */
export function isOutstanding(status: InvoiceStatus) {
  return status === 'Sent' || status === 'Partially Paid' || status === 'Overdue';
}

/** How much more can be recorded against an invoice (completed + pending count as committed). */
export function payableBalance(inv: Invoice, payments: Payment[], excludePaymentId?: ID): number {
  const { total } = invoiceTotals(inv);
  const committed = paymentsFor(inv.id, payments)
    .filter((p) => p.id !== excludePaymentId && (p.status === 'Completed' || p.status === 'Pending'))
    .reduce((s, p) => s + p.amount, 0);
  return round2(Math.max(0, total - committed));
}

/* ---------------- Tasks & projects ---------------- */
export function taskLoggedHours(taskId: ID, sessions: WorkSession[]) {
  return sessions.filter((s) => s.taskId === taskId).reduce((h, s) => h + sessionHours(s), 0);
}

export function isTaskOverdue(t: Task, project?: Project, now: ISODate = today()) {
  if (t.status === 'Completed') return false;
  if (project && (project.status === 'Cancelled' || project.status === 'Completed')) return false;
  return t.dueDate < now;
}

export interface ProjectStats {
  progress: number; // 0..100, estimated-hours weighted
  taskCount: number;
  doneCount: number;
  estimatedHours: number;
  loggedHours: number;
  billableHours: number;
  billableValue: number;
  costToDate: number; // all logged hours × rate (budget burn)
  invoiced: number;
  collected: number;
  outstanding: number;
  overdueTasks: number;
  daysLeft: number;
  isOverdue: boolean;
}

export function projectStats(p: Project, db: Database, now: ISODate = today()): ProjectStats {
  const tasks = db.tasks.filter((t) => t.projectId === p.id);
  const taskIds = new Set(tasks.map((t) => t.id));
  const sessions = db.sessions.filter((s) => taskIds.has(s.taskId));
  const est = tasks.reduce((s, t) => s + t.estimatedHours, 0);
  const doneEst = tasks.filter((t) => t.status === 'Completed').reduce((s, t) => s + t.estimatedHours, 0);
  let progress = est > 0 ? (doneEst / est) * 100 : 0;
  if (p.status === 'Completed') progress = 100;
  const loggedHours = sessions.reduce((s, x) => s + sessionHours(x), 0);
  const billable = sessions.filter((s) => s.billable);
  const billableHours = billable.reduce((s, x) => s + sessionHours(x), 0);
  const billableValue = billable.reduce((s, x) => s + sessionAmount(x), 0);
  const costToDate = sessions.reduce((s, x) => s + sessionHours(x) * x.hourlyRate, 0);
  let invoiced = 0, collected = 0, outstanding = 0;
  for (const inv of db.invoices) {
    if (inv.projectId !== p.id) continue;
    const f = invoiceFinancials(inv, db.payments, now);
    if (f.status === 'Draft' || f.status === 'Cancelled') continue;
    invoiced += f.total;
    collected += f.paid;
    if (isOutstanding(f.status)) outstanding += f.balance;
  }
  const active = p.status !== 'Completed' && p.status !== 'Cancelled';
  return {
    progress: Math.round(progress),
    taskCount: tasks.length,
    doneCount: tasks.filter((t) => t.status === 'Completed').length,
    estimatedHours: est,
    loggedHours,
    billableHours,
    billableValue,
    costToDate,
    invoiced,
    collected,
    outstanding,
    overdueTasks: tasks.filter((t) => isTaskOverdue(t, p, now)).length,
    daysLeft: daysBetween(now, p.deadline),
    isOverdue: active && p.deadline < now,
  };
}

/* ---------------- Clients ---------------- */
export interface ClientStats {
  projectCount: number;
  activeProjects: number;
  billed: number;
  paid: number;
  outstanding: number;
  overdue: number;
  invoiceCount: number;
}

export function clientStats(c: Client, db: Database, now: ISODate = today()): ClientStats {
  const projects = db.projects.filter((p) => p.clientId === c.id);
  let billed = 0, paid = 0, outstanding = 0, overdue = 0, invoiceCount = 0;
  for (const inv of db.invoices) {
    if (inv.clientId !== c.id) continue;
    invoiceCount++;
    const f = invoiceFinancials(inv, db.payments, now);
    if (f.status === 'Draft' || f.status === 'Cancelled') continue;
    billed += f.total;
    paid += f.paid;
    if (isOutstanding(f.status)) outstanding += f.balance;
    if (f.status === 'Overdue') overdue += f.balance;
  }
  return {
    projectCount: projects.length,
    activeProjects: projects.filter((p) => p.status === 'In Progress' || p.status === 'Planning').length,
    billed,
    paid,
    outstanding,
    overdue,
    invoiceCount,
  };
}

/* ---------------- Payments ---------------- */
export function paymentClientId(p: Payment, invoices: Map<ID, Invoice>): ID | undefined {
  return invoices.get(p.invoiceId)?.clientId;
}

/* ---------------- Aging ---------------- */
export const AGING_BUCKETS = ['Not yet due', '1–30 days', '31–60 days', '61–90 days', '90+ days'] as const;
export function agingBucket(f: InvoiceFinancials): (typeof AGING_BUCKETS)[number] {
  const d = f.daysOverdue;
  if (d <= 0) return 'Not yet due';
  if (d <= 30) return '1–30 days';
  if (d <= 60) return '31–60 days';
  if (d <= 90) return '61–90 days';
  return '90+ days';
}

/* ---------------- Next IDs ---------------- */
export function nextId(prefix: string, rows: { id: ID }[], width = 3): ID {
  let max = 0;
  for (const r of rows) {
    const n = Number(r.id.split('-').pop());
    if (n > max) max = n;
  }
  return `${prefix}-${String(max + 1).padStart(width, '0')}`;
}

/** Indian financial-year invoice number, e.g. NX/26-27/0021 */
export function nextInvoiceNumber(prefix: string, issueDate: ISODate, invoices: Invoice[]): string {
  const [y, m] = issueDate.split('-').map(Number);
  const fy = m >= 4 ? y : y - 1;
  const tag = `${String(fy).slice(2)}-${String(fy + 1).slice(2)}`;
  const series = `${prefix}/${tag}/`;
  let max = 0;
  for (const inv of invoices) {
    if (inv.number.startsWith(series)) max = Math.max(max, Number(inv.number.slice(series.length)) || 0);
  }
  return `${series}${String(max + 1).padStart(4, '0')}`;
}

/** Intra-state supply (CGST + SGST) when the client's GST state code matches ours; otherwise IGST. */
export function isIntraState(client: { gstin: string; state: string } | undefined, companyGstin: string, companyState = 'Maharashtra'): boolean {
  if (!client) return true;
  if (client.gstin) return client.gstin.slice(0, 2) === companyGstin.slice(0, 2);
  return client.state === companyState;
}
