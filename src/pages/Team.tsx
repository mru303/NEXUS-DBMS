import clsx from 'clsx';
import { useMemo } from 'react';
import { ROLES, type User } from '../data/types';
import { deleteUserApi, updateUserApi, userDependencies } from '../data/store';
import { useData } from '../lib/useData';
import { useQueryState } from '../lib/router';
import { openDrawer, openForm } from '../lib/ui';
import { addDays, today } from '../lib/dates';
import { date, hours } from '../lib/format';
import { sessionDate, sessionHours } from '../lib/selectors';
import { PERMISSION_MATRIX, ROLE_PERMISSIONS, ROLE_SUMMARY, can as roleCan } from '../lib/permissions';
import { Icon } from '../components/icons';
import { RowActions, confirmDialog, notify } from '../components/ui/overlays';
import { Avatar, Badge, Button, Card, CardHeader, EmptyState, FilterSelect, IdChip, PageHeader, SearchInput, StatusBadge } from '../components/ui/primitives';
import { DependencyList } from '../components/common';
import { DEMO_USERS, switchRole } from '../components/layout';

const ROLE_TONE = { Administrator: 'accent', 'Project Manager': 'info', Employee: 'neutral', Client: 'warning', 'Finance Staff': 'success' } as const;

export function TeamPage() {
  const { db, user: me, can, clients } = useData();
  const [q, setQ] = useQueryState('q');
  const [role, setRole] = useQueryState('role');
  const [status, setStatus] = useQueryState('status');
  const from = addDays(today(), -29);

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    return db.users.filter((u) => (!role || u.role === role) && (!status || u.status === status) && (!term || `${u.fullName} ${u.email} ${u.department} ${u.id}`.toLowerCase().includes(term)));
  }, [db.users, q, role, status]);
  const hours30 = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of db.sessions) if (sessionDate(s) >= from) m.set(s.userId, (m.get(s.userId) ?? 0) + sessionHours(s));
    return m;
  }, [db.sessions, from]);

  const confirmDelete = async (u: User) => {
    const d = userDependencies(u.id);
    const blocked = d.managedProjects + d.tasks + d.sessions + d.clients > 0;
    if (blocked) {
      const deactivate = await confirmDialog({
        title: `${u.fullName} can’t be deleted`,
        body: <>Their ID is referenced by other tables, so deleting would break foreign keys. Deactivate them instead — they keep their history but can’t be assigned new work.
          <DependencyList items={[{ label: 'managed project(s)', count: d.managedProjects, effect: 'restrict' }, { label: 'assigned task(s)', count: d.tasks, effect: 'restrict' }, { label: 'work session(s)', count: d.sessions, effect: 'restrict' }, { label: 'client account(s)', count: d.clients, effect: 'restrict' }]} /></>,
        confirmLabel: u.status === 'Active' ? 'Deactivate instead' : 'OK',
        tone: 'primary',
      });
      if (deactivate && u.status === 'Active') notify(await updateUserApi(u.id, { status: 'Inactive' }), `${u.fullName} deactivated`);
      return;
    }
    if (await confirmDialog({ title: `Remove ${u.fullName}?`, body: `${u.id} has no linked records and will be deleted.${d.memberships ? ` They’ll also be removed from ${d.memberships} project team(s).` : ''}`, confirmLabel: 'Remove' })) notify(await deleteUserApi(u.id));
  };

  return (
    <>
      <PageHeader
        title="Team"
        description={`${db.users.filter((u) => u.status === 'Active').length} active people across ${new Set(db.users.filter((u) => u.role !== 'Client').map((u) => u.department)).size} departments, plus client portal users.`}
        actions={can('write:users') ? <Button variant="primary" icon={<Icon.userPlus size={16} />} onClick={() => openForm({ kind: 'user' })}>Add member</Button> : undefined}
      />
      <div className="grid grid-cols-1 gap-5">
        <Card className="overflow-hidden">
          <div className="flex flex-wrap items-center gap-2 border-b border-line p-3">
            <SearchInput value={q} onChange={setQ} placeholder="Search people…" className="w-full sm:w-64" />
            <FilterSelect label="Role" value={role} onChange={setRole}><option value="">All roles</option>{ROLES.map((r) => <option key={r}>{r}</option>)}</FilterSelect>
            <FilterSelect label="Status" value={status} onChange={setStatus}><option value="">Active &amp; inactive</option><option>Active</option><option>Inactive</option></FilterSelect>
          </div>
          {rows.length === 0 ? <EmptyState title="Nobody matches" body="Try a different search or role." /> : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1080px] text-[13px]">
                <thead className="table-head"><tr><th>Person</th><th>Role</th><th>Department</th><th>Contact</th><th className="text-right!">Hours · 30d</th><th className="text-right!">Open tasks</th><th>Joined</th><th>Status</th><th><span className="sr-only">Actions</span></th></tr></thead>
                <tbody className="table-body">
                  {rows.map((u) => (
                    <tr key={u.id} className={clsx('row-link', u.status === 'Inactive' && 'opacity-60')} onClick={() => openDrawer({ kind: 'user', id: u.id })}>
                      <td><span className="flex items-center gap-3"><Avatar id={u.id} name={u.fullName} size={32} /><span><span className="block font-medium whitespace-nowrap text-ink">{u.fullName}{u.id === me.id && <span className="ml-2 text-xs font-normal text-accent-text">You</span>}</span><IdChip>{u.id}</IdChip></span></span></td>
                      <td><Badge tone={ROLE_TONE[u.role]}>{u.role}</Badge></td>
                      <td className="text-ink-2">{u.role === 'Client' && u.clientId ? clients.get(u.clientId)?.companyName : u.department}</td>
                      <td><p className="text-ink-2">{u.email}</p><p className="text-xs text-ink-3">{u.phone}</p></td>
                      <td className="num text-right text-ink">{u.role === 'Client' ? '—' : hours(hours30.get(u.id) ?? 0)}</td>
                      <td className="num text-right text-ink">{u.role === 'Client' ? '—' : db.tasks.filter((t) => t.assigneeId === u.id && t.status !== 'Completed').length}</td>
                      <td className="whitespace-nowrap text-ink-2">{date(u.joinedAt)}</td>
                      <td><StatusBadge status={u.status} /></td>
                      <td className="w-10">
                        <RowActions items={[
                          { label: 'View profile', icon: <Icon.eye size={15} />, onSelect: () => openDrawer({ kind: 'user', id: u.id }) },
                          ...(can('write:users') ? [
                            { label: 'Edit', icon: <Icon.edit size={15} />, onSelect: () => openForm({ kind: 'user', id: u.id }) },
                            ...(u.id !== 'USR-001' && u.id !== me.id ? [{ label: u.status === 'Active' ? 'Deactivate' : 'Reactivate', icon: <Icon.ban size={15} />, onSelect: () => { void updateUserApi(u.id, { status: u.status === 'Active' ? 'Inactive' : 'Active' }).then((result) => notify(result, u.status === 'Active' ? `${u.fullName} deactivated` : `${u.fullName} reactivated`)); } },
                              { label: 'Delete', icon: <Icon.trash size={15} />, danger: true, divider: true, onSelect: () => { void confirmDelete(u); } }] : []),
                          ] : []),
                        ]} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card className="overflow-hidden">
          <CardHeader
            title="Roles & permissions"
            description="What each role can do in the interface. For the demo, switch roles to see navigation and actions change. These are UI checks only — a real deployment must enforce them on the server/database (e.g. PostgreSQL GRANTs and row-level security)."
          />
          <div className="overflow-x-auto border-t border-line">
            <table className="w-full min-w-[820px] text-[13px]">
              <thead className="table-head">
                <tr>
                  <th>Capability</th>
                  {ROLES.map((r) => <th key={r} className="text-center!">{r}</th>)}
                </tr>
              </thead>
              <tbody className="table-body">
                <tr>
                  <td className="text-ink-3">Summary</td>
                  {ROLES.map((r) => <td key={r} className="max-w-[170px] text-center text-xs leading-snug text-ink-3">{ROLE_SUMMARY[r]}</td>)}
                </tr>
                {PERMISSION_MATRIX.map((row) => (
                  <tr key={row.perm}>
                    <td className="text-ink-2">{row.label}</td>
                    {ROLES.map((r) => (
                      <td key={r} className="text-center">
                        {roleCan(r, row.perm) ? <Icon.check size={16} className="mx-auto text-success" aria-label="Allowed" /> : <Icon.minus size={16} className="mx-auto text-ink-3 opacity-50" aria-label="Not allowed" />}
                      </td>
                    ))}
                  </tr>
                ))}
                <tr>
                  <td className="text-ink-3">Pages visible</td>
                  {ROLES.map((r) => <td key={r} className="num text-center text-ink-2">{ROLE_PERMISSIONS[r].filter((p) => p.startsWith('view:') && p !== 'view:financials').length} / 10</td>)}
                </tr>
                <tr>
                  <td />
                  {ROLES.map((r) => (
                    <td key={r} className="text-center">
                      <Button size="sm" variant={me.role === r ? 'subtle' : 'secondary'} disabled={me.role === r} onClick={() => switchRole(r)}>
                        {me.role === r ? 'Current view' : 'View as'}
                      </Button>
                      <p className="mt-1 text-[11px] text-ink-3">{db.users.find((u) => u.id === DEMO_USERS[r])?.fullName}</p>
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </>
  );
}
