import clsx from 'clsx';
import { useEffect, useMemo, useState } from 'react';
import { INVOICE_STATUSES, type Invoice } from '../data/types';
import { deleteInvoiceApi, getState, updateInvoiceApi } from '../data/store';
import { useData } from '../lib/useData';
import { navigate, useQueryState } from '../lib/router';
import { openForm } from '../lib/ui';
import { date, inr } from '../lib/format';
import { invoiceFinancials, isOutstanding, type InvoiceFinancials } from '../lib/selectors';
import { downloadCsv } from '../lib/csv';
import { Icon } from '../components/icons';
import { RowActions, confirmDialog, notify, type MenuItem } from '../components/ui/overlays';
import { Button, Card, EmptyState, FilterSelect, PageHeader, Pagination, SearchInput, StatStrip, StatusBadge, Tabs } from '../components/ui/primitives';
import { DueDate } from '../components/common';

export async function confirmCancelInvoice(inv: Invoice) {
  const ok = await confirmDialog({ title: `Cancel invoice ${inv.number}?`, body: 'The invoice stays on record (for audit) but no longer counts as money owed. Invoices with payments can’t be cancelled.', confirmLabel: 'Cancel invoice' });
  return ok && notify(await updateInvoiceApi(inv.id, { state: 'Cancelled' }));
}

export async function confirmDeleteInvoice(inv: Invoice) {
  const n = getState().db.payments.filter((p) => p.invoiceId === inv.id).length;
  if (n) { notify({ ok: false, error: `Can’t delete ${inv.number}: ${n} payment record(s) reference it. Cancel the invoice instead to keep the audit trail.` }); return false; }
  const ok = await confirmDialog({ title: `Delete invoice ${inv.number}?`, body: 'This removes the invoice and its line items permanently. Prefer “Cancel” for invoices already sent to a client.', confirmLabel: 'Delete invoice' });
  return ok && notify(await deleteInvoiceApi(inv.id));
}

export function invoiceActions(inv: Invoice, f: InvoiceFinancials, can: (p: 'write:invoices' | 'write:payments') => boolean, opts: { includeView?: boolean } = {}): MenuItem[] {
  const items: MenuItem[] = [];
  if (opts.includeView) items.push({ label: 'View invoice', icon: <Icon.eye size={15} />, onSelect: () => navigate(`/invoices/${inv.id}`) });
  if (can('write:payments') && inv.state === 'Sent' && f.balance > 0.004) items.push({ label: 'Record payment', icon: <Icon.payments size={15} />, onSelect: () => openForm({ kind: 'payment', defaults: { invoiceId: inv.id } }) });
  if (can('write:invoices')) {
    if (inv.state === 'Draft') items.push({ label: 'Mark as sent', icon: <Icon.send size={15} />, onSelect: () => { void updateInvoiceApi(inv.id, { state: 'Sent' }).then(notify); } });
    if (inv.state !== 'Cancelled') items.push({ label: 'Edit', icon: <Icon.edit size={15} />, onSelect: () => openForm({ kind: 'invoice', id: inv.id }) });
    if (inv.state === 'Sent' && f.paid <= 0.004 && f.pending <= 0.004) items.push({ label: 'Cancel invoice', icon: <Icon.ban size={15} />, divider: true, onSelect: () => { void confirmCancelInvoice(inv); } });
    items.push({ label: 'Delete', icon: <Icon.trash size={15} />, danger: true, divider: inv.state !== 'Sent' || f.paid > 0.004 || f.pending > 0.004, onSelect: () => { void confirmDeleteInvoice(inv); } });
  }
  return items;
}

const PAGE = 10;

export function InvoicesPage() {
  const { db, clients, projects, can } = useData();
  const [status, setStatus] = useQueryState('status');
  const [q, setQ] = useQueryState('q');
  const [client, setClient] = useQueryState('client');
  const [page, setPage] = useState(1);
  useEffect(() => setPage(1), [status, q, client]);

  const all = useMemo(() => db.invoices.map((i) => ({ inv: i, f: invoiceFinancials(i, db.payments) })), [db]);
  const summary = useMemo(() => {
    let invoiced = 0, paid = 0, pending = 0, overdue = 0, overdueN = 0, pendingN = 0;
    for (const { f } of all) {
      if (f.status === 'Draft' || f.status === 'Cancelled') continue;
      invoiced += f.total;
      paid += f.paid;
      if (f.status === 'Overdue') { overdue += f.balance; overdueN++; }
      else if (isOutstanding(f.status)) { pending += f.balance; pendingN++; }
    }
    return { invoiced, paid, pending, overdue, overdueN, pendingN };
  }, [all]);

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    return all.filter(({ inv, f }) => {
      if (status === 'Outstanding' ? !isOutstanding(f.status) : status && f.status !== status) return false;
      if (client && inv.clientId !== client) return false;
      if (term && !`${inv.number} ${inv.id} ${clients.get(inv.clientId)?.companyName} ${projects.get(inv.projectId)?.name}`.toLowerCase().includes(term)) return false;
      return true;
    }).sort((a, b) => b.inv.issueDate.localeCompare(a.inv.issueDate) || b.inv.number.localeCompare(a.inv.number));
  }, [all, status, client, q, clients, projects]);

  const count = (s: string) => all.filter(({ f }) => (s === 'Outstanding' ? isOutstanding(f.status) : f.status === s)).length;
  const exportCsv = () => downloadCsv('nexus-invoices.csv', ['Invoice ID', 'Number', 'Client', 'Project', 'Issue date', 'Due date', 'Subtotal', 'Discount', 'GST', 'Total', 'Paid', 'Balance', 'Status'],
    rows.map(({ inv, f }) => [inv.id, inv.number, clients.get(inv.clientId)?.companyName, projects.get(inv.projectId)?.name, inv.issueDate, inv.dueDate, f.subtotal, f.discount, f.tax, f.total, f.paid, f.balance, f.status]));

  const cards = [
    { label: 'Total invoiced', value: summary.invoiced, sub: 'Sent invoices, incl. GST', danger: false, status: '' },
    { label: 'Paid', value: summary.paid, sub: `${Math.round((summary.paid / (summary.invoiced || 1)) * 100)}% collected`, danger: false, status: 'Paid' },
    { label: 'Pending', value: summary.pending, sub: `${summary.pendingN} not yet due`, danger: false, status: 'Outstanding' },
    { label: 'Overdue', value: summary.overdue, sub: `${summary.overdueN} past due date`, danger: summary.overdue > 0, status: 'Overdue' },
  ];

  return (
    <>
      <PageHeader
        title="Invoices"
        description="GST invoices for client projects. Amount paid, balance and status are computed from recorded payments."
        actions={<>
          <Button icon={<Icon.download size={15} />} onClick={exportCsv}>Export CSV</Button>
          {can('write:invoices') && <Button variant="primary" icon={<Icon.plus size={16} />} onClick={() => openForm({ kind: 'invoice' })}>Create invoice</Button>}
        </>}
      />
      <StatStrip className="mb-5" items={cards.map((c) => ({ label: c.label, value: inr(c.value), sub: c.sub, tone: c.danger ? 'danger' as const : undefined, onClick: () => setStatus(c.status), active: !!c.status && status === c.status }))} />

      <Card className="overflow-hidden">
        <Tabs
          value={status}
          onChange={setStatus}
          className="px-3"
          tabs={[{ value: '', label: 'All', count: all.length }, { value: 'Outstanding', label: 'Outstanding', count: count('Outstanding') }, ...INVOICE_STATUSES.map((s) => ({ value: s, label: s, count: count(s) }))]}
        />
        <div className="flex flex-wrap items-center gap-2 border-b border-line p-3">
          <SearchInput value={q} onChange={setQ} placeholder="Search number, client, project…" className="w-full sm:w-72" />
          {db.clients.length > 1 && (
            <FilterSelect label="Client" value={client} onChange={setClient}>
              <option value="">All clients</option>
              {db.clients.filter((c) => db.invoices.some((i) => i.clientId === c.id)).map((c) => <option key={c.id} value={c.id}>{c.companyName}</option>)}
            </FilterSelect>
          )}
          {(q || client || status) && <Button size="sm" variant="ghost" icon={<Icon.x size={14} />} onClick={() => { setQ(''); setClient(''); setStatus(''); }}>Clear</Button>}
        </div>
        {rows.length === 0 ? (
          <EmptyState icon={<Icon.invoices size={20} />} title={status || q || client ? 'No invoices match' : 'No invoices yet'} body={status ? `There are no ${status.toLowerCase()} invoices right now.` : 'Create an invoice from a project’s billable work.'} action={can('write:invoices') && !status ? <Button variant="primary" onClick={() => openForm({ kind: 'invoice' })}>Create invoice</Button> : undefined} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1000px] text-[13px]">
              <thead className="table-head"><tr><th>Invoice</th><th>Client · project</th><th>Issued</th><th>Due</th><th className="text-right!">Total</th><th className="text-right!">Paid</th><th className="text-right!">Balance</th><th>Status</th><th><span className="sr-only">Actions</span></th></tr></thead>
              <tbody className="table-body">
                {rows.slice((page - 1) * PAGE, page * PAGE).map(({ inv, f }) => (
                  <tr key={inv.id} className="row-link" onClick={() => navigate(`/invoices/${inv.id}`)}>
                    <td><p className="num font-medium text-ink">{inv.number}</p><p className="num text-xs text-ink-3">{inv.id}</p></td>
                    <td className="max-w-[260px]"><p className="truncate text-ink">{clients.get(inv.clientId)?.companyName}</p><p className="truncate text-xs text-ink-3">{projects.get(inv.projectId)?.name}</p></td>
                    <td className="whitespace-nowrap text-ink-2">{date(inv.issueDate)}</td>
                    <td>{isOutstanding(f.status) ? <DueDate date={inv.dueDate} /> : <span className="whitespace-nowrap text-ink-2">{date(inv.dueDate)}</span>}</td>
                    <td className="num text-right text-ink">{inr(f.total, true)}</td>
                    <td className="num text-right text-ink-2">{f.paid ? inr(f.paid, true) : '—'}{f.pending > 0 && <span className="block text-xs text-warning">+{inr(f.pending)} pending</span>}</td>
                    <td className={clsx('num text-right font-medium', f.status === 'Overdue' ? 'text-danger' : 'text-ink')}>{f.status === 'Cancelled' || f.status === 'Draft' ? <span className="font-normal text-ink-3">—</span> : inr(f.balance, true)}</td>
                    <td><StatusBadge status={f.status} /></td>
                    <td className="w-10"><RowActions items={invoiceActions(inv, f, can, { includeView: true })} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pagination page={page} pageSize={PAGE} total={rows.length} onPage={setPage} />
      </Card>
    </>
  );
}
