import clsx from 'clsx';
import { useMemo, useState } from 'react';
import { PRIORITIES, TASK_STATUSES, type Task, type TaskStatus } from '../data/types';
import { updateTaskApi } from '../data/store';
import { useData } from '../lib/useData';
import { useQueryState } from '../lib/router';
import { openDrawer, openForm } from '../lib/ui';
import { dateShort, hours } from '../lib/format';
import { isTaskOverdue, taskLoggedHours } from '../lib/selectors';
import { downloadCsv } from '../lib/csv';
import { Icon } from '../components/icons';
import { RowActions, notify } from '../components/ui/overlays';
import { Avatar, Button, Card, EmptyState, FilterSelect, IdChip, PageHeader, PriorityBadge, SearchInput, Segmented, StatusBadge } from '../components/ui/primitives';
import { DueDate, UserCell } from '../components/common';
import { confirmDeleteTask } from '../components/drawers';

const COLUMN_TONE: Record<TaskStatus, string> = {
  'To Do': 'bg-ink-3', 'In Progress': 'bg-accent', 'In Review': 'bg-warning', Completed: 'bg-success',
};

export function TasksPage() {
  const { db, users, projects, user, can, canEditTask } = useData();
  const [view, setView] = useQueryState('view', 'list');
  const [q, setQ] = useQueryState('q');
  const [project, setProject] = useQueryState('project');
  const [assignee, setAssignee] = useQueryState('assignee', user.role === 'Employee' ? 'me' : '');
  const [priority, setPriority] = useQueryState('priority');
  const [overdueOnly, setOverdueOnly] = useQueryState('overdue');
  const [closed, setClosed] = useQueryState('closed');
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({ Completed: true });
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropCol, setDropCol] = useState<TaskStatus | null>(null);

  const logged = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of db.tasks) m.set(t.id, taskLoggedHours(t.id, db.sessions));
    return m;
  }, [db.tasks, db.sessions]);

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    const who = assignee === 'me' ? user.id : assignee;
    return db.tasks.filter((t) => {
      const p = projects.get(t.projectId);
      if (!closed && (p?.status === 'Completed' || p?.status === 'Cancelled') && project !== t.projectId) return false;
      if (term && !`${t.title} ${t.id} ${t.description} ${p?.name}`.toLowerCase().includes(term)) return false;
      if (project && t.projectId !== project) return false;
      if (who === 'none' ? t.assigneeId : who && t.assigneeId !== who) return false;
      if (priority && t.priority !== priority) return false;
      if (overdueOnly && !isTaskOverdue(t, p)) return false;
      return true;
    }).sort((a, b) => PRIORITIES.indexOf(b.priority) - PRIORITIES.indexOf(a.priority) || a.dueDate.localeCompare(b.dueDate));
  }, [db.tasks, q, project, assignee, priority, overdueOnly, closed, projects, user.id]);

  const overdueCount = rows.filter((t) => isTaskOverdue(t, projects.get(t.projectId))).length;
  const filtersOn = !!(q || project || assignee || priority || overdueOnly);
  const clear = () => { setQ(''); setProject(''); setAssignee(''); setPriority(''); setOverdueOnly(''); };
  const staff = db.users.filter((u) => u.role !== 'Client' && db.tasks.some((t) => t.assigneeId === u.id));

  const move = (t: Task, status: TaskStatus) => {
    if (t.status === status) return;
    if (!canEditTask(t.assigneeId)) { notify({ ok: false, error: 'Only the assignee or a project manager can move this task.' }); return; }
    void updateTaskApi(t.id, { status }).then(notify);
  };

  const actionsFor = (t: Task) => [
    { label: 'Open details', icon: <Icon.eye size={15} />, onSelect: () => openDrawer({ kind: 'task', id: t.id }) },
    ...(can('write:tasks') ? [{ label: 'Edit', icon: <Icon.edit size={15} />, onSelect: () => openForm({ kind: 'task', id: t.id }) }] : []),
    ...(canEditTask(t.assigneeId) ? TASK_STATUSES.filter((s) => s !== t.status).map((s, i) => ({ heading: i === 0 ? 'Move to' : undefined, divider: i === 0, label: s, icon: <span className={clsx('size-2 rounded-full', COLUMN_TONE[s])} />, onSelect: () => move(t, s) })) : []),
    ...(can('write:tasks') ? [{ label: 'Delete', icon: <Icon.trash size={15} />, danger: true, divider: true, onSelect: () => { void confirmDeleteTask(t.id); } }] : []),
  ];

  const exportCsv = () => downloadCsv('nexus-tasks.csv', ['Task ID', 'Title', 'Project', 'Assignee', 'Priority', 'Status', 'Start', 'Due', 'Estimated h', 'Logged h'],
    rows.map((t) => [t.id, t.title, projects.get(t.projectId)?.name, t.assigneeId ? users.get(t.assigneeId)?.fullName : '', t.priority, t.status, t.startDate, t.dueDate, t.estimatedHours, (logged.get(t.id) ?? 0).toFixed(2)]));

  return (
    <>
      <PageHeader
        title="Tasks"
        description={`${rows.length} tasks${overdueCount ? ` · ${overdueCount} overdue` : ''}. Drag cards between columns on the board, or use the ⋯ menu to change status.`}
        actions={
          <>
            <Segmented label="Layout" value={view === 'board' ? 'board' : 'list'} onChange={setView} options={[{ value: 'list', label: 'List', icon: <Icon.list size={15} /> }, { value: 'board', label: 'Board', icon: <Icon.kanban size={15} /> }]} />
            <Button icon={<Icon.download size={15} />} onClick={exportCsv} className="hidden sm:inline-flex">Export</Button>
            {can('write:tasks') && <Button variant="primary" icon={<Icon.plus size={16} />} onClick={() => openForm({ kind: 'task', defaults: project ? { projectId: project } : undefined })}>New task</Button>}
          </>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <SearchInput value={q} onChange={setQ} placeholder="Search tasks…" className="w-full sm:w-60" />
        <FilterSelect label="Project" value={project} onChange={setProject}>
          <option value="">All projects</option>
          {db.projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </FilterSelect>
        <FilterSelect label="Assignee" value={assignee} onChange={setAssignee}>
          <option value="">Everyone</option>
          <option value="me">Assigned to me</option>
          <option value="none">Unassigned</option>
          {staff.filter((u) => u.id !== user.id).map((u) => <option key={u.id} value={u.id}>{u.fullName}</option>)}
        </FilterSelect>
        <FilterSelect label="Priority" value={priority} onChange={setPriority}>
          <option value="">Any priority</option>
          {PRIORITIES.map((p) => <option key={p}>{p}</option>)}
        </FilterSelect>
        <button onClick={() => setOverdueOnly(overdueOnly ? '' : '1')} aria-pressed={!!overdueOnly} className={clsx('inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-[13px] font-medium', overdueOnly ? 'border-danger/50 bg-danger-soft text-danger' : 'border-line text-ink-2 hover:border-line-strong')}>
          <Icon.alert size={14} />Overdue only
        </button>
        <label className="inline-flex h-9 cursor-pointer items-center gap-2 px-1 text-[13px] text-ink-2">
          <input type="checkbox" className="accent-[var(--c-accent)]" checked={!!closed} onChange={(e) => setClosed(e.target.checked ? '1' : '')} />
          Include closed projects
        </label>
        {filtersOn && <Button size="sm" variant="ghost" icon={<Icon.x size={14} />} onClick={clear}>Clear</Button>}
      </div>

      {rows.length === 0 ? (
        <Card><EmptyState icon={<Icon.tasks size={20} />} title={filtersOn ? 'No tasks match these filters' : 'No tasks yet'} body={filtersOn ? 'Clear a filter to see more.' : 'Tasks break a project into pieces of work.'} action={filtersOn ? <Button onClick={clear}>Clear filters</Button> : undefined} /></Card>
      ) : view === 'board' ? (
        <div className="pb-2 md:overflow-x-auto">
          <div className="grid grid-cols-1 gap-4 md:min-w-[1040px] md:grid-cols-4">
            {TASK_STATUSES.map((col) => {
              const list = rows.filter((t) => t.status === col);
              return (
                <section
                  key={col}
                  aria-label={col}
                  onDragOver={(e) => { if (dragId) { e.preventDefault(); setDropCol(col); } }}
                  onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDropCol(null); }}
                  onDrop={(e) => { e.preventDefault(); const t = db.tasks.find((x) => x.id === dragId); if (t) move(t, col); setDragId(null); setDropCol(null); }}
                  className={clsx('flex flex-col rounded-lg border bg-rail p-2 transition-colors md:min-h-[420px]', dropCol === col ? 'border-ink-3 bg-hover' : 'border-line')}
                >
                  <header className="flex items-center gap-2 px-2 pt-1.5 pb-3">
                    <span className={clsx('size-2 rounded-full', COLUMN_TONE[col])} />
                    <h2 className="text-[13.5px] font-semibold text-ink">{col}</h2>
                    <span className="num rounded-md bg-raised px-1.5 text-[11.5px] text-ink-3">{list.length}</span>
                    {can('write:tasks') && <button onClick={() => openForm({ kind: 'task', defaults: { status: col, ...(project ? { projectId: project } : {}) } })} className="ml-auto rounded-md p-1 text-ink-3 hover:bg-hover hover:text-ink" aria-label={`Add task to ${col}`}><Icon.plus size={15} /></button>}
                  </header>
                  <div className="flex flex-col gap-2">
                    {list.map((t) => {
                      const p = projects.get(t.projectId);
                      const od = isTaskOverdue(t, p);
                      const editable = canEditTask(t.assigneeId);
                      const lg = logged.get(t.id) ?? 0;
                      return (
                        <article
                          key={t.id}
                          draggable={editable}
                          onDragStart={(e) => { setDragId(t.id); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', t.id); }}
                          onDragEnd={() => { setDragId(null); setDropCol(null); }}
                          className={clsx('group rounded-lg border bg-surface p-3 transition-shadow', od ? 'border-danger/40' : 'border-line', editable && 'cursor-grab active:cursor-grabbing', dragId === t.id && 'opacity-40')}
                        >
                          <div className="flex items-start gap-2">
                            <button onClick={() => openDrawer({ kind: 'task', id: t.id })} className="min-w-0 flex-1 text-left text-[13.5px] leading-snug font-medium text-ink hover:underline">{t.title}</button>
                            <RowActions items={actionsFor(t)} />
                          </div>
                          <p className="mt-1 truncate text-xs text-ink-3">{p?.name}</p>
                          <div className="mt-3 flex items-center gap-2">
                            <PriorityBadge priority={t.priority} compact />
                            <span className={clsx('inline-flex items-center gap-1 text-xs', od ? 'font-medium text-danger' : 'text-ink-3')}>
                              {od ? <Icon.alert size={12} /> : <Icon.calendar size={12} />}{dateShort(t.dueDate)}
                            </span>
                            <span className="num text-xs text-ink-3">{lg.toFixed(1)}/{t.estimatedHours}h</span>
                            <span className="ml-auto">{t.assigneeId && users.get(t.assigneeId) ? <Avatar id={t.assigneeId} name={users.get(t.assigneeId)!.fullName} size={22} /> : <span className="text-xs text-ink-3">—</span>}</span>
                          </div>
                          {editable && (
                            <label className="mt-3 block border-t border-line pt-2 md:hidden">
                              <span className="sr-only">Status</span>
                              <select className="field h-8! text-xs" value={t.status} onChange={(e) => move(t, e.target.value as TaskStatus)}>
                                {TASK_STATUSES.map((s) => <option key={s}>{s}</option>)}
                              </select>
                            </label>
                          )}
                        </article>
                      );
                    })}
                    {list.length === 0 && <p className="rounded-lg border border-dashed border-line px-3 py-8 text-center text-xs text-ink-3">{dragId ? 'Drop here' : 'No tasks'}</p>}
                  </div>
                </section>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {TASK_STATUSES.map((col) => {
            const list = rows.filter((t) => t.status === col);
            const isCollapsed = collapsed[col] ?? false;
            return (
              <Card key={col} className="overflow-hidden">
                <button onClick={() => setCollapsed((c) => ({ ...c, [col]: !isCollapsed }))} aria-expanded={!isCollapsed} className="flex w-full items-center gap-3 bg-raised/50 px-4 py-3 text-left hover:bg-hover">
                  <Icon.chevronDown size={16} className={clsx('text-ink-3 transition-transform', isCollapsed && '-rotate-90')} />
                  <span className={clsx('size-2 rounded-full', COLUMN_TONE[col])} />
                  <span className="text-[14px] font-semibold text-ink">{col}</span>
                  <span className="num text-[12.5px] text-ink-3">{list.length}</span>
                  <span className="num ml-auto text-xs text-ink-3">{hours(list.reduce((h, t) => h + t.estimatedHours, 0))} estimated</span>
                </button>
                {!isCollapsed && (list.length === 0 ? <p className="border-t border-line px-4 py-5 text-center text-[13px] text-ink-3">No tasks in {col.toLowerCase()}.</p> : (
                  <div className="overflow-x-auto border-t border-line">
                    <table className="w-full min-w-[920px] table-fixed text-[13px]">
                      <colgroup><col className="w-[26%]" /><col className="w-[17%]" /><col className="w-[16%]" /><col className="w-[9%]" /><col className="w-[12%]" /><col className="w-[10%]" /><col className="w-[10%]" /><col className="w-12" /></colgroup>
                      <thead className="table-head"><tr><th>Task</th><th>Project</th><th>Assigned to</th><th>Priority</th><th>Due</th><th className="text-right!">Logged / est.</th><th>Status</th><th><span className="sr-only">Actions</span></th></tr></thead>
                      <tbody className="table-body">
                        {list.map((t) => {
                          const p = projects.get(t.projectId);
                          const lg = logged.get(t.id) ?? 0;
                          return (
                            <tr key={t.id} className="row-link" onClick={() => openDrawer({ kind: 'task', id: t.id })}>
                              <td><p className="truncate font-medium text-ink">{t.title}</p><IdChip>{t.id}</IdChip></td>
                              <td className="truncate text-ink-2">{p?.name}</td>
                              <td><UserCell user={t.assigneeId ? users.get(t.assigneeId) : undefined} size={22} /></td>
                              <td><PriorityBadge priority={t.priority} /></td>
                              <td><DueDate date={t.dueDate} done={t.status === 'Completed' || p?.status === 'Completed' || p?.status === 'Cancelled'} /></td>
                              <td className="num text-right"><span className={lg > t.estimatedHours ? 'text-danger' : 'text-ink'}>{lg.toFixed(1)}</span><span className="text-ink-3"> / {t.estimatedHours} h</span></td>
                              <td><StatusBadge status={t.status} /></td>
                              <td className="w-10"><RowActions items={actionsFor(t)} /></td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ))}
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
