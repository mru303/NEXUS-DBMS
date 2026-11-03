import clsx from 'clsx';
import { useMemo, useState } from 'react';
import { PROJECT_STATUSES, type Database, type Project } from '../data/types';
import { useActivity } from '../data/store';
import { useData, type DataCtx } from '../lib/useData';
import { navigate, Link } from '../lib/router';
import { openDrawer, openForm } from '../lib/ui';
import { RANGE_LABELS, addDays, daysBetween, resolveRange, today, type RangeKey } from '../lib/dates';
import { date as fmtDate, dateShort, hours, inr, inrCompact, number } from '../lib/format';
import { AGING_BUCKETS, agingBucket, invoiceFinancials, isTaskOverdue, projectStats, sessionDate, sessionHours } from '../lib/selectors';
import { collectedBetween, hoursBetweenDates, hoursSeries, invoicedBetween, outstandingInvoices, pctChange, revenueSeries } from '../lib/analytics';
import { Icon } from '../components/icons';
import { AreaChart, BarChart, Legend, SegmentBar } from '../components/charts';
import { Button, Card, CardHeader, Delta, EmptyState, PageHeader, PriorityBadge, Progress, StatStrip, StatusBadge } from '../components/ui/primitives';
import { ActivityFeed, DueDate, RangeSelect, SectionLink } from '../components/common';

const STATUS_COLOR: Record<string, string> = {
  Planning: 'var(--viz-2)', 'In Progress': 'var(--viz-1)', 'On Hold': 'var(--c-warning)', Completed: 'var(--c-success)', Cancelled: 'var(--viz-muted)',
};

function readRange(): RangeKey {
  try { return (localStorage.getItem('nexus.overview.range') as RangeKey) || '30d'; } catch { return '30d'; }
}

export function OverviewPage() {
  const ctx = useData();
  const { user, role } = ctx;
  const [rangeKey, setRangeKeyRaw] = useState<RangeKey>(readRange);
  const setRangeKey = (k: RangeKey) => { setRangeKeyRaw(k); try { localStorage.setItem('nexus.overview.range', k); } catch { /* ignore */ } };
  const todayLabel = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  return (
    <>
      <PageHeader
        title="Overview"
        description={`${todayLabel} · signed in as ${user.fullName}`}
        actions={
          <>
            <RangeSelect value={rangeKey} onChange={setRangeKey} />
            {ctx.can('write:projects') && <Button variant="primary" icon={<Icon.plus size={16} />} onClick={() => openForm({ kind: 'project' })}>Create project</Button>}
            {!ctx.can('write:projects') && ctx.can('write:invoices') && <Button variant="primary" icon={<Icon.plus size={16} />} onClick={() => openForm({ kind: 'invoice' })}>Create invoice</Button>}
            {role === 'Employee' && <Button variant="primary" icon={<Icon.time size={16} />} onClick={() => navigate('/time')}>Track time</Button>}
          </>
        }
      />
      {role === 'Employee' ? <EmployeeOverview ctx={ctx} rangeKey={rangeKey} /> : role === 'Client' ? <ClientOverview ctx={ctx} rangeKey={rangeKey} /> : <ManagerOverview ctx={ctx} rangeKey={rangeKey} />}
    </>
  );
}

/** Running totals read better than spiky per-day amounts for sparse money events. */
function cumulative(series: { label: string; title: string; collected: number; invoiced: number }[]) {
  let c = 0, i = 0;
  return series.map((s) => {
    c += s.collected;
    i += s.invoiced;
    return { label: s.label, title: `Up to ${s.title}`, values: [c, i] };
  });
}

/* =====================================================================
   Admin / PM / Finance
===================================================================== */
function ManagerOverview({ ctx, rangeKey }: { ctx: DataCtx; rangeKey: RangeKey }) {
  const { db, users } = ctx;
  const activity = useActivity();
  const range = useMemo(() => resolveRange(rangeKey), [rangeKey]);
  const now = today();
  const rangeName = RANGE_LABELS[rangeKey].toLowerCase();

  const m = useMemo(() => {
    const active = db.projects.filter((p) => p.status === 'In Progress');
    const dueSoon = active.filter((p) => daysBetween(now, p.deadline) <= 30);
    const activeClients = db.clients.filter((c) => c.status !== 'Inactive');
    const newClients = db.clients.filter((c) => c.createdAt >= range.from).length;
    const revenue = collectedBetween(db, range.from, range.to);
    const revenuePrev = collectedBetween(db, range.prevFrom, range.prevTo);
    const outstanding = outstandingInvoices(db);
    const outTotal = outstanding.reduce((s, r) => s + r.f.balance, 0);
    const overdueTotal = outstanding.filter((r) => r.f.status === 'Overdue').reduce((s, r) => s + r.f.balance, 0);
    const billable = hoursBetweenDates(db, range.from, range.to, { billable: true });
    const billablePrev = hoursBetweenDates(db, range.prevFrom, range.prevTo, { billable: true });
    const liveTasks = db.tasks.filter((t) => db.projects.find((p) => p.id === t.projectId)?.status !== 'Cancelled');
    const done = liveTasks.filter((t) => t.status === 'Completed').length;
    const series = revenueSeries(db, range);
    const hs = hoursSeries(db, range);
    return { active, dueSoon, activeClients, newClients, revenue, revenuePrev, outstanding, outTotal, overdueTotal, billable, billablePrev, liveTasks, done, series, hs };
  }, [db, range, now]);

  const statusParts = PROJECT_STATUSES.map((s) => ({ key: s, label: s, value: db.projects.filter((p) => p.status === s).length, color: STATUS_COLOR[s] }));
  const recent = [...db.projects].filter((p) => p.status !== 'Cancelled').sort((a, b) => (a.status === 'Completed' ? 1 : 0) - (b.status === 'Completed' ? 1 : 0) || a.deadline.localeCompare(b.deadline)).slice(0, 6);

  return (
    <div className="flex flex-col gap-5">
      <StatStrip items={[
        { label: 'Active projects', value: m.active.length, sub: `${m.dueSoon.length} due within 30 days`, onClick: () => navigate('/projects?status=In%20Progress') },
        { label: 'Clients', value: m.activeClients.length, sub: m.newClients ? `${m.newClients} new in ${rangeName}` : `${db.clients.filter((c) => c.status === 'Prospect').length} prospects`, onClick: () => navigate('/clients') },
        { label: 'Collected', value: inr(m.revenue), sub: <Delta value={pctChange(m.revenue, m.revenuePrev)} />, onClick: () => navigate('/payments') },
        { label: 'Outstanding', value: inr(m.outTotal), sub: <>{m.outstanding.length} invoices{m.overdueTotal ? <>, <span className="text-danger">{inrCompact(m.overdueTotal)} overdue</span></> : ''}</>, onClick: () => navigate('/invoices?status=Outstanding') },
        { label: 'Billable hours', value: `${number(Math.round(m.billable * 10) / 10)} h`, sub: <Delta value={pctChange(m.billable, m.billablePrev)} />, onClick: () => navigate('/time') },
        { label: 'Tasks completed', value: `${m.liveTasks.length ? Math.round((m.done / m.liveTasks.length) * 100) : 0}%`, sub: `${m.done} of ${m.liveTasks.length} · ${db.tasks.filter((t) => isTaskOverdue(t, db.projects.find((p) => p.id === t.projectId))).length} overdue`, onClick: () => navigate('/tasks') },
      ]} />

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader
            title="Revenue"
            description={`Cumulative, ${rangeName}: ${inr(m.revenue)} collected of ${inr(invoicedBetween(db, range.from, range.to))} invoiced`}
          />
          <div className="px-5 pb-1">
            <Legend series={[{ name: 'Collected', color: 'var(--viz-1)' }, { name: 'Invoiced', color: 'var(--viz-2)', kind: 'dashed' }]} onSelect={(i) => navigate(i === 0 ? '/payments' : '/invoices')} />
          </div>
          <div className="px-2 pb-3 sm:px-4">
            <AreaChart
              ariaLabel="Revenue collected and invoiced over time"
              data={cumulative(m.series)}
              series={[{ name: 'Collected', color: 'var(--viz-1)', kind: 'line' }, { name: 'Invoiced', color: 'var(--viz-2)', kind: 'dashed' }]}
              format={(n) => inr(n)}
              axisFormat={inrCompact}
              height={270}
            />
          </div>
        </Card>
        <Card>
          <CardHeader title="Projects by status" description={`${db.projects.length} projects`} actions={<SectionLink to="/projects">All</SectionLink>} />
          <div className="px-5 pb-5">
            <SegmentBar parts={statusParts} onSelect={(k) => navigate(`/projects?status=${encodeURIComponent(k)}`)} />
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <Card className="min-w-0 xl:col-span-2">
          <CardHeader title="Current projects" description="By nearest deadline" actions={<SectionLink to="/projects">View all</SectionLink>} />
          <ProjectTable projects={recent} db={db} ctx={ctx} />
        </Card>
        <Card>
          <CardHeader title="Upcoming deadlines" description="Next 14 days" />
          <UpcomingList ctx={ctx} />
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="Outstanding invoices" description="What clients still owe, by age" actions={<SectionLink to="/invoices?status=Outstanding">View all</SectionLink>} />
          <OutstandingSummary ctx={ctx} />
        </Card>
        <Card>
          <CardHeader title="Recent activity" />
          <ActivityFeed entries={activity} users={users} limit={7} />
        </Card>
      </div>
    </div>
  );
}

function ProjectTable({ projects, db, ctx }: { projects: Project[]; db: Database; ctx: DataCtx }) {
  if (!projects.length) return <EmptyState compact title="No projects yet" body="Create a project to start tracking work." />;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-[13px]">
        <thead className="table-head"><tr><th>Project</th><th>Progress</th><th>Manager</th><th>Deadline</th><th>Status</th></tr></thead>
        <tbody className="table-body">
          {projects.map((p) => {
            const s = projectStats(p, db);
            const mgr = ctx.users.get(p.managerId);
            return (
              <tr key={p.id} className="row-link" onClick={() => navigate(`/projects/${p.id}`)}>
                <td className="max-w-[260px]">
                  <Link to={`/projects/${p.id}`} className="block truncate font-medium text-ink hover:underline" onClick={(e) => e.stopPropagation()}>{p.name}</Link>
                  <span className="block truncate text-xs text-ink-3">{ctx.clients.get(p.clientId)?.companyName}</span>
                </td>
                <td className="w-40">
                  <div className="flex items-center gap-2.5"><Progress value={s.progress} tone={p.status === 'Completed' ? 'success' : 'accent'} className="w-20" label={`${p.name} progress`} /><span className="num text-xs text-ink-2">{s.progress}%</span></div>
                </td>
                <td className="text-ink-2">{mgr?.fullName}</td>
                <td><DueDate date={p.deadline} done={p.status === 'Completed'} /></td>
                <td><StatusBadge status={p.status} /></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function UpcomingList({ ctx, onlyMine }: { ctx: DataCtx; onlyMine?: boolean }) {
  const { db, user, projects, clients, can } = ctx;
  const now = today();
  const horizon = addDays(now, 14);
  const items = useMemo(() => {
    const out: { key: string; date: string; title: string; sub: string; kind: 'task' | 'project' | 'invoice'; onClick: () => void; overdue: boolean }[] = [];
    for (const t of db.tasks) {
      if (t.status === 'Completed') continue;
      if (onlyMine && t.assigneeId !== user.id) continue;
      const p = projects.get(t.projectId);
      if (p?.status === 'Cancelled' || p?.status === 'Completed' || p?.status === 'On Hold') continue;
      if (t.dueDate <= horizon && t.dueDate >= addDays(now, -7)) out.push({ key: t.id, date: t.dueDate, title: t.title, sub: p?.name ?? '', kind: 'task', onClick: () => openDrawer({ kind: 'task', id: t.id }), overdue: t.dueDate < now });
    }
    if (!onlyMine) {
      for (const p of db.projects) if ((p.status === 'In Progress' || p.status === 'Planning') && p.deadline >= now && p.deadline <= horizon) out.push({ key: p.id, date: p.deadline, title: `${p.name} deadline`, sub: clients.get(p.clientId)?.companyName ?? '', kind: 'project', onClick: () => navigate(`/projects/${p.id}`), overdue: false });
      if (can('view:invoices')) for (const r of outstandingInvoices(db)) {
        const inv = db.invoices.find((i) => i.id === r.id)!;
        if (inv.dueDate >= now && inv.dueDate <= horizon) out.push({ key: inv.id, date: inv.dueDate, title: `${inv.number} payment due`, sub: `${inr(r.f.balance)} · ${clients.get(inv.clientId)?.companyName}`, kind: 'invoice', onClick: () => navigate(`/invoices/${inv.id}`), overdue: false });
      }
    }
    return out.sort((a, b) => a.date.localeCompare(b.date)).slice(0, 8);
  }, [db, onlyMine, user.id, projects, clients, can, now, horizon]);
  if (!items.length) return <EmptyState compact icon={<Icon.calendar size={20} />} title="Nothing due in the next two weeks" />;
  return (
    <ul className="px-3 pb-3">
      {items.map((i) => {
        const d = daysBetween(now, i.date);
        return (
          <li key={i.kind + i.key}>
            <button onClick={i.onClick} className="flex w-full items-baseline gap-3 rounded-md px-2 py-2 text-left transition-colors hover:bg-hover">
              <span className={clsx('num w-12 shrink-0 text-[13px]', i.overdue ? 'text-danger' : 'text-ink-3')}>{dateShort(i.date)}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] text-ink">{i.title}</span>
                <span className="block truncate text-xs text-ink-3">{i.sub}</span>
              </span>
              <span className={clsx('shrink-0 text-xs', i.overdue ? 'font-medium text-danger' : d <= 2 ? 'text-warning' : 'text-ink-3')}>
                {i.overdue ? `${-d}d late` : d === 0 ? 'Today' : `${d}d`}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function OutstandingSummary({ ctx }: { ctx: DataCtx }) {
  const { db, clients, can } = ctx;
  const rows = outstandingInvoices(db);
  const total = rows.reduce((s, r) => s + r.f.balance, 0);
  const aging = AGING_BUCKETS.map((b) => ({ label: b, value: rows.filter((r) => agingBucket(r.f) === b).reduce((s, r) => s + r.f.balance, 0) }));
  const agingColors = ['var(--viz-muted)', 'var(--c-warning)', 'var(--viz-2)', 'var(--c-danger)', 'var(--c-danger)'];
  if (!rows.length) return <EmptyState compact icon={<Icon.success size={20} />} title="Every sent invoice is paid" body="Nice — nothing outstanding." />;
  return (
    <div className="grid grid-cols-1 gap-6 px-5 pb-5 lg:grid-cols-[240px_minmax(0,1fr)]">
      <div>
        <p className="text-[13px] text-ink-3">Total outstanding</p>
        <p className="num mt-1 text-[24px] leading-none font-semibold text-ink">{inr(total)}</p>
        <div className="mt-5 flex flex-col gap-2.5">
          {aging.map((a, i) => (
            <div key={a.label}>
              <div className="mb-1 flex justify-between text-xs"><span className="text-ink-2">{a.label}</span><span className="num text-ink">{inr(a.value)}</span></div>
              <div className="h-1 rounded-full bg-line"><div className="h-full rounded-full" style={{ width: `${total ? (a.value / total) * 100 : 0}%`, background: agingColors[i] }} /></div>
            </div>
          ))}
        </div>
      </div>
      <ul className="min-w-0 divide-y divide-line self-start border-y border-line">
        {rows.slice(0, 5).map((r) => {
          const inv = db.invoices.find((i) => i.id === r.id)!;
          return (
            <li key={r.id} className="flex items-center gap-3 py-2.5">
              <button className="min-w-0 flex-1 text-left" onClick={() => navigate(`/invoices/${inv.id}`)}>
                <span className="flex items-center gap-2"><span className="num text-[13px] font-medium text-ink hover:underline">{inv.number}</span><StatusBadge status={r.f.status} /></span>
                <span className="block truncate text-xs text-ink-3">{clients.get(inv.clientId)?.companyName} · due {fmtDate(inv.dueDate)}{r.f.daysOverdue ? ` · ${r.f.daysOverdue}d late` : ''}</span>
              </button>
              <span className="num shrink-0 text-[13px] font-medium text-ink">{inr(r.f.balance)}</span>
              {can('write:payments') && <Button size="sm" variant="ghost" onClick={() => openForm({ kind: 'payment', defaults: { invoiceId: inv.id } })} className="hidden sm:inline-flex">Record</Button>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/* =====================================================================
   Employee
===================================================================== */
function EmployeeOverview({ ctx, rangeKey }: { ctx: DataCtx; rangeKey: RangeKey }) {
  const { db, user, projects, users } = ctx;
  const activity = useActivity();
  const range = useMemo(() => resolveRange(rangeKey), [rangeKey]);
  const now = today();
  const mine = db.tasks.filter((t) => t.assigneeId === user.id);
  const open = mine.filter((t) => t.status !== 'Completed' && projects.get(t.projectId)?.status !== 'Cancelled');
  const dueWeek = open.filter((t) => t.dueDate <= addDays(now, 7));
  const overdue = open.filter((t) => isTaskOverdue(t, projects.get(t.projectId)));
  const myHours = hoursBetweenDates(db, range.from, range.to, { userId: user.id });
  const myHoursPrev = hoursBetweenDates(db, range.prevFrom, range.prevTo, { userId: user.id });
  const myBillable = hoursBetweenDates(db, range.from, range.to, { userId: user.id, billable: true });
  const doneInRange = activity.filter((a) => a.entity === 'task' && a.action === 'completed' && a.actorId === user.id && a.at.slice(0, 10) >= range.from).length;
  const myProjects = db.projects.filter((p) => p.memberIds.includes(user.id) && (p.status === 'In Progress' || p.status === 'Planning'));
  const hs = hoursSeries(db, range, user.id);
  const todayHours = db.sessions.filter((s) => s.userId === user.id && sessionDate(s) === now).reduce((h, s) => h + sessionHours(s), 0);

  return (
    <div className="flex flex-col gap-5">
      <StatStrip items={[
        { label: 'My open tasks', value: open.length, sub: overdue.length ? <span className="text-danger">{overdue.length} overdue</span> : 'None overdue', onClick: () => navigate('/tasks?assignee=me') },
        { label: 'Due this week', value: dueWeek.length, sub: 'Including overdue', onClick: () => navigate('/tasks?assignee=me') },
        { label: 'My hours', value: hours(myHours), sub: <Delta value={pctChange(myHours, myHoursPrev)} label="vs previous" />, onClick: () => navigate('/time') },
        { label: 'Billable share', value: `${myHours ? Math.round((myBillable / myHours) * 100) : 0}%`, sub: `${hours(myBillable)} billable` },
        { label: 'Logged today', value: hours(todayHours), sub: 'Target 7 h' },
        { label: 'Active projects', value: myProjects.length, sub: `${doneInRange} task${doneInRange === 1 ? '' : 's'} completed`, onClick: () => navigate('/projects') },
      ]} />
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="My tasks" description="Open work assigned to you" actions={<SectionLink to="/tasks?assignee=me">Open board</SectionLink>} />
          {open.length === 0 ? <EmptyState compact title="No open tasks" body="Ask your project manager for the next task." /> : (
            <ul className="px-3 pb-3">
              {[...open].sort((a, b) => a.dueDate.localeCompare(b.dueDate)).slice(0, 8).map((t) => (
                <li key={t.id}>
                  <button onClick={() => openDrawer({ kind: 'task', id: t.id })} className="flex w-full items-center gap-3 rounded-lg px-2 py-2.5 text-left hover:bg-hover">
                    <PriorityBadge priority={t.priority} compact />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13.5px] text-ink">{t.title}</span>
                      <span className="block truncate text-xs text-ink-3">{projects.get(t.projectId)?.name}</span>
                    </span>
                    <StatusBadge status={t.status} className="hidden sm:inline-flex" />
                    <DueDate date={t.dueDate} className="w-28 text-right" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card>
          <CardHeader title="My deadlines" description="Next 14 days" />
          <UpcomingList ctx={ctx} onlyMine />
        </Card>
      </div>
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="My hours" description={RANGE_LABELS[rangeKey]} />
          <div className="px-5 pb-1"><Legend series={[{ name: 'Billable', color: 'var(--viz-1)' }, { name: 'Non-billable', color: 'var(--viz-muted)' }]} /></div>
          <div className="px-2 pb-3 sm:px-4">
            <BarChart stacked ariaLabel="My billable and non-billable hours" data={hs.map((x) => ({ label: x.label, values: [x.billable, x.nonBillable] }))} series={[{ name: 'Billable', color: 'var(--viz-1)' }, { name: 'Non-billable', color: 'var(--viz-muted)' }]} format={(n) => hours(n)} axisFormat={(n) => `${n}h`} height={240} />
          </div>
        </Card>
        <Card>
          <CardHeader title="Team activity" />
          <ActivityFeed entries={activity} users={users} limit={6} />
        </Card>
      </div>
    </div>
  );
}

/* =====================================================================
   Client portal
===================================================================== */
function ClientOverview({ ctx, rangeKey }: { ctx: DataCtx; rangeKey: RangeKey }) {
  const { db, user, users, clients } = ctx;
  const activity = useActivity().filter((a) => a.clientId === user.clientId && a.entity !== 'session');
  const range = useMemo(() => resolveRange(rangeKey), [rangeKey]);
  const client = user.clientId ? clients.get(user.clientId) : undefined;
  const live = db.projects.filter((p) => p.status === 'In Progress' || p.status === 'Planning');
  const outstanding = outstandingInvoices(db);
  const totals = db.invoices.reduce((acc, i) => {
    const f = invoiceFinancials(i, db.payments);
    if (f.status === 'Cancelled' || f.status === 'Draft') return acc;
    return { invoiced: acc.invoiced + f.total, paid: acc.paid + f.paid, count: acc.count + 1 };
  }, { invoiced: 0, paid: 0, count: 0 });
  const outTotal = outstanding.reduce((s, r) => s + r.f.balance, 0);
  const hrs = hoursBetweenDates(db, range.from, range.to);
  return (
    <div className="flex flex-col gap-5">
      <StatStrip items={[
        { label: 'Active projects', value: live.length, sub: `${db.projects.length} in total`, onClick: () => navigate('/projects') },
        { label: 'Total invoiced', value: inr(totals.invoiced), sub: `${totals.count} invoices`, onClick: () => navigate('/invoices') },
        { label: 'Paid', value: inr(totals.paid), sub: `${totals.invoiced ? Math.round((totals.paid / totals.invoiced) * 100) : 0}% of invoiced`, onClick: () => navigate('/payments') },
        { label: 'Balance due', value: inr(outTotal), sub: outstanding.some((r) => r.f.status === 'Overdue') ? <span className="text-danger">Includes overdue</span> : 'Nothing overdue', onClick: () => navigate('/invoices?status=Outstanding') },
        { label: 'Hours worked for you', value: hours(hrs), sub: RANGE_LABELS[rangeKey] },
        { label: 'Account manager', value: <span className="text-[16px]">{client ? users.get(client.accountManagerId)?.fullName : '—'}</span>, sub: client ? users.get(client.accountManagerId)?.email : '' },
      ]} />
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="Your projects" description={client?.companyName} />
          <ul className="flex flex-col gap-1 px-3 pb-3">
            {db.projects.map((p) => {
              const s = projectStats(p, db);
              return (
                <li key={p.id}>
                  <button onClick={() => navigate(`/projects/${p.id}`)} className="grid w-full grid-cols-[1fr_auto] items-center gap-x-4 gap-y-2 rounded-lg px-2 py-3 text-left hover:bg-hover sm:grid-cols-[1fr_180px_auto]">
                    <span className="min-w-0"><span className="block truncate text-[13.5px] font-medium text-ink">{p.name}</span><span className="text-xs text-ink-3">Deadline {fmtDate(p.deadline)}</span></span>
                    <span className="col-span-2 flex items-center gap-2 sm:col-span-1"><Progress value={s.progress} tone={p.status === 'Completed' ? 'success' : 'accent'} /><span className="num w-9 text-right text-xs text-ink-2">{s.progress}%</span></span>
                    <StatusBadge status={p.status} className="row-start-1 col-start-2 sm:col-start-3" />
                  </button>
                </li>
              );
            })}
          </ul>
        </Card>
        <Card>
          <CardHeader title="Recent updates" />
          <ActivityFeed entries={activity} users={users} limit={7} empty="No updates yet." />
        </Card>
      </div>
    </div>
  );
}
