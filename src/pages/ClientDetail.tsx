import clsx from 'clsx';
import { useMemo } from 'react';
import { getState, useActivity } from '../data/store';
import { useData } from '../lib/useData';
import { navigate } from '../lib/router';
import { openDrawer, openForm } from '../lib/ui';
import { date, inr } from '../lib/format';
import { clientStats, invoiceFinancials, projectStats } from '../lib/selectors';
import { Icon } from '../components/icons';
import { Menu } from '../components/ui/overlays';
import { Avatar, Button, Card, CardHeader, EmptyState, IdChip, PageHeader, Progress, StatStrip, StatusBadge } from '../components/ui/primitives';
import { ActivityFeed, MetaItem, UserCell } from '../components/common';
import { confirmDeleteClient } from './Clients';

export function ClientDetailPage({ id }: { id: string }) {
  const { db, users, can } = useData();
  const activityAll = useActivity();
  const c = db.clients.find((x) => x.id === id);
  const stats = useMemo(() => (c ? clientStats(c, db) : null), [c, db]);
  const projects = useMemo(() => db.projects.filter((p) => p.clientId === id), [db.projects, id]);
  const invoices = useMemo(() => db.invoices.filter((i) => i.clientId === id).sort((a, b) => b.issueDate.localeCompare(a.issueDate)), [db.invoices, id]);
  const payments = useMemo(() => db.payments.filter((p) => invoices.some((i) => i.id === p.invoiceId)).sort((a, b) => b.date.localeCompare(a.date)), [db.payments, invoices]);
  const activity = useMemo(() => activityAll.filter((a) => a.clientId === id), [activityAll, id]);
  if (!c || !stats) return <EmptyState icon={<Icon.clients size={20} />} title="Client not found" body={`No client with ID ${id}.`} action={<Button variant="primary" onClick={() => navigate('/clients')}>Back to clients</Button>} />;
  const mgr = users.get(c.accountManagerId);

  return (
    <>
      <PageHeader
        meta={<><IdChip>{c.id}</IdChip><StatusBadge status={c.status} /></>}
        title={<span className="flex items-center gap-3"><Avatar id={c.id} name={c.companyName} size={36} className="rounded-md!" />{c.companyName}</span>}
        description={`Client since ${date(c.createdAt)} · ${c.city}, ${c.state}`}
        actions={<>
          {can('write:invoices') && <Button icon={<Icon.invoices size={15} />} onClick={() => openForm({ kind: 'invoice', defaults: { clientId: c.id } })}>New invoice</Button>}
          {can('write:projects') && <Button icon={<Icon.plus size={15} />} onClick={() => openForm({ kind: 'project', defaults: { clientId: c.id } })}>New project</Button>}
          {can('write:clients') && <>
            <Button variant="primary" icon={<Icon.edit size={15} />} onClick={() => openForm({ kind: 'client', id: c.id })}>Edit</Button>
            <Menu label="Client actions" items={[{ label: 'Delete client', danger: true, icon: <Icon.trash size={15} />, onSelect: async () => { if (await confirmDeleteClient(getState().db.clients.find((x) => x.id === c.id)!)) navigate('/clients'); } }]} trigger={(t) => <Button {...t} aria-label="More actions" className="px-2.5!"><Icon.more size={17} /></Button>} />
          </>}
        </>}
      />

      <StatStrip className="mb-5" items={[
        { label: 'Total billed', value: inr(stats.billed), sub: `${stats.invoiceCount} invoices` },
        { label: 'Total paid', value: inr(stats.paid), sub: `${payments.filter((p) => p.status === 'Completed').length} payments` },
        { label: 'Outstanding balance', value: inr(stats.outstanding), tone: stats.overdue ? 'danger' : undefined, sub: stats.overdue ? `${inr(stats.overdue)} overdue` : 'Nothing overdue' },
        { label: 'Projects', value: stats.projectCount, sub: `${stats.activeProjects} active` },
      ]} />

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <div className="flex flex-col gap-5 xl:col-span-2">
          <Card className="overflow-hidden">
            <CardHeader title="Projects" description="CLIENT — OWNS — PROJECT" />
            {projects.length === 0 ? <EmptyState compact title="No projects yet" action={can('write:projects') ? <Button size="sm" onClick={() => openForm({ kind: 'project', defaults: { clientId: c.id } })}>Create project</Button> : undefined} /> : (
              <ul className="divide-y divide-line border-t border-line">
                {projects.map((p) => {
                  const s = projectStats(p, db);
                  return (
                    <li key={p.id}>
                      <button onClick={() => navigate(`/projects/${p.id}`)} className="grid w-full grid-cols-[1fr_auto] items-center gap-x-4 gap-y-2 px-5 py-3 text-left hover:bg-hover sm:grid-cols-[1fr_160px_110px_auto]">
                        <span className="min-w-0"><span className="block truncate text-[13.5px] font-medium text-ink">{p.name}</span><span className="num text-xs text-ink-3">{p.id} · due {date(p.deadline)}</span></span>
                        <span className="hidden items-center gap-2 sm:flex"><Progress value={s.progress} tone={p.status === 'Completed' ? 'success' : 'accent'} label="progress" /><span className="num w-9 text-right text-xs text-ink-2">{s.progress}%</span></span>
                        <span className="num hidden text-right text-[13px] text-ink sm:block">{inr(p.budget)}</span>
                        <StatusBadge status={p.status} />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
          <Card className="overflow-hidden">
            <CardHeader title="Invoice history" description="CLIENT — RECEIVES — INVOICE" />
            {invoices.length === 0 ? <EmptyState compact title="No invoices yet" /> : (
              <div className="overflow-x-auto border-t border-line">
                <table className="w-full min-w-[640px] text-[13px]">
                  <thead className="table-head"><tr><th>Invoice</th><th>Issued</th><th>Due</th><th className="text-right!">Total</th><th className="text-right!">Balance</th><th>Status</th></tr></thead>
                  <tbody className="table-body">
                    {invoices.map((i) => {
                      const f = invoiceFinancials(i, db.payments);
                      return (
                        <tr key={i.id} className="row-link" onClick={() => navigate(`/invoices/${i.id}`)}>
                          <td><p className="num font-medium text-ink">{i.number}</p><p className="truncate text-xs text-ink-3">{db.projects.find((p) => p.id === i.projectId)?.name}</p></td>
                          <td className="text-ink-2">{date(i.issueDate)}</td>
                          <td className="text-ink-2">{date(i.dueDate)}</td>
                          <td className="num text-right text-ink">{inr(f.total)}</td>
                          <td className={clsx('num text-right', f.status === 'Overdue' ? 'text-danger' : 'text-ink')}>{f.status === 'Cancelled' || f.status === 'Draft' ? '—' : inr(f.balance)}</td>
                          <td><StatusBadge status={f.status} /></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
        <div className="flex flex-col gap-5">
          <Card>
            <CardHeader title="Contact & billing" />
            <dl className="flex flex-col gap-4 px-5 pb-5">
              <MetaItem label="Contact person">{c.contactPerson}</MetaItem>
              <MetaItem label="Email"><a href={`mailto:${c.email}`} className="text-accent-text hover:underline">{c.email}</a></MetaItem>
              <MetaItem label="Phone"><a href={`tel:${c.phone.replace(/\s/g, '')}`} className="hover:underline">{c.phone}</a></MetaItem>
              <MetaItem label="Billing address">{c.street}<br />{c.city}, {c.state} {c.pincode}<br />{c.country}</MetaItem>
              <MetaItem label="GSTIN"><span className="num">{c.gstin || 'Unregistered'}</span></MetaItem>
              <MetaItem label="Account manager (USER — MANAGES — CLIENT)"><UserCell user={mgr} size={22} sub={mgr?.email} /></MetaItem>
            </dl>
          </Card>
          <Card>
            <CardHeader title="Recent payments" />
            {payments.length === 0 ? <p className="px-5 pb-5 text-[13px] text-ink-3">No payments recorded.</p> : (
              <ul className="px-3 pb-3">
                {payments.slice(0, 5).map((p) => (
                  <li key={p.id}>
                    <button onClick={() => openDrawer({ kind: 'payment', id: p.id })} className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-hover">
                      <span className="min-w-0 flex-1"><span className="num block text-[13px] font-medium text-ink">{inr(p.amount)}</span><span className="text-xs text-ink-3">{date(p.date)} · {p.method}</span></span>
                      <StatusBadge status={p.status} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card>
            <CardHeader title="Recent activity" />
            <ActivityFeed entries={activity} users={users} limit={6} />
          </Card>
        </div>
      </div>
    </>
  );
}
