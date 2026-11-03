/* Detail slide-overs for tasks, payments, people and sessions. */
import { useMemo } from 'react';
import clsx from 'clsx';
import { TASK_STATUSES, type TaskStatus } from '../data/types';
import { deletePaymentApi, deleteTaskApi, getState, startTimer, updateTaskApi, updateUserApi, userDependencies, useTimer } from '../data/store';
import { closeDrawer, openForm, useUI } from '../lib/ui';
import { useData } from '../lib/useData';
import { navigate, Link } from '../lib/router';
import { date, dateTime, duration, hours, inr } from '../lib/format';
import { addDays, today } from '../lib/dates';
import { invoiceFinancials, isTaskOverdue, sessionAmount, sessionHours } from '../lib/selectors';
import { ROLE_SUMMARY } from '../lib/permissions';
import { Icon } from './icons';
import { Drawer, confirmDialog, notify } from './ui/overlays';
import { Avatar, Badge, Button, EmptyState, IdChip, PriorityBadge, Progress, StatusBadge } from './ui/primitives';
import { DependencyList, DueDate, MetaItem, UserCell } from './common';

export function DrawerHost() {
  const d = useUI((s) => s.drawer);
  if (!d) return null;
  if (d.kind === 'task') return <TaskDrawer key={d.id} id={d.id} />;
  if (d.kind === 'payment') return <PaymentDrawer key={d.id} id={d.id} />;
  if (d.kind === 'user') return <UserDrawer key={d.id} id={d.id} />;
  return null;
}

/* =============================== TASK =============================== */
export async function confirmDeleteTask(id: string) {
  const s = getState();
  const t = s.db.tasks.find((x) => x.id === id);
  if (!t) return false;
  const n = s.db.sessions.filter((x) => x.taskId === id).length;
  const okd = await confirmDialog({
    title: `Delete “${t.title}”?`,
    body: <>This permanently removes task <b>{t.id}</b>.<DependencyList items={[{ label: 'work session(s)', count: n, effect: 'cascade' }]} /></>,
    confirmLabel: 'Delete task',
  });
  return okd && notify(await deleteTaskApi(id));
}

function TaskDrawer({ id }: { id: string }) {
  const { fullDb, users, projects, can, canEditTask, user } = useData();
  const timer = useTimer();
  const task = fullDb.tasks.find((t) => t.id === id);
  const sessions = useMemo(() => fullDb.sessions.filter((s) => s.taskId === id).sort((a, b) => b.start.localeCompare(a.start)), [fullDb.sessions, id]);
  if (!task) {
    return <Drawer open onClose={closeDrawer} title="Task not found"><EmptyState title="This task no longer exists" body="It may have been deleted." /></Drawer>;
  }
  const project = projects.get(task.projectId);
  const logged = sessions.reduce((h, s) => h + sessionHours(s), 0);
  const billable = sessions.reduce((h, s) => h + sessionAmount(s), 0);
  const editable = canEditTask(task.assigneeId);
  const overdue = isTaskOverdue(task, project);
  const canTrack = can('write:sessions:any') || (can('write:sessions:own') && task.assigneeId === user.id);
  const pctUsed = task.estimatedHours ? (logged / task.estimatedHours) * 100 : 0;

  return (
    <Drawer
      open
      onClose={closeDrawer}
      title={task.title}
      subtitle={<><IdChip>{task.id}</IdChip><StatusBadge status={task.status} />{overdue && <Badge tone="danger">Overdue</Badge>}</>}
      footer={
        <>
          {can('write:tasks') && <Button variant="ghost" className="mr-auto text-danger! hover:bg-danger-soft!" icon={<Icon.trash size={15} />} onClick={async () => { if (await confirmDeleteTask(task.id)) closeDrawer(); }}>Delete</Button>}
          {canTrack && (
            <Button icon={<Icon.play size={15} />} disabled={timer.running} title={timer.running ? 'Stop the running timer first' : undefined} onClick={() => {
              if (notify(startTimer({ taskId: task.id, userId: task.assigneeId && can('write:sessions:any') ? task.assigneeId : user.id, notes: '', billable: true }))) { closeDrawer(); navigate('/time'); }
            }}>Start timer</Button>
          )}
          {can('write:tasks') && <Button variant="primary" icon={<Icon.edit size={15} />} onClick={() => { closeDrawer(); openForm({ kind: 'task', id: task.id }); }}>Edit task</Button>}
        </>
      }
    >
      <div className="flex flex-col gap-6">
        <div>
          <p className="mb-2 text-xs text-ink-3">Status</p>
          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Task status">
            {TASK_STATUSES.map((s) => (
              <button
                key={s}
                role="radio"
                aria-checked={task.status === s}
                disabled={!editable}
                onClick={() => { void updateTaskApi(task.id, { status: s as TaskStatus }).then(notify); }}
                className={clsx('h-8 rounded-lg border px-3 text-[13px] font-medium transition-colors disabled:cursor-not-allowed',
                  task.status === s ? 'border-ink bg-hover text-ink' : 'border-line text-ink-3 enabled:hover:border-line-strong enabled:hover:text-ink')}
              >{s}</button>
            ))}
          </div>
          {!editable && <p className="mt-2 text-xs text-ink-3">Only the assignee or a project manager can change this task.</p>}
        </div>

        {task.description && <p className="text-[13.5px] leading-relaxed text-ink-2">{task.description}</p>}

        <dl className="grid grid-cols-2 gap-x-6 gap-y-4">
          <MetaItem label="Project">{project ? <Link to={`/projects/${project.id}`} onClick={closeDrawer} className="text-accent-text hover:underline">{project.name}</Link> : '—'}</MetaItem>
          <MetaItem label="Assigned to"><UserCell user={task.assigneeId ? users.get(task.assigneeId) : undefined} size={22} /></MetaItem>
          <MetaItem label="Priority"><PriorityBadge priority={task.priority} /></MetaItem>
          <MetaItem label="Start date">{date(task.startDate)}</MetaItem>
          <MetaItem label="Due date"><DueDate date={task.dueDate} done={task.status === 'Completed'} /></MetaItem>
          <MetaItem label="Billable value">{inr(billable)}</MetaItem>
        </dl>

        <div className="rounded-lg border border-line bg-raised p-4">
          <div className="mb-2 flex items-baseline justify-between text-[13px]">
            <span className="text-ink-2">Hours logged vs estimate</span>
            <span className="num font-medium text-ink">{hours(logged)} <span className="font-normal text-ink-3">/ {hours(task.estimatedHours)}</span></span>
          </div>
          <Progress value={pctUsed} tone={pctUsed > 100 ? 'danger' : pctUsed > 85 ? 'warning' : 'accent'} label="Hours used" />
          {pctUsed > 100 && <p className="mt-2 text-xs text-danger">Over estimate by {hours(logged - task.estimatedHours)}.</p>}
        </div>

        <section>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-ink">Work sessions <span className="font-normal text-ink-3">({sessions.length})</span></h3>
            {canTrack && <Button size="sm" variant="ghost" icon={<Icon.plus size={14} />} onClick={() => { closeDrawer(); openForm({ kind: 'session', defaults: { taskId: task.id } }); }}>Log time</Button>}
          </div>
          {sessions.length === 0 ? (
            <p className="rounded-lg border border-dashed border-line px-4 py-6 text-center text-[13px] text-ink-3">No time logged on this task yet.</p>
          ) : (
            <ul className="divide-y divide-line rounded-lg border border-line">
              {sessions.slice(0, 12).map((s) => (
                <li key={s.id} className="flex items-center gap-3 px-3 py-2.5">
                  <Avatar id={s.userId} name={users.get(s.userId)?.fullName ?? '?'} size={24} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] text-ink">{s.notes || 'No notes'}</p>
                    <p className="text-xs text-ink-3">{users.get(s.userId)?.fullName} · {dateTime(s.start)}</p>
                  </div>
                  <div className="text-right">
                    <p className="num text-[13px] font-medium text-ink">{duration(sessionHours(s))}</p>
                    <p className="text-xs text-ink-3">{s.billable ? inr(sessionAmount(s)) : 'Non-billable'}</p>
                  </div>
                </li>
              ))}
              {sessions.length > 12 && <li className="px-3 py-2 text-center text-xs text-ink-3">+ {sessions.length - 12} older sessions on the Time Tracking page</li>}
            </ul>
          )}
        </section>
      </div>
    </Drawer>
  );
}

/* =============================== PAYMENT =============================== */
function PaymentDrawer({ id }: { id: string }) {
  const { fullDb, clients, invoices, can } = useData();
  const p = fullDb.payments.find((x) => x.id === id);
  if (!p) return <Drawer open onClose={closeDrawer} title="Payment not found"><EmptyState title="This payment no longer exists" /></Drawer>;
  const inv = invoices.get(p.invoiceId);
  const client = inv ? clients.get(inv.clientId) : undefined;
  const fin = inv ? invoiceFinancials(inv, fullDb.payments) : undefined;
  return (
    <Drawer
      open
      onClose={closeDrawer}
      width="max-w-lg"
      title={inr(p.amount, true)}
      subtitle={<><IdChip>{p.id}</IdChip><StatusBadge status={p.status} /></>}
      footer={can('write:payments') ? (
        <>
          <Button variant="ghost" className="mr-auto text-danger! hover:bg-danger-soft!" icon={<Icon.trash size={15} />} onClick={async () => {
            const okd = await confirmDialog({ title: `Delete payment ${p.id}?`, body: <>The invoice <b>{inv?.number}</b> will be recalculated — its balance goes back up by {p.status === 'Completed' ? inr(p.amount, true) : '₹0 (this payment was not completed)'}.</>, confirmLabel: 'Delete payment' });
            if (okd && notify(await deletePaymentApi(p.id))) closeDrawer();
          }}>Delete</Button>
          <Button variant="primary" icon={<Icon.edit size={15} />} onClick={() => { closeDrawer(); openForm({ kind: 'payment', id: p.id }); }}>Edit payment</Button>
        </>
      ) : undefined}
    >
      <dl className="grid grid-cols-2 gap-x-6 gap-y-5">
        <MetaItem label="Payment date">{date(p.date)}</MetaItem>
        <MetaItem label="Method">{p.method}</MetaItem>
        <MetaItem label="Transaction reference"><span className="num break-all">{p.reference || '—'}</span></MetaItem>
        <MetaItem label="Client">{client ? <Link to={`/clients/${client.id}`} onClick={closeDrawer} className="text-accent-text hover:underline">{client.companyName}</Link> : '—'}</MetaItem>
        <MetaItem label="Invoice">{inv ? <Link to={`/invoices/${inv.id}`} onClick={closeDrawer} className="text-accent-text hover:underline">{inv.number}</Link> : '—'}</MetaItem>
        <MetaItem label="Invoice status">{fin ? <StatusBadge status={fin.status} /> : '—'}</MetaItem>
      </dl>
      {p.notes && <p className="mt-6 rounded-lg border border-line bg-raised p-3 text-[13px] text-ink-2">{p.notes}</p>}
      {fin && (
        <div className="mt-6 rounded-lg border border-line p-4">
          <p className="mb-3 text-[13px] font-medium text-ink">Invoice balance</p>
          <Progress value={(fin.paid / (fin.total || 1)) * 100} tone={fin.status === 'Paid' ? 'success' : fin.status === 'Overdue' ? 'danger' : 'accent'} label="Paid share" />
          <div className="mt-3 grid grid-cols-3 gap-3 text-[13px]">
            <div><p className="text-ink-3">Total</p><p className="num font-medium text-ink">{inr(fin.total)}</p></div>
            <div><p className="text-ink-3">Paid</p><p className="num font-medium text-success">{inr(fin.paid)}</p></div>
            <div><p className="text-ink-3">Balance</p><p className="num font-medium text-ink">{inr(fin.balance)}</p></div>
          </div>
        </div>
      )}
      <p className="mt-6 text-xs text-ink-3">Payments are recorded manually. No real payment gateway is connected in this demo.</p>
    </Drawer>
  );
}

/* =============================== USER =============================== */
function UserDrawer({ id }: { id: string }) {
  const { fullDb, can, clients, user: me } = useData();
  const u = fullDb.users.find((x) => x.id === id);
  const stats = useMemo(() => {
    if (!u) return null;
    const from = addDays(today(), -29);
    const sess = fullDb.sessions.filter((s) => s.userId === id);
    const recent = sess.filter((s) => s.start.slice(0, 10) >= from);
    const tasks = fullDb.tasks.filter((t) => t.assigneeId === id);
    return {
      hours30: recent.reduce((h, s) => h + sessionHours(s), 0),
      billable30: recent.filter((s) => s.billable).reduce((h, s) => h + sessionHours(s), 0),
      open: tasks.filter((t) => t.status !== 'Completed'),
      done: tasks.filter((t) => t.status === 'Completed').length,
      projects: fullDb.projects.filter((p) => p.managerId === id || p.memberIds.includes(id)),
    };
  }, [fullDb, id, u]);
  if (!u || !stats) return <Drawer open onClose={closeDrawer} title="Person not found"><EmptyState title="This user no longer exists" /></Drawer>;
  const deps = userDependencies(u.id);
  return (
    <Drawer
      open
      onClose={closeDrawer}
      width="max-w-lg"
      title={u.fullName}
      subtitle={<><IdChip>{u.id}</IdChip><StatusBadge status={u.status} /></>}
      footer={can('write:users') ? (
        <>
          {u.id !== 'USR-001' && u.id !== me.id && (
            <Button className="mr-auto" onClick={() => { void updateUserApi(u.id, { status: u.status === 'Active' ? 'Inactive' : 'Active' }).then((result) => notify(result, u.status === 'Active' ? `${u.fullName} deactivated` : `${u.fullName} reactivated`)); }}>
              {u.status === 'Active' ? 'Deactivate' : 'Reactivate'}
            </Button>
          )}
          <Button variant="primary" icon={<Icon.edit size={15} />} onClick={() => { closeDrawer(); openForm({ kind: 'user', id: u.id }); }}>Edit</Button>
        </>
      ) : undefined}
    >
      <div className="flex items-center gap-4">
        <Avatar id={u.id} name={u.fullName} size={56} />
        <div className="min-w-0">
          <p className="text-[15px] font-medium text-ink">{u.role}</p>
          <p className="text-[13px] text-ink-3">{u.department}</p>
          <p className="mt-1 text-xs text-ink-3">{ROLE_SUMMARY[u.role]}</p>
        </div>
      </div>
      <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-4">
        <MetaItem label="Email"><a className="break-all text-accent-text hover:underline" href={`mailto:${u.email}`}>{u.email}</a></MetaItem>
        <MetaItem label="Phone">{u.phone}</MetaItem>
        <MetaItem label="Joined">{date(u.joinedAt)}</MetaItem>
        {u.clientId && <MetaItem label="Client company">{clients.get(u.clientId)?.companyName}</MetaItem>}
      </dl>
      {u.role !== 'Client' && (
        <>
          <div className="mt-6 grid grid-cols-3 gap-3 rounded-lg border border-line p-4">
            <div><p className="text-xs text-ink-3">Hours · 30 days</p><p className="num mt-0.5 font-semibold text-ink">{hours(stats.hours30)}</p></div>
            <div><p className="text-xs text-ink-3">Billable</p><p className="num mt-0.5 font-semibold text-ink">{stats.hours30 ? Math.round((stats.billable30 / stats.hours30) * 100) : 0}%</p></div>
            <div><p className="text-xs text-ink-3">Tasks done</p><p className="num mt-0.5 font-semibold text-ink">{stats.done}</p></div>
          </div>
          <h3 className="mt-6 mb-2 text-sm font-semibold text-ink">Open tasks ({stats.open.length})</h3>
          {stats.open.length === 0 ? <p className="text-[13px] text-ink-3">Nothing open.</p> : (
            <ul className="divide-y divide-line rounded-lg border border-line">
              {stats.open.slice(0, 8).map((t) => (
                <li key={t.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                  <span className="min-w-0 truncate text-[13px] text-ink">{t.title}</span>
                  <StatusBadge status={t.status} />
                </li>
              ))}
            </ul>
          )}
          <h3 className="mt-6 mb-2 text-sm font-semibold text-ink">Projects ({stats.projects.length})</h3>
          <div className="flex flex-wrap gap-2">
            {stats.projects.map((p) => <Link key={p.id} to={`/projects/${p.id}`} onClick={closeDrawer} className="rounded-lg border border-line px-2.5 py-1 text-[12.5px] text-ink-2 hover:border-line-strong hover:text-ink">{p.name}</Link>)}
          </div>
        </>
      )}
      {(deps.sessions > 0 || deps.tasks > 0 || deps.managedProjects > 0) && (
        <p className="mt-6 text-xs text-ink-3">Linked to {deps.tasks} task(s), {deps.sessions} work session(s) and {deps.managedProjects} managed project(s) — deactivate instead of deleting to keep history.</p>
      )}
      {can('write:users') && u.id === me.id && <p className="mt-2 text-xs text-ink-3">This is you.</p>}
    </Drawer>
  );
}
