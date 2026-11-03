import clsx from 'clsx';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { PROJECT_STATUSES, type Project } from '../data/types';
import { deleteProjectApi, getState, projectDependencies } from '../data/store';
import { useData } from '../lib/useData';
import { navigate, useQueryState, Link } from '../lib/router';
import { openForm } from '../lib/ui';
import { addDays, today } from '../lib/dates';
import { hours, inr, inrCompact } from '../lib/format';
import { projectStats, type ProjectStats } from '../lib/selectors';
import { downloadCsv } from '../lib/csv';
import { Icon } from '../components/icons';
import { RowActions, confirmDialog, notify } from '../components/ui/overlays';
import { AvatarStack, Button, Card, EmptyState, FilterSelect, IdChip, PageHeader, Pagination, PriorityBadge, Progress, SearchInput, Segmented, StatusBadge, Tabs } from '../components/ui/primitives';
import { DependencyList, DueDate, UserCell } from '../components/common';

export async function confirmDeleteProject(p: Project): Promise<boolean> {
  const d = projectDependencies(p.id);
  if (d.invoices) {
    notify({ ok: false, error: `Can’t delete: ${d.invoices} invoice(s) reference this project. Cancel or delete the invoices first, or set the project to Cancelled.` });
    return false;
  }
  const ok = await confirmDialog({
    title: `Delete ${p.name}?`,
    body: (
      <>
        Project <b>{p.id}</b> will be permanently removed. Tasks and work sessions are weak entities that depend on the project, so they are deleted with it (ON DELETE CASCADE).
        <DependencyList items={[{ label: 'task(s)', count: d.tasks, effect: 'cascade' }, { label: 'work session(s)', count: d.sessions, effect: 'cascade' }]} />
      </>
    ),
    confirmLabel: 'Delete project',
  });
  return ok && notify(await deleteProjectApi(p.id));
}

type SortKey = 'deadline' | 'name' | 'budget' | 'progress' | 'recent';
const PAGE_SIZE = 8;

export function ProjectsPage() {
  const { db, users, clients, can } = useData();
  const [q, setQ] = useQueryState('q');
  const [status, setStatus] = useQueryState('status');
  const [client, setClient] = useQueryState('client');
  const [manager, setManager] = useQueryState('manager');
  const [due, setDue] = useQueryState('due');
  const [sort, setSort] = useQueryState('sort', 'deadline');
  const [view, setView] = useState<'table' | 'grid'>(() => { try { return (localStorage.getItem('nexus.projects.view') as 'table' | 'grid') || 'table'; } catch { return 'table'; } });
  const [page, setPage] = useState(1);
  useEffect(() => { try { localStorage.setItem('nexus.projects.view', view); } catch { /* ignore */ } }, [view]);
  useEffect(() => setPage(1), [q, status, client, manager, due, sort]);

  const stats = useMemo(() => new Map(db.projects.map((p) => [p.id, projectStats(p, db)])), [db]);
  const now = today();
  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    const list = db.projects.filter((p) => {
      if (term && !`${p.name} ${p.id} ${clients.get(p.clientId)?.companyName} ${p.description}`.toLowerCase().includes(term)) return false;
      if (status && p.status !== status) return false;
      if (client && p.clientId !== client) return false;
      if (manager && p.managerId !== manager) return false;
      const live = p.status !== 'Completed' && p.status !== 'Cancelled';
      if (due === 'overdue' && !(live && p.deadline < now)) return false;
      if (due === '30' && !(live && p.deadline >= now && p.deadline <= addDays(now, 30))) return false;
      if (due === '90' && !(live && p.deadline >= now && p.deadline <= addDays(now, 90))) return false;
      return true;
    });
    const s = (p: Project) => stats.get(p.id)!;
    const sorters: Record<SortKey, (a: Project, b: Project) => number> = {
      deadline: (a, b) => a.deadline.localeCompare(b.deadline),
      name: (a, b) => a.name.localeCompare(b.name),
      budget: (a, b) => b.budget - a.budget,
      progress: (a, b) => s(b).progress - s(a).progress,
      recent: (a, b) => b.createdAt.localeCompare(a.createdAt),
    };
    return list.sort(sorters[(sort as SortKey)] ?? sorters.deadline);
  }, [db.projects, q, status, client, manager, due, sort, stats, clients, now]);

  const pageRows = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const filtersOn = !!(q || status || client || manager || due);
  const managers = db.users.filter((u) => db.projects.some((p) => p.managerId === u.id));
  const counts = Object.fromEntries(PROJECT_STATUSES.map((s) => [s, db.projects.filter((p) => p.status === s).length]));

  const exportCsv = () => downloadCsv('nexus-projects.csv',
    ['Project ID', 'Name', 'Client', 'Manager', 'Start', 'Deadline', 'Budget', 'Billing rate', 'Progress %', 'Logged hours', 'Status', 'Priority'],
    rows.map((p) => { const s = stats.get(p.id)!; return [p.id, p.name, clients.get(p.clientId)?.companyName, users.get(p.managerId)?.fullName, p.startDate, p.deadline, p.budget, p.billingRate, s.progress, s.loggedHours.toFixed(1), p.status, p.priority]; }));

  const actionsFor = (p: Project) => [
    { label: 'Open project', icon: <Icon.eye size={15} />, onSelect: () => navigate(`/projects/${p.id}`) },
    ...(can('write:projects') ? [
      { label: 'Edit', icon: <Icon.edit size={15} />, onSelect: () => openForm({ kind: 'project', id: p.id }) },
      { label: 'Add task', icon: <Icon.plus size={15} />, onSelect: () => openForm({ kind: 'task', defaults: { projectId: p.id } }) },
      { label: 'Delete', icon: <Icon.trash size={15} />, danger: true, divider: true, onSelect: () => confirmDeleteProject(getState().db.projects.find((x) => x.id === p.id)!) },
    ] : []),
  ];

  return (
    <>
      <PageHeader
        title="Projects"
        description="Every client engagement, its budget, team and progress. Progress is calculated from completed task hours."
        actions={
          <>
            <Button icon={<Icon.download size={15} />} onClick={exportCsv}>Export CSV</Button>
            {can('write:projects') && <Button variant="primary" icon={<Icon.plus size={16} />} onClick={() => openForm({ kind: 'project' })}>New project</Button>}
          </>
        }
      />

      <Tabs
        value={status}
        onChange={setStatus}
        className="mb-4"
        tabs={[{ value: '', label: 'All', count: db.projects.length }, ...PROJECT_STATUSES.map((st) => ({ value: st as string, label: st, count: counts[st] }))]}
      />

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 border-b border-line p-3">
          <SearchInput value={q} onChange={setQ} placeholder="Search projects…" className="w-full sm:w-64" />
          {db.clients.length > 1 && (
            <FilterSelect label="Client" value={client} onChange={setClient}>
              <option value="">All clients</option>
              {db.clients.filter((c) => db.projects.some((p) => p.clientId === c.id)).map((c) => <option key={c.id} value={c.id}>{c.companyName}</option>)}
            </FilterSelect>
          )}
          <FilterSelect label="Manager" value={manager} onChange={setManager}>
            <option value="">All managers</option>
            {managers.map((u) => <option key={u.id} value={u.id}>{u.fullName}</option>)}
          </FilterSelect>
          <FilterSelect label="Deadline" value={due} onChange={setDue}>
            <option value="">Any deadline</option>
            <option value="overdue">Past deadline</option>
            <option value="30">Due in 30 days</option>
            <option value="90">Due in 90 days</option>
          </FilterSelect>
          {filtersOn && <Button size="sm" variant="ghost" icon={<Icon.x size={14} />} onClick={() => { setQ(''); setStatus(''); setClient(''); setManager(''); setDue(''); }}>Clear</Button>}
          <div className="ml-auto flex items-center gap-2">
            <FilterSelect label="Sort by" value={sort} onChange={setSort} className="min-w-0!" defaultValue="deadline">
              <option value="deadline">Sort: Due date</option>
              <option value="name">Sort: Name</option>
              <option value="budget">Sort: Budget</option>
              <option value="progress">Sort: Progress</option>
              <option value="recent">Sort: Newest</option>
            </FilterSelect>
            <Segmented label="View" size="sm" value={view} onChange={setView} options={[{ value: 'table', label: <span className="sr-only sm:not-sr-only">Table</span>, icon: <Icon.list size={14} /> }, { value: 'grid', label: <span className="sr-only sm:not-sr-only">Cards</span>, icon: <Icon.grid size={14} /> }]} />
          </div>
        </div>

        {rows.length === 0 ? (
          <EmptyState
            icon={<Icon.projects size={20} />}
            title={filtersOn ? 'No projects match these filters' : 'No projects yet'}
            body={filtersOn ? 'Try clearing a filter or searching for something else.' : 'Create your first project to start planning tasks and tracking time.'}
            action={filtersOn ? <Button onClick={() => { setQ(''); setStatus(''); setClient(''); setManager(''); setDue(''); }}>Clear filters</Button> : can('write:projects') ? <Button variant="primary" onClick={() => openForm({ kind: 'project' })}>New project</Button> : undefined}
          />
        ) : view === 'table' ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1100px] text-[13px]">
              <thead className="table-head">
                <tr><th>Project</th><th>Client</th><th>Manager</th><th>Team</th><th>Progress</th><th className="text-right!">Budget</th><th>Deadline</th><th>Status</th><th><span className="sr-only">Actions</span></th></tr>
              </thead>
              <tbody className="table-body">
                {pageRows.map((p) => {
                  const s = stats.get(p.id)!;
                  const team = p.memberIds.map((id) => users.get(id)).filter(Boolean) as { id: string; fullName: string }[];
                  return (
                    <tr key={p.id} className="row-link" onClick={() => navigate(`/projects/${p.id}`)}>
                      <td className="max-w-[260px]">
                        <div className="flex items-center gap-2"><Link to={`/projects/${p.id}`} onClick={(e) => e.stopPropagation()} className="truncate font-medium text-ink hover:underline">{p.name}</Link></div>
                        <div className="mt-0.5 flex items-center gap-2"><IdChip>{p.id}</IdChip><PriorityBadge priority={p.priority} /></div>
                      </td>
                      <td className="max-w-[180px] truncate text-ink-2">{clients.get(p.clientId)?.companyName}</td>
                      <td><UserCell user={users.get(p.managerId)} size={24} /></td>
                      <td>{team.length ? <AvatarStack people={team} max={3} size={24} /> : <span className="text-ink-3">—</span>}</td>
                      <td className="min-w-36"><div className="flex items-center gap-2"><Progress value={s.progress} tone={p.status === 'Completed' ? 'success' : 'accent'} className="w-20 shrink-0" label="progress" /><span className="num text-xs text-ink-2">{s.progress}%</span></div><p className="num mt-1 text-[11.5px] whitespace-nowrap text-ink-3">{s.doneCount}/{s.taskCount} tasks</p></td>
                      <td className="text-right"><span className="num text-ink">{inr(p.budget)}</span><p className="num text-[11.5px] text-ink-3">₹{p.billingRate.toLocaleString('en-IN')}/h</p></td>
                      <td><DueDate date={p.deadline} done={p.status === 'Completed' || p.status === 'Cancelled'} /></td>
                      <td><StatusBadge status={p.status} /></td>
                      <td className="w-10"><RowActions items={actionsFor(p)} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 p-3 md:grid-cols-2 2xl:grid-cols-3">
            {pageRows.map((p) => <ProjectCard key={p.id} p={p} s={stats.get(p.id)!} clientName={clients.get(p.clientId)?.companyName ?? ''} team={p.memberIds.map((id) => users.get(id)!).filter(Boolean)} actions={<RowActions items={actionsFor(p)} />} />)}
          </div>
        )}
        <Pagination page={page} pageSize={PAGE_SIZE} total={rows.length} onPage={setPage} />
      </Card>
    </>
  );
}

function ProjectCard({ p, s, clientName, team, actions }: { p: Project; s: ProjectStats; clientName: string; team: { id: string; fullName: string }[]; actions: ReactNode }) {
  const burn = p.budget ? (s.costToDate / p.budget) * 100 : 0;
  return (
    <div role="link" tabIndex={0} onClick={() => navigate(`/projects/${p.id}`)} onKeyDown={(e) => e.key === 'Enter' && navigate(`/projects/${p.id}`)} className="flex cursor-pointer flex-col rounded-lg border border-line bg-surface p-4 transition-colors hover:border-line-strong">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="mb-1.5 flex items-center gap-2"><IdChip>{p.id}</IdChip><StatusBadge status={p.status} /></div>
          <p className="truncate text-[14.5px] font-semibold text-ink">{p.name}</p>
          <p className="truncate text-[12.5px] text-ink-3">{clientName}</p>
        </div>
        {actions}
      </div>
      <p className="mt-3 line-clamp-2 text-[13px] text-ink-2">{p.description}</p>
      <div className="mt-4 flex items-center gap-2"><Progress value={s.progress} tone={p.status === 'Completed' ? 'success' : 'accent'} label="progress" /><span className="num text-xs text-ink-2">{s.progress}%</span></div>
      <dl className="mt-4 grid grid-cols-3 gap-2 border-t border-line pt-3 text-xs">
        <div><dt className="text-ink-3">Budget</dt><dd className="num mt-0.5 text-[13px] text-ink">{inrCompact(p.budget)}</dd></div>
        <div><dt className="text-ink-3">Burn</dt><dd className={clsx('num mt-0.5 text-[13px]', burn > 100 ? 'text-danger' : 'text-ink')}>{Math.round(burn)}%</dd></div>
        <div><dt className="text-ink-3">Logged</dt><dd className="num mt-0.5 text-[13px] text-ink">{hours(s.loggedHours)}</dd></div>
      </dl>
      <div className="mt-3 flex items-center justify-between">
        <AvatarStack people={team} max={4} size={24} />
        <DueDate date={p.deadline} done={p.status === 'Completed' || p.status === 'Cancelled'} className="items-end text-right" />
      </div>
    </div>
  );
}
