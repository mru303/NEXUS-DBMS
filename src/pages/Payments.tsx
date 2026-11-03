import clsx from 'clsx';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { PAYMENT_METHODS, PAYMENT_STATUSES, type Payment } from '../data/types';
import { deletePaymentApi } from '../data/store';
import { useData } from '../lib/useData';
import { navigate, useQueryState } from '../lib/router';
import { openDrawer, openForm } from '../lib/ui';
import { addDays, startOfMonth, today } from '../lib/dates';
import { date, inr } from '../lib/format';
import { downloadCsv } from '../lib/csv';
import { Icon } from '../components/icons';
import { HBarList } from '../components/charts';
import { RowActions, confirmDialog, notify } from '../components/ui/overlays';
import { Button, Card, CardHeader, EmptyState, FilterSelect, IdChip, PageHeader, Pagination, SearchInput, StatStrip, StatusBadge } from '../components/ui/primitives';

const METHOD_ICON: Record<string, ReactNode> = {
  UPI: <Icon.phoneApp size={15} />, 'Bank Transfer': <Icon.bank size={15} />, 'Credit/Debit Card': <Icon.card size={15} />, Cash: <Icon.cash size={15} />, Cheque: <Icon.file size={15} />,
};
const PAGE = 12;

export function PaymentsPage() {
  const { db, clients, invoices, can } = useData();
  const [q, setQ] = useQueryState('q');
  const [method, setMethod] = useQueryState('method');
  const [client, setClient] = useQueryState('client');
  const [status, setStatus] = useQueryState('status');
  const [from, setFrom] = useQueryState('from');
  const [to, setTo] = useQueryState('to');
  const [page, setPage] = useState(1);
  useEffect(() => setPage(1), [q, method, client, status, from, to]);

  const now = today();
  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    return db.payments.filter((p) => {
      const inv = invoices.get(p.invoiceId);
      if (term && !`${p.id} ${p.reference} ${inv?.number} ${clients.get(inv?.clientId ?? '')?.companyName} ${p.notes}`.toLowerCase().includes(term)) return false;
      if (method && p.method !== method) return false;
      if (status && p.status !== status) return false;
      if (client && inv?.clientId !== client) return false;
      if (from && p.date < from) return false;
      if (to && p.date > to) return false;
      return true;
    }).sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
  }, [db.payments, q, method, status, client, from, to, invoices, clients]);

  const completed = (list: Payment[]) => list.filter((p) => p.status === 'Completed').reduce((s, p) => s + p.amount, 0);
  const summary = {
    filtered: completed(rows),
    month: completed(db.payments.filter((p) => p.date >= startOfMonth(now))),
    last30: completed(db.payments.filter((p) => p.date >= addDays(now, -29))),
    pending: db.payments.filter((p) => p.status === 'Pending').reduce((s, p) => s + p.amount, 0),
    failed: db.payments.filter((p) => p.status === 'Failed').length,
  };
  const byMethod = PAYMENT_METHODS.map((m) => ({ key: m, label: <span className="inline-flex items-center gap-2"><span className="text-ink-3">{METHOD_ICON[m]}</span>{m}</span>, value: completed(rows.filter((p) => p.method === m)), onClick: () => setMethod(method === m ? '' : m) }));
  const filtersOn = !!(q || method || client || status || from || to);
  const clear = () => { setQ(''); setMethod(''); setClient(''); setStatus(''); setFrom(''); setTo(''); };

  const exportCsv = () => downloadCsv('nexus-payments.csv', ['Payment ID', 'Invoice', 'Client', 'Date', 'Amount', 'Method', 'Reference', 'Status', 'Notes'],
    rows.map((p) => { const inv = invoices.get(p.invoiceId); return [p.id, inv?.number, clients.get(inv?.clientId ?? '')?.companyName, p.date, p.amount, p.method, p.reference, p.status, p.notes]; }));

  return (
    <>
      <PageHeader
        title="Payments"
        description="Ledger of money received against invoices. Recording a payment updates the invoice’s paid amount, balance and status."
        actions={<>
          <Button icon={<Icon.download size={15} />} onClick={exportCsv}>Export CSV</Button>
          {can('write:payments') && <Button variant="primary" icon={<Icon.plus size={16} />} onClick={() => openForm({ kind: 'payment' })}>Record payment</Button>}
        </>}
      />
      <StatStrip className="mb-5" items={[
        { label: 'Collected this month', value: inr(summary.month), sub: `${inr(summary.last30)} in the last 30 days` },
        { label: 'Matching filter (completed)', value: inr(summary.filtered), sub: `${rows.length} transactions` },
        { label: 'Pending clearance', value: inr(summary.pending), sub: 'Cheques & transfers not yet cleared', onClick: () => setStatus(status === 'Pending' ? '' : 'Pending'), active: status === 'Pending' },
        { label: 'Failed attempts', value: summary.failed, tone: summary.failed ? 'danger' : undefined, sub: 'Not counted towards balances', onClick: () => setStatus(status === 'Failed' ? '' : 'Failed'), active: status === 'Failed' },
      ]} />

      <div className="grid grid-cols-1 gap-5 2xl:grid-cols-[minmax(0,1fr)_300px]">
        <Card className="min-w-0 overflow-hidden">
          <div className="flex flex-wrap items-center gap-2 border-b border-line p-3">
            <SearchInput value={q} onChange={setQ} placeholder="ID, reference, invoice, client…" className="w-full sm:w-64" />
            <FilterSelect label="Method" value={method} onChange={setMethod}><option value="">All methods</option>{PAYMENT_METHODS.map((m) => <option key={m}>{m}</option>)}</FilterSelect>
            <FilterSelect label="Status" value={status} onChange={setStatus}><option value="">All statuses</option>{PAYMENT_STATUSES.map((m) => <option key={m}>{m}</option>)}</FilterSelect>
            {db.clients.length > 1 && <FilterSelect label="Client" value={client} onChange={setClient}><option value="">All clients</option>{db.clients.filter((c) => db.invoices.some((i) => i.clientId === c.id && db.payments.some((p) => p.invoiceId === i.id))).map((c) => <option key={c.id} value={c.id}>{c.companyName}</option>)}</FilterSelect>}
            <div className="flex items-center gap-1.5">
              <input type="date" aria-label="From date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} className="field h-9! w-auto! text-[13px]" />
              <span className="text-ink-3">–</span>
              <input type="date" aria-label="To date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} className="field h-9! w-auto! text-[13px]" />
            </div>
            {filtersOn && <Button size="sm" variant="ghost" icon={<Icon.x size={14} />} onClick={clear}>Clear</Button>}
          </div>
          {rows.length === 0 ? (
            <EmptyState icon={<Icon.payments size={20} />} title={filtersOn ? 'No payments match' : 'No payments yet'} body={filtersOn ? 'Adjust the filters or date range.' : 'Record a payment when a client pays an invoice.'} action={filtersOn ? <Button onClick={clear}>Clear filters</Button> : undefined} />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-[13px]">
                <thead className="table-head"><tr><th>Payment</th><th>Invoice · client</th><th>Date</th><th>Method</th><th>Reference</th><th className="text-right!">Amount</th><th>Status</th><th><span className="sr-only">Actions</span></th></tr></thead>
                <tbody className="table-body">
                  {rows.slice((page - 1) * PAGE, page * PAGE).map((p) => {
                    const inv = invoices.get(p.invoiceId);
                    return (
                      <tr key={p.id} className="row-link" onClick={() => openDrawer({ kind: 'payment', id: p.id })}>
                        <td><IdChip>{p.id}</IdChip></td>
                        <td className="max-w-[240px]"><button onClick={(e) => { e.stopPropagation(); navigate(`/invoices/${p.invoiceId}`); }} className="num text-ink hover:underline">{inv?.number}</button><p className="truncate text-xs text-ink-3">{clients.get(inv?.clientId ?? '')?.companyName}</p></td>
                        <td className="whitespace-nowrap text-ink-2">{date(p.date)}</td>
                        <td><span className="inline-flex items-center gap-2 whitespace-nowrap text-ink-2"><span className="text-ink-3">{METHOD_ICON[p.method]}</span>{p.method}</span></td>
                        <td className="num max-w-[180px] truncate text-xs text-ink-3">{p.reference || '—'}</td>
                        <td className={clsx('num text-right font-medium', p.status === 'Failed' || p.status === 'Refunded' ? 'text-ink-3 line-through' : 'text-ink')}>{inr(p.amount, true)}</td>
                        <td><StatusBadge status={p.status} /></td>
                        <td className="w-10">
                          <RowActions items={[
                            { label: 'View details', icon: <Icon.eye size={15} />, onSelect: () => openDrawer({ kind: 'payment', id: p.id }) },
                            { label: 'Open invoice', icon: <Icon.invoices size={15} />, onSelect: () => navigate(`/invoices/${p.invoiceId}`) },
                            ...(can('write:payments') ? [
                              { label: 'Edit', icon: <Icon.edit size={15} />, onSelect: () => openForm({ kind: 'payment', id: p.id }) },
                              { label: 'Delete', icon: <Icon.trash size={15} />, danger: true, divider: true, onSelect: async () => { if (await confirmDialog({ title: `Delete payment ${p.id}?`, body: `Invoice ${inv?.number} will be recalculated.`, confirmLabel: 'Delete payment' })) notify(await deletePaymentApi(p.id)); } },
                            ] : []),
                          ]} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <Pagination page={page} pageSize={PAGE} total={rows.length} onPage={setPage} />
        </Card>
        <Card className="2xl:self-start">
          <CardHeader title="By payment method" description="Completed payments in the current filter" />
          <div className="px-5 pb-5"><HBarList items={byMethod} format={(n) => inr(n)} /></div>
        </Card>
      </div>
    </>
  );
}
