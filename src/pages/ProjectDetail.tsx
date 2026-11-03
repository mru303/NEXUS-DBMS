import { useMemo } from 'react';
import { TASK_STATUSES } from '../data/types';
import { getState, useActivity } from '../data/store';
import { useData } from '../lib/useData';
import { navigate, useQueryState, Link } from '../lib/router';
import { openDrawer, openForm } from '../lib/ui';
import { date, dateTime, duration, hours, inr } from '../lib/format';
import { invoiceFinancials, projectStats, sessionAmount, sessionHours, taskLoggedHours } from '../lib/selectors';
import { Icon } from '../components/icons';
import { Menu } from '../components/ui/overlays';
import { Avatar, Badge, Button, Card, CardHeader, EmptyState, IdChip, PageHeader, PriorityBadge, Progress, StatStrip, StatusBadge, Tabs } from '../components/ui/primitives';
import { ActivityFeed, DueDate, MetaItem, UserCell } from '../components/common';
import { confirmDeleteProject } from './Projects';

type Tab = 'overview' | 'tasks' | 'sessions' | 'billing' | 'activity';

export function ProjectDetailPage({ id }: { id: string }) {
  const { db, users, clients, can, role } = useData();
  const activityAll = useActivity();
  const [tab, setTab] = useQueryState('tab', 'overview');
  const p = db.projects.find((x) => x.id === id);
  const stats = useMemo(() => (p ? projectStats(p, db) : null), [p, db]);
  const tasks = useMemo(() => db.tasks.filter((t) => t.projectId === id), [db.tasks, id]);
  const taskIds = useMemo(() => new Set(tasks.map((t) => t.id)), [tasks]);
  const sessions = useMemo(() => db.sessions.filter((s) => taskIds.has(s.taskId)).sort((a, b) => b.start.localeCompare(a.start)), [db.sessions, taskIds]);
  const invoices = useMemo(() => db.invoices.filter((i) => i.projectId === id), [db.invoices, id]);
  const payments = useMemo(() => db.payments.filter((pay) => invoices.some((i) => i.id === pay.invoiceId)), [db.payments, invoices]);
  const activity = useMemo(() => activityAll.filter((a) => a.projectId === id && (role !== 'Client' || a.entity !== 'session')), [activityAll, id, role]);

  if (!p || !stats) {
    return <EmptyState icon={<Icon.projects size={20} />} title="Project not found" body={`There’s no project with ID ${id}, or your role can’t see it.`} action={<Button variant="primary" onClick={() => navigate('/projects')}>Back to projects</Button>} />;
  }
  const client = clients.get(p.clientId);
  const manager = users.get(p.managerId);
  const team = p.memberIds.map((m) => users.get(m)).filter(Boolean);
  const burn = p.budget ? (stats.costToDate / p.budget) * 100 : 0;
  const showMoney = can('view:financials');

  return (
    <>
      <PageHeader
        meta={<><IdChip>{p.id}</IdChip><StatusBadge status={p.status} /><PriorityBadge priority={p.priority} />{stats.isOverdue && <Badge tone="danger">Past deadline</Badge>}</>}
        title={p.name}
        description={<>For {client ? (can('view:clients') ? <Link to={`/clients/${client.id}`} className="text-accent-text hover:underline">{client.companyName}</Link> : client.companyName) : '—'} · {date(p.startDate)} → {date(p.deadline)}</>}
        actions={
          <>
            {can('write:invoices') && <Button icon={<Icon.invoices size={15} />} onClick={() => openForm({ kind: 'invoice', defaults: { projectId: p.id } })}>Create invoice</Button>}
            {can('write:tasks') && <Button icon={<Icon.plus size={15} />} onClick={() => openForm({ kind: 'task', defaults: { projectId: p.id } })}>Add task</Button>}
            {can('write:projects') && (
              <>
                <Button variant="primary" icon={<Icon.edit size={15} />} onClick={() => openForm({ kind: 'project', id: p.id })}>Edit</Button>
                <Menu label="Project actions" items={[
                  { label: 'Log time', icon: <Icon.time size={15} />, onSelect: () => openForm({ kind: 'session', defaults: { taskId: tasks[0]?.id } }), disabled: !tasks.length },
                  { label: 'Delete project', icon: <Icon.trash size={15} />, danger: true, divider: true, onSelect: async () => { if (await confirmDeleteProject(getState().db.projects.find((x) => x.id === p.id)!)) navigate('/projects'); } },
                ]} trigger={(t) => <Button {...t} aria-label="More actions" className="px-2.5!"><Icon.more size={17} /></Button>} />
              </>
            )}
          </>
        }
      />

      <StatStrip className="mb-5" items={[
        { label: 'Progress', value: `${stats.progress}%`, sub: `${stats.doneCount} of ${stats.taskCount} tasks done${stats.overdueTasks ? ` · ${stats.overdueTasks} overdue` : ''}`, extra: <Progress value={stats.progress} tone={p.status === 'Completed' ? 'success' : 'accent'} label="Progress" /> },
        { label: 'Hours logged', value: hours(stats.loggedHours), sub: `of ${hours(stats.estimatedHours)} estimated · ${hours(stats.billableHours)} billable`, extra: <Progress value={stats.estimatedHours ? (stats.loggedHours / stats.estimatedHours) * 100 : 0} tone={stats.loggedHours > stats.estimatedHours ? 'danger' : 'accent'} label="Hours vs estimate" /> },
        ...(showMoney ? [
          { label: 'Budget used', value: inr(stats.costToDate), tone: burn > 100 ? 'danger' as const : undefined, sub: `${Math.round(burn)}% of ${inr(p.budget)} · ₹${p.billingRate.toLocaleString('en-IN')}/h`, extra: <Progress value={burn} tone={burn > 100 ? 'danger' : 'accent'} label="Budget used" /> },
          { label: 'Invoiced', value: inr(stats.invoiced), sub: `${inr(stats.collected)} collected${stats.outstanding ? ` · ${inr(stats.outstanding)} due` : ''}`, extra: <Progress value={stats.invoiced ? (stats.collected / stats.invoiced) * 100 : 0} tone="success" label="Collected share" /> },
        ] : [
          { label: 'Deadline', value: date(p.deadline), sub: stats.daysLeft >= 0 ? `${stats.daysLeft} days left` : `${-stats.daysLeft} days past deadline` },
          { label: 'Status', value: p.status, sub: `${p.priority} priority` },
        ]),
      ]} />

      <Tabs<Tab>
        value={tab as Tab}
        onChange={setTab}
        className="mb-5"
        tabs={[
          { value: 'overview', label: 'Overview' },
          { value: 'tasks', label: 'Tasks', count: tasks.length },
          { value: 'sessions', label: 'Work sessions', count: sessions.length },
          ...(showMoney ? [{ value: 'billing' as Tab, label: 'Invoices & payments', count: invoices.length }] : []),
          { value: 'activity', label: 'Activity' },
        ]}
      />

      {tab === 'overview' && (
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
          <Card className="xl:col-span-2">
            <CardHeader title="About this project" />
            <div className="px-5 pb-5">
              <p className="text-[13.5px] leading-relaxed text-ink-2">{p.description || 'No description.'}</p>
              <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-3">
                <MetaItem label="Project ID"><span className="num">{p.id}</span></MetaItem>
                <MetaItem label="Client (FK client_id)">{client?.companyName ?? '—'} <span className="num text-xs text-ink-3">{client?.id}</span></MetaItem>
                <MetaItem label="Manager (FK user_id)"><UserCell user={manager} size={22} /></MetaItem>
                <MetaItem label="Start date">{date(p.startDate)}</MetaItem>
                <MetaItem label="Deadline"><DueDate date={p.deadline} done={p.status === 'Completed' || p.status === 'Cancelled'} /></MetaItem>
                <MetaItem label="Priority"><PriorityBadge priority={p.priority} /></MetaItem>
                {showMoney && <MetaItem label="Budget">{inr(p.budget)}</MetaItem>}
                {showMoney && <MetaItem label="Billing rate">₹{p.billingRate.toLocaleString('en-IN')} / hour</MetaItem>}
                <MetaItem label="Created">{date(p.createdAt)}</MetaItem>
              </dl>
            </div>
            <div className="border-t border-line px-5 py-4">
              <p className="mb-3 text-[13px] font-medium text-ink">Tasks by status</p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {TASK_STATUSES.map((s) => {
                  const n = tasks.filter((t) => t.status === s).length;
                  return (
                    <button key={s} onClick={() => setTab('tasks')} className="rounded-lg border border-line px-3 py-2.5 text-left hover:border-line-strong">
                      <p className="num text-lg font-semibold text-ink">{n}</p>
                      <StatusBadge status={s} />
                    </button>
                  );
                })}
              </div>
            </div>
          </Card>
          <Card>
            <CardHeader title={`Team (${team.length + 1})`} description="Manager and members" />
            <ul className="flex flex-col gap-1 px-3 pb-4">
              {[manager, ...team].filter(Boolean).map((u, i) => {
                const logged = sessions.filter((s) => s.userId === u!.id).reduce((h, s) => h + sessionHours(s), 0);
                const open = tasks.filter((t) => t.assigneeId === u!.id && t.status !== 'Completed').length;
                return (
                  <li key={u!.id}>
                    <button onClick={() => openDrawer({ kind: 'user', id: u!.id })} className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-hover">
                      <Avatar id={u!.id} name={u!.fullName} size={32} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] text-ink">{u!.fullName}{i === 0 && <span className="ml-2 text-xs text-ink-3">Manager</span>}</span>
                        <span className="block truncate text-xs text-ink-3">{u!.department}</span>
                      </span>
                      <span className="text-right text-xs text-ink-3"><span className="num block text-[13px] text-ink">{hours(logged)}</span>{open} open</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </Card>
        </div>
      )}

      {tab === 'tasks' && (
        <Card className="overflow-hidden">
          {tasks.length === 0 ? (
            <EmptyState icon={<Icon.tasks size={20} />} title="No tasks yet" body="Break the project into tasks so the team can log time against them." action={can('write:tasks') ? <Button variant="primary" onClick={() => openForm({ kind: 'task', defaults: { projectId: p.id } })}>Add first task</Button> : undefined} />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[780px] text-[13px]">
                <thead className="table-head"><tr><th>Task</th><th>Assignee</th><th>Priority</th><th>Due</th><th className="text-right!">Logged / est.</th><th>Status</th></tr></thead>
                <tbody className="table-body">
                  {[...tasks].sort((a, b) => TASK_STATUSES.indexOf(a.status) - TASK_STATUSES.indexOf(b.status) || a.dueDate.localeCompare(b.dueDate)).map((t) => {
                    const logged = taskLoggedHours(t.id, sessions);
                    return (
                      <tr key={t.id} className="row-link" onClick={() => openDrawer({ kind: 'task', id: t.id })}>
                        <td><p className="font-medium text-ink">{t.title}</p><p className="num text-xs text-ink-3">{t.id}</p></td>
                        <td><UserCell user={t.assigneeId ? users.get(t.assigneeId) : undefined} size={22} /></td>
                        <td><PriorityBadge priority={t.priority} /></td>
                        <td><DueDate date={t.dueDate} done={t.status === 'Completed' || p.status === 'Completed' || p.status === 'Cancelled'} /></td>
                        <td className="num text-right text-ink-2"><span className={logged > t.estimatedHours ? 'text-danger' : 'text-ink'}>{logged.toFixed(1)}</span> / {t.estimatedHours} h</td>
                        <td><StatusBadge status={t.status} /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {tab === 'sessions' && (
        <Card className="overflow-hidden">
          {sessions.length === 0 ? <EmptyState icon={<Icon.time size={20} />} title="No time logged yet" body="Work sessions appear here once someone tracks time on this project’s tasks." /> : (
            <div className="max-h-[560px] overflow-auto">
              <table className="w-full min-w-[760px] text-[13px]">
                <thead className="table-head"><tr><th>Session</th><th>Who</th><th>Task</th><th>Started</th><th className="text-right!">Duration</th>{showMoney && <th className="text-right!">Amount</th>}</tr></thead>
                <tbody className="table-body">
                  {sessions.slice(0, 200).map((s) => (
                    <tr key={s.id}>
                      <td className="num text-xs text-ink-3">{s.id}</td>
                      <td><UserCell user={users.get(s.userId)} size={22} /></td>
                      <td className="max-w-[240px]"><button className="truncate text-left text-ink hover:underline" onClick={() => openDrawer({ kind: 'task', id: s.taskId })}>{db.tasks.find((t) => t.id === s.taskId)?.title}</button><p className="truncate text-xs text-ink-3">{s.notes}</p></td>
                      <td className="whitespace-nowrap text-ink-2">{dateTime(s.start)}</td>
                      <td className="num text-right text-ink">{duration(sessionHours(s))}</td>
                      {showMoney && <td className="num text-right">{s.billable ? inr(sessionAmount(s)) : <span className="text-ink-3">Non-billable</span>}</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {tab === 'billing' && showMoney && (
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
          <Card className="overflow-hidden">
            <CardHeader title="Invoices" description="PROJECT — BILLS_FOR — INVOICE" actions={can('write:invoices') ? <Button size="sm" icon={<Icon.plus size={14} />} onClick={() => openForm({ kind: 'invoice', defaults: { projectId: p.id } })}>New</Button> : undefined} />
            {invoices.length === 0 ? <EmptyState compact title="Not invoiced yet" /> : (
              <ul className="divide-y divide-line border-t border-line">
                {invoices.map((i) => {
                  const f = invoiceFinancials(i, db.payments);
                  return (
                    <li key={i.id}>
                      <button onClick={() => navigate(`/invoices/${i.id}`)} className="flex w-full items-center gap-3 px-5 py-3 text-left hover:bg-hover">
                        <span className="min-w-0 flex-1"><span className="num block text-[13px] font-medium text-ink">{i.number}</span><span className="text-xs text-ink-3">Issued {date(i.issueDate)} · due {date(i.dueDate)}</span></span>
                        <span className="text-right"><span className="num block text-[13px] text-ink">{inr(f.total)}</span>{f.balance > 0 && f.status !== 'Cancelled' && f.status !== 'Draft' && <span className="num text-xs text-ink-3">{inr(f.balance)} due</span>}</span>
                        <StatusBadge status={f.status} />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
          <Card className="overflow-hidden">
            <CardHeader title="Payments" description="INVOICE — PAID THROUGH — PAYMENT" />
            {payments.length === 0 ? <EmptyState compact title="No payments yet" /> : (
              <ul className="divide-y divide-line border-t border-line">
                {payments.map((pay) => (
                  <li key={pay.id}>
                    <button onClick={() => openDrawer({ kind: 'payment', id: pay.id })} className="flex w-full items-center gap-3 px-5 py-3 text-left hover:bg-hover">
                      <span className="min-w-0 flex-1"><span className="num block text-[13px] font-medium text-ink">{inr(pay.amount, true)}</span><span className="text-xs text-ink-3">{date(pay.date)} · {pay.method} · {db.invoices.find((i) => i.id === pay.invoiceId)?.number}</span></span>
                      <StatusBadge status={pay.status} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      )}

      {tab === 'activity' && (
        <Card>
          <CardHeader title="Activity timeline" description="Every change to this project, its tasks, time and billing" />
          <ActivityFeed entries={activity} users={users} limit={15} empty="No activity recorded for this project yet." />
        </Card>
      )}
    </>
  );
}
