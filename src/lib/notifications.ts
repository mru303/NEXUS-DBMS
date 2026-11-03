import type { Database, Settings, User } from '../data/types';
import { addDays, daysBetween, today } from './dates';
import { inr } from './format';
import { invoiceFinancials, isOutstanding, isTaskOverdue } from './selectors';

export interface Notice {
  id: string;
  tone: 'danger' | 'warning' | 'success' | 'info';
  title: string;
  body: string;
  date: string;
  href?: string;
  taskId?: string;
}

/** Notifications are derived from data (nothing is "sent"), filtered by role & preferences. */
export function buildNotifications(db: Database, user: User, settings: Settings): Notice[] {
  const now = today();
  const out: Notice[] = [];
  const clients = new Map(db.clients.map((c) => [c.id, c]));
  const projects = new Map(db.projects.map((p) => [p.id, p]));
  const seesMoney = user.role !== 'Employee';

  if (settings.notifyOverdueInvoices && seesMoney) {
    for (const inv of db.invoices) {
      const f = invoiceFinancials(inv, db.payments, now);
      if (f.status === 'Overdue') {
        out.push({ id: `inv-od-${inv.id}-${inv.dueDate}`, tone: 'danger', title: `${inv.number} is ${f.daysOverdue} day${f.daysOverdue === 1 ? '' : 's'} overdue`, body: `${inr(f.balance)} outstanding from ${clients.get(inv.clientId)?.companyName ?? 'client'}`, date: inv.dueDate, href: `/invoices/${inv.id}` });
      } else if (isOutstanding(f.status) && inv.dueDate <= addDays(now, 5)) {
        const d = daysBetween(now, inv.dueDate);
        out.push({ id: `inv-due-${inv.id}-${inv.dueDate}`, tone: 'warning', title: `${inv.number} due ${d === 0 ? 'today' : `in ${d} day${d === 1 ? '' : 's'}`}`, body: `${inr(f.balance)} from ${clients.get(inv.clientId)?.companyName ?? 'client'}`, date: inv.dueDate, href: `/invoices/${inv.id}` });
      }
    }
  }
  if (settings.notifyTaskDeadlines && user.role !== 'Client' && user.role !== 'Finance Staff') {
    for (const t of db.tasks) {
      if (user.role === 'Employee' && t.assigneeId !== user.id) continue;
      const p = projects.get(t.projectId);
      if (isTaskOverdue(t, p, now)) {
        out.push({ id: `task-od-${t.id}-${t.dueDate}`, tone: 'danger', title: `Overdue: ${t.title}`, body: `${p?.name} · due ${daysBetween(t.dueDate, now)} days ago`, date: t.dueDate, taskId: t.id });
      } else if (t.status !== 'Completed' && t.dueDate >= now && t.dueDate <= addDays(now, 2) && p?.status !== 'Cancelled') {
        out.push({ id: `task-due-${t.id}-${t.dueDate}`, tone: 'warning', title: `Due soon: ${t.title}`, body: `${p?.name} · ${t.dueDate === now ? 'due today' : 'due in ' + daysBetween(now, t.dueDate) + ' days'}`, date: t.dueDate, taskId: t.id });
      }
    }
  }
  if (settings.notifyPayments && seesMoney) {
    const invs = new Map(db.invoices.map((i) => [i.id, i]));
    for (const p of db.payments) {
      if (p.date < addDays(now, -7)) continue;
      const inv = invs.get(p.invoiceId);
      if (!inv) continue;
      out.push({
        id: `pay-${p.id}-${p.status}`,
        tone: p.status === 'Completed' ? 'success' : p.status === 'Failed' ? 'danger' : 'info',
        title: p.status === 'Completed' ? `Payment received · ${inr(p.amount)}` : `Payment ${p.status.toLowerCase()} · ${inr(p.amount)}`,
        body: `${clients.get(inv.clientId)?.companyName} · ${inv.number} via ${p.method}`,
        date: p.date,
        href: `/payments?q=${p.id}`,
      });
    }
  }
  const rank = { danger: 0, warning: 1, info: 2, success: 3 };
  return out.sort((a, b) => rank[a.tone] - rank[b.tone] || b.date.localeCompare(a.date)).slice(0, 30);
}
