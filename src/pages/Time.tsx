import clsx from 'clsx';
import { useEffect, useMemo, useState } from 'react';
import type { WorkSession } from '../data/types';
import { deleteSessionApi, discardTimer, startTimer, stopTimerApi, updateTimer, useTimer } from '../data/store';
import { useData } from '../lib/useData';
import { useQueryState } from '../lib/router';
import { openDrawer, openForm } from '../lib/ui';
import { addDays, startOfMonth, startOfWeek, today } from '../lib/dates';
import { clock, dateShort, dateTime, duration, hours, inr, time } from '../lib/format';
import { sessionAmount, sessionDate, sessionHours } from '../lib/selectors';
import { downloadCsv } from '../lib/csv';
import { Icon } from '../components/icons';
import { BarChart, Legend } from '../components/charts';
import { RowActions, confirmDialog, notify } from '../components/ui/overlays';
import { Badge, Button, Card, CardHeader, EmptyState, FilterSelect, PageHeader, Pagination, SelectInput, TextInput, Toggle } from '../components/ui/primitives';
import { UserCell } from '../components/common';

const PAGE = 12;

export function TimePage() {
  const { db, users, projects, user, can } = useData();
  const timer = useTimer();
  const anyone = can('write:sessions:any');
  const [, tick] = useState(0);
  useEffect(() => {
    if (!timer.running) return;
    const id = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [timer.running]);

  // Timer form state (persisted in the store while idle too, so it survives navigation)
  const taskId = timer.taskId ?? '';
  const userId = timer.userId ?? user.id;
  const effectiveUser = anyone ? userId : user.id;
  const selectableTasks = useMemo(() => {
    const live = db.projects.filter((p) => p.status === 'In Progress' || p.status === 'Planning' || p.status === 'On Hold');
    return live.map((p) => ({
      project: p,
      tasks: db.tasks.filter((t) => t.projectId === p.id && t.status !== 'Completed' && (anyone || t.assigneeId === user.id || p.memberIds.includes(user.id))),
    })).filter((g) => g.tasks.length);
  }, [db, anyone, user.id]);
  const currentTask = db.tasks.find((t) => t.id === taskId);
  const currentProject = currentTask ? projects.get(currentTask.projectId) : undefined;
  const elapsed = timer.running && timer.startedAt ? Date.now() - new Date(timer.startedAt).getTime() : 0;

  // Stats
  const now = today();
  const weekStart = startOfWeek(now);
  // Managers see the whole team's week; employees see their own
  const mine = (s: WorkSession) => anyone || s.userId === user.id;
  const todayH = db.sessions.filter((s) => mine(s) && sessionDate(s) === now).reduce((h, s) => h + sessionHours(s), 0) + elapsed / 3600000;
  const weekSessions = db.sessions.filter((s) => mine(s) && sessionDate(s) >= weekStart);
  const weekH = weekSessions.reduce((h, s) => h + sessionHours(s), 0) + elapsed / 3600000;
  const weekBill = weekSessions.filter((s) => s.billable).reduce((h, s) => h + sessionHours(s), 0) + (timer.running && timer.billable ? elapsed / 3600000 : 0);
  const weekAmount = weekSessions.reduce((a, s) => a + sessionAmount(s), 0);
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const weekChart = days.map((d) => {
    const ss = db.sessions.filter((s) => mine(s) && sessionDate(s) === d);
    const b = ss.filter((s) => s.billable).reduce((h, s) => h + sessionHours(s), 0);
    const n = ss.filter((s) => !s.billable).reduce((h, s) => h + sessionHours(s), 0);
    return { label: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][days.indexOf(d)], title: dateShort(d), values: [b, n] };
  });

  // History
  const [who, setWho] = useQueryState('user', anyone ? '' : user.id);
  const [proj, setProj] = useQueryState('project');
  const [period, setPeriod] = useQueryState('period', 'month');
  const [bill, setBill] = useQueryState('billable');
  const [page, setPage] = useState(1);
  useEffect(() => setPage(1), [who, proj, period, bill]);
  const taskProject = useMemo(() => new Map(db.tasks.map((t) => [t.id, t.projectId])), [db.tasks]);
  const history = useMemo(() => {
    const from = period === 'week' ? weekStart : period === 'month' ? startOfMonth(now) : period === '30' ? addDays(now, -29) : period === '90' ? addDays(now, -89) : '0000';
    return db.sessions.filter((s) => {
      if (!anyone && s.userId !== user.id) return false;
      if (who && s.userId !== who) return false;
      if (proj && taskProject.get(s.taskId) !== proj) return false;
      if (bill === 'yes' && !s.billable) return false;
      if (bill === 'no' && s.billable) return false;
      return sessionDate(s) >= from;
    }).sort((a, b) => b.start.localeCompare(a.start));
  }, [db.sessions, anyone, user.id, who, proj, bill, period, weekStart, now, taskProject]);
  const totalH = history.reduce((h, s) => h + sessionHours(s), 0);
  const totalAmt = history.reduce((a, s) => a + sessionAmount(s), 0);
  const canEdit = (s: WorkSession) => anyone || s.userId === user.id;

  const onStart = () => {
    if (!taskId) { notify({ ok: false, error: 'Pick a task to track time against.' }); return; }
    notify(startTimer({ taskId, userId: effectiveUser, notes: timer.notes, billable: timer.billable }));
  };
  const onStop = async () => notify(await stopTimerApi());

  const exportCsv = () => downloadCsv('nexus-work-sessions.csv',
    ['Session ID', 'User', 'Project', 'Task', 'Start', 'End', 'Duration (h)', 'Hourly rate', 'Billable', 'Amount', 'Notes'],
    history.map((s) => { const t = db.tasks.find((x) => x.id === s.taskId); return [s.id, users.get(s.userId)?.fullName, projects.get(t?.projectId ?? '')?.name, t?.title, s.start, s.end, sessionHours(s).toFixed(2), s.hourlyRate, s.billable ? 'Yes' : 'No', sessionAmount(s).toFixed(2), s.notes]; }));

  return (
    <>
      <PageHeader
        title="Time tracking"
        description="Track work against tasks. Each stop creates a work session (TASK — RECORDS — WORK SESSION) priced at the project’s billing rate."
        actions={<Button icon={<Icon.plus size={16} />} onClick={() => openForm({ kind: 'session', defaults: { taskId } })}>Log time manually</Button>}
      />

      <div className="mb-5 grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <Card className={clsx('relative overflow-hidden', timer.running && 'border-success/40')}>
          {timer.running && <div className="pointer-events-none absolute inset-x-0 top-0 h-0.5 bg-success" />}
          <div className="flex flex-col gap-6 p-5 sm:p-6">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="flex items-center gap-2 text-[13px] text-ink-3">
                  {timer.running ? <><span className="relative flex size-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-60" /><span className="relative inline-flex size-2 rounded-full bg-success" /></span>Recording since {time(timer.startedAt!)}</> : 'Timer idle'}
                </p>
                <p className={clsx('num mt-1 text-[44px] leading-none font-semibold sm:text-[52px]', timer.running ? 'text-ink' : 'text-ink-3')} aria-live="off" role="timer">{clock(elapsed)}</p>
                {timer.running && currentTask && <p className="mt-2 text-[13px] text-ink-2">{currentTask.title} · <span className="text-ink-3">{currentProject?.name}</span>{timer.billable && currentProject && <span className="text-ink-3"> · {inr((elapsed / 3600000) * currentProject.billingRate)} so far</span>}</p>}
              </div>
              <div className="flex gap-2">
                {timer.running ? (
                  <>
                    <Button size="lg" variant="ghost" onClick={async () => { if (await confirmDialog({ title: 'Discard this timer?', body: 'The running time won’t be saved as a work session.', confirmLabel: 'Discard' })) discardTimer(); }}>Discard</Button>
                    <Button size="lg" variant="danger" icon={<Icon.stop size={16} />} onClick={onStop}>Stop &amp; save</Button>
                  </>
                ) : (
                  <Button size="lg" variant="primary" icon={<Icon.play size={16} />} onClick={onStart} disabled={!taskId}>Start timer</Button>
                )}
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <SelectInput label="Task" value={taskId} disabled={timer.running} onChange={(e) => updateTimer({ taskId: e.target.value || null })} hint={selectableTasks.length === 0 ? 'No open tasks available to you.' : currentProject ? `Project: ${currentProject.name} · ₹${currentProject.billingRate}/h` : 'Grouped by project'}>
                <option value="">Choose a task…</option>
                {selectableTasks.map((g) => (
                  <optgroup key={g.project.id} label={g.project.name}>
                    {g.tasks.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
                  </optgroup>
                ))}
              </SelectInput>
              <SelectInput label="Team member" value={effectiveUser} disabled={!anyone || timer.running} onChange={(e) => updateTimer({ userId: e.target.value })} hint={anyone ? 'Managers can track time for others.' : 'You track your own time.'}>
                {db.users.filter((u) => u.role !== 'Client' && (u.status === 'Active' || u.id === effectiveUser)).map((u) => <option key={u.id} value={u.id}>{u.fullName}</option>)}
              </SelectInput>
              <TextInput label="What are you working on?" className="sm:col-span-2" value={timer.notes} onChange={(e) => updateTimer({ notes: e.target.value })} placeholder="e.g. Checkout edge cases and unit tests" maxLength={300} />
            </div>
            <Toggle label="Billable" description="Billable time is charged to the client at the project rate." checked={timer.billable} onChange={(b) => updateTimer({ billable: b })} />
          </div>
        </Card>

        <Card>
          <CardHeader title={anyone ? 'Team this week' : 'Your week'} description={`Week of ${dateShort(weekStart)}${anyone ? ' · everyone’s logged time' : ''}`} />
          <div className="grid grid-cols-3 gap-3 px-5">
            <div><p className="text-xs text-ink-3">Today</p><p className="num mt-0.5 text-xl font-semibold text-ink">{duration(todayH)}</p></div>
            <div><p className="text-xs text-ink-3">This week</p><p className="num mt-0.5 text-xl font-semibold text-ink">{duration(weekH)}</p></div>
            <div><p className="text-xs text-ink-3">Billable</p><p className="num mt-0.5 text-xl font-semibold text-ink">{weekH ? Math.round((weekBill / weekH) * 100) : 0}%</p></div>
          </div>
          <div className="mt-4 px-5"><Legend series={[{ name: 'Billable', color: 'var(--viz-1)' }, { name: 'Non-billable', color: 'var(--viz-muted)' }]} /></div>
          <div className="px-2 pb-2 sm:px-4">
            <BarChart stacked ariaLabel="Hours per day this week" height={190} data={weekChart} series={[{ name: 'Billable', color: 'var(--viz-1)' }, { name: 'Non-billable', color: 'var(--viz-muted)' }]} format={(n) => duration(n)} axisFormat={(n) => `${n}h`} />
          </div>
          <p className="border-t border-line px-5 py-3 text-xs text-ink-3">Billable value this week: <span className="num font-medium text-ink">{inr(weekAmount)}</span></p>
        </Card>
      </div>

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 border-b border-line p-3">
          <h2 className="mr-2 pl-1 text-[15px] font-semibold text-ink">Session history</h2>
          {anyone && (
            <FilterSelect label="Person" value={who} onChange={setWho}>
              <option value="">Everyone</option>
              {db.users.filter((u) => db.sessions.some((s) => s.userId === u.id)).map((u) => <option key={u.id} value={u.id}>{u.fullName}</option>)}
            </FilterSelect>
          )}
          <FilterSelect label="Project" value={proj} onChange={setProj}>
            <option value="">All projects</option>
            {db.projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </FilterSelect>
          <FilterSelect label="Period" value={period} onChange={setPeriod} defaultValue="month">
            <option value="week">This week</option>
            <option value="month">This month</option>
            <option value="30">Last 30 days</option>
            <option value="90">Last 90 days</option>
            <option value="all">All time</option>
          </FilterSelect>
          <FilterSelect label="Billable" value={bill} onChange={setBill}>
            <option value="">Billable &amp; non-billable</option>
            <option value="yes">Billable only</option>
            <option value="no">Non-billable only</option>
          </FilterSelect>
          <div className="ml-auto flex items-center gap-3 text-[13px]">
            <span className="text-ink-3"><span className="num font-medium text-ink">{hours(totalH)}</span> · <span className="num font-medium text-ink">{inr(totalAmt)}</span> billable</span>
            <Button size="sm" icon={<Icon.download size={14} />} onClick={exportCsv}>CSV</Button>
          </div>
        </div>
        {history.length === 0 ? (
          <EmptyState icon={<Icon.time size={20} />} title="No sessions in this period" body="Start the timer or log time manually — sessions will show up here." action={<Button onClick={() => setPeriod('all')}>Show all time</Button>} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1080px] text-[13px]">
              <thead className="table-head"><tr><th>Session</th><th>Person</th><th>Project · task</th><th>Start</th><th>End</th><th className="text-right!">Duration</th><th className="text-right!">Rate</th><th className="text-right!">Amount</th><th>Notes</th><th><span className="sr-only">Actions</span></th></tr></thead>
              <tbody className="table-body">
                {history.slice((page - 1) * PAGE, page * PAGE).map((s) => {
                  const t = db.tasks.find((x) => x.id === s.taskId);
                  return (
                    <tr key={s.id}>
                      <td className="num text-xs whitespace-nowrap text-ink-3">{s.id}</td>
                      <td><UserCell user={users.get(s.userId)} size={22} /></td>
                      <td className="max-w-[240px]"><button onClick={() => t && openDrawer({ kind: 'task', id: t.id })} className="block max-w-full truncate text-left text-ink hover:underline">{t?.title}</button><span className="block truncate text-xs text-ink-3">{projects.get(t?.projectId ?? '')?.name}</span></td>
                      <td className="whitespace-nowrap text-ink-2">{dateTime(s.start)}</td>
                      <td className="whitespace-nowrap text-ink-2">{time(s.end)}</td>
                      <td className="num text-right text-ink">{duration(sessionHours(s))}</td>
                      <td className="num text-right text-ink-2">₹{s.hourlyRate.toLocaleString('en-IN')}</td>
                      <td className="num text-right">{s.billable ? <span className="text-ink">{inr(sessionAmount(s))}</span> : <Badge tone="neutral" dot={false}>Non-billable</Badge>}</td>
                      <td className="max-w-[200px] truncate text-ink-3">{s.notes || '—'}</td>
                      <td className="w-10">
                        {canEdit(s) && <RowActions items={[
                          { label: 'Edit session', icon: <Icon.edit size={15} />, onSelect: () => openForm({ kind: 'session', id: s.id }) },
                          { label: 'Delete', icon: <Icon.trash size={15} />, danger: true, divider: true, onSelect: async () => { if (await confirmDialog({ title: `Delete session ${s.id}?`, body: `${duration(sessionHours(s))} on “${t?.title}” will be removed from the task’s logged hours.`, confirmLabel: 'Delete session' })) notify(await deleteSessionApi(s.id)); } },
                        ]} />}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <Pagination page={page} pageSize={PAGE} total={history.length} onPage={setPage} />
      </Card>
    </>
  );
}
