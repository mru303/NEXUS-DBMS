import clsx from 'clsx';
import { useMemo } from 'react';
import { CLIENT_STATUSES, type Client } from '../data/types';
import { clientDependencies, deleteClientApi } from '../data/store';
import { useData } from '../lib/useData';
import { navigate, useQueryState } from '../lib/router';
import { openForm } from '../lib/ui';
import { inr } from '../lib/format';
import { clientStats } from '../lib/selectors';
import { downloadCsv } from '../lib/csv';
import { Icon } from '../components/icons';
import { RowActions, confirmDialog, notify } from '../components/ui/overlays';
import { Avatar, Button, Card, EmptyState, FilterSelect, IdChip, PageHeader, SearchInput, Segmented, StatusBadge } from '../components/ui/primitives';
import { DependencyList, UserCell } from '../components/common';

export async function confirmDeleteClient(c: Client): Promise<boolean> {
  const d = clientDependencies(c.id);
  if (d.projects || d.invoices || d.users) {
    await confirmDialog({
      title: `${c.companyName} can’t be deleted`,
      body: (
        <>
          Other records still reference this client through foreign keys, so the delete is blocked (ON DELETE RESTRICT). Mark the client <b>Inactive</b> instead to hide it from new work while keeping its history.
          <DependencyList items={[{ label: 'project(s)', count: d.projects, effect: 'restrict' }, { label: 'invoice(s)', count: d.invoices, effect: 'restrict' }, { label: 'client portal user(s)', count: d.users, effect: 'restrict' }]} />
        </>
      ),
      confirmLabel: 'OK',
      tone: 'primary',
    });
    return false;
  }
  const ok = await confirmDialog({ title: `Delete ${c.companyName}?`, body: <>Client <b>{c.id}</b> has no projects or invoices, so it can be removed safely. This can’t be undone.</>, confirmLabel: 'Delete client' });
  if (!ok) return false;
  const res = await deleteClientApi(c.id);
  return notify(res);
}

export function ClientsPage() {
  const { db, users, can } = useData();
  const [q, setQ] = useQueryState('q');
  const [status, setStatus] = useQueryState('status');
  const [sort, setSort] = useQueryState('sort', 'name');
  const [view, setView] = useQueryState('view', 'cards');

  const stats = useMemo(() => new Map(db.clients.map((c) => [c.id, clientStats(c, db)])), [db]);
  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    return db.clients
      .filter((c) => (!status || c.status === status) && (!term || `${c.companyName} ${c.contactPerson} ${c.email} ${c.city} ${c.gstin} ${c.id}`.toLowerCase().includes(term)))
      .sort((a, b) => {
        const sa = stats.get(a.id)!, sb = stats.get(b.id)!;
        if (sort === 'billed') return sb.billed - sa.billed;
        if (sort === 'outstanding') return sb.outstanding - sa.outstanding;
        if (sort === 'recent') return b.createdAt.localeCompare(a.createdAt);
        return a.companyName.localeCompare(b.companyName);
      });
  }, [db.clients, q, status, sort, stats]);

  const totals = useMemo(() => [...stats.values()].reduce((a, s) => ({ billed: a.billed + s.billed, paid: a.paid + s.paid, outstanding: a.outstanding + s.outstanding }), { billed: 0, paid: 0, outstanding: 0 }), [stats]);

  const actionsFor = (c: Client) => [
    { label: 'Open client', icon: <Icon.eye size={15} />, onSelect: () => navigate(`/clients/${c.id}`) },
    ...(can('write:clients') ? [
      { label: 'Edit', icon: <Icon.edit size={15} />, onSelect: () => openForm({ kind: 'client', id: c.id }) },
      ...(can('write:projects') ? [{ label: 'New project', icon: <Icon.plus size={15} />, onSelect: () => openForm({ kind: 'project', defaults: { clientId: c.id } }) }] : []),
      ...(can('write:invoices') ? [{ label: 'New invoice', icon: <Icon.invoices size={15} />, onSelect: () => openForm({ kind: 'invoice', defaults: { clientId: c.id } }) }] : []),
      { label: 'Delete', icon: <Icon.trash size={15} />, danger: true, divider: true, onSelect: () => { void confirmDeleteClient(c); } },
    ] : []),
  ];

  const exportCsv = () => downloadCsv('nexus-clients.csv', ['Client ID', 'Company', 'Contact', 'Email', 'Phone', 'Address', 'City', 'State', 'PIN', 'GSTIN', 'Status', 'Created', 'Billed', 'Paid', 'Outstanding'],
    rows.map((c) => { const s = stats.get(c.id)!; return [c.id, c.companyName, c.contactPerson, c.email, c.phone, c.street, c.city, c.state, c.pincode, c.gstin, c.status, c.createdAt, s.billed.toFixed(2), s.paid.toFixed(2), s.outstanding.toFixed(2)]; }));

  return (
    <>
      <PageHeader
        title="Clients"
        description={`${db.clients.length} companies · ${inr(totals.billed)} billed · ${inr(totals.outstanding)} outstanding`}
        actions={<>
          <Button icon={<Icon.download size={15} />} onClick={exportCsv}>Export CSV</Button>
          {can('write:clients') && <Button variant="primary" icon={<Icon.plus size={16} />} onClick={() => openForm({ kind: 'client' })}>New client</Button>}
        </>}
      />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <SearchInput value={q} onChange={setQ} placeholder="Search name, contact, city, GSTIN…" className="w-full sm:w-72" />
        <FilterSelect label="Status" value={status} onChange={setStatus}>
          <option value="">All statuses</option>
          {CLIENT_STATUSES.map((s) => <option key={s}>{s}</option>)}
        </FilterSelect>
        <FilterSelect label="Sort" value={sort} onChange={setSort} defaultValue="name">
          <option value="name">Sort: Name</option>
          <option value="billed">Sort: Total billed</option>
          <option value="outstanding">Sort: Outstanding</option>
          <option value="recent">Sort: Newest</option>
        </FilterSelect>
        <div className="ml-auto">
          <Segmented label="View" size="sm" value={view} onChange={setView} options={[{ value: 'cards', label: 'Cards', icon: <Icon.grid size={14} /> }, { value: 'table', label: 'Table', icon: <Icon.list size={14} /> }]} />
        </div>
      </div>

      {rows.length === 0 ? (
        <Card><EmptyState icon={<Icon.clients size={20} />} title={q || status ? 'No clients match' : 'No clients yet'} body={q || status ? 'Try a different search.' : 'Add your first client to start a project.'} action={can('write:clients') ? <Button variant="primary" onClick={() => openForm({ kind: 'client' })}>New client</Button> : undefined} /></Card>
      ) : view === 'table' ? (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px] text-[13px]">
              <thead className="table-head"><tr><th>Company</th><th>Contact</th><th>Location</th><th>GSTIN</th><th className="text-right!">Projects</th><th className="text-right!">Billed</th><th className="text-right!">Outstanding</th><th>Status</th><th><span className="sr-only">Actions</span></th></tr></thead>
              <tbody className="table-body">
                {rows.map((c) => {
                  const s = stats.get(c.id)!;
                  return (
                    <tr key={c.id} className="row-link" onClick={() => navigate(`/clients/${c.id}`)}>
                      <td><p className="font-medium text-ink">{c.companyName}</p><IdChip>{c.id}</IdChip></td>
                      <td><p className="text-ink">{c.contactPerson}</p><p className="text-xs text-ink-3">{c.email}</p></td>
                      <td className="text-ink-2">{c.city}, {c.state}</td>
                      <td className="num text-xs text-ink-2">{c.gstin || '—'}</td>
                      <td className="num text-right text-ink">{s.projectCount}</td>
                      <td className="num text-right text-ink">{inr(s.billed)}</td>
                      <td className={clsx('num text-right', s.overdue ? 'text-danger' : 'text-ink')}>{inr(s.outstanding)}</td>
                      <td><StatusBadge status={c.status} /></td>
                      <td className="w-10"><RowActions items={actionsFor(c)} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-3">
          {rows.map((c) => {
            const s = stats.get(c.id)!;
            const mgr = users.get(c.accountManagerId);
            return (
              <article key={c.id} role="link" tabIndex={0} onClick={() => navigate(`/clients/${c.id}`)} onKeyDown={(e) => e.key === 'Enter' && navigate(`/clients/${c.id}`)} className="card flex cursor-pointer flex-col p-5 transition-colors hover:border-line-strong">
                <div className="flex items-start gap-3">
                  <Avatar id={c.id} name={c.companyName} size={40} className="rounded-md!" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14.5px] font-semibold text-ink">{c.companyName}</p>
                    <p className="flex items-center gap-1 truncate text-[12.5px] text-ink-3"><Icon.pin size={12} />{c.city}, {c.state}</p>
                  </div>
                  <RowActions items={actionsFor(c)} />
                </div>
                <div className="mt-4 flex items-center justify-between gap-3 text-[13px]">
                  <span className="min-w-0 truncate text-ink-2">{c.contactPerson} · <span className="text-ink-3">{c.email}</span></span>
                  <StatusBadge status={c.status} />
                </div>
                <dl className="mt-4 grid grid-cols-3 gap-2 border-t border-line pt-4 text-xs">
                  <div><dt className="text-ink-3">Projects</dt><dd className="num mt-0.5 text-[14px] font-medium text-ink">{s.activeProjects}<span className="text-ink-3">/{s.projectCount}</span></dd></div>
                  <div><dt className="text-ink-3">Billed</dt><dd className="num mt-0.5 text-[14px] font-medium text-ink">{inr(s.billed)}</dd></div>
                  <div><dt className="text-ink-3">Outstanding</dt><dd className={clsx('num mt-0.5 text-[14px] font-medium', s.overdue ? 'text-danger' : 'text-ink')}>{inr(s.outstanding)}</dd></div>
                </dl>
                <div className="mt-4 flex items-center justify-between border-t border-line pt-3 text-xs text-ink-3">
                  <UserCell user={mgr} size={20} sub={undefined} />
                  <IdChip>{c.id}</IdChip>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </>
  );
}
