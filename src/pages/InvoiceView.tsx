import { useSettings } from '../data/store';
import { useData } from '../lib/useData';
import { navigate } from '../lib/router';
import { openDrawer, openForm } from '../lib/ui';
import { date, inr } from '../lib/format';
import { invoiceFinancials, isIntraState } from '../lib/selectors';
import { Icon } from '../components/icons';
import { Menu } from '../components/ui/overlays';
import { Button, Card, CardHeader, EmptyState, StatusBadge } from '../components/ui/primitives';
import { invoiceActions } from './Invoices';

/** 50976 → "Fifty Thousand Nine Hundred Seventy-Six" (Indian lakh/crore system) */
function inWords(n: number): string {
  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  const two = (x: number) => (x < 20 ? ones[x] : tens[Math.floor(x / 10)] + (x % 10 ? '-' + ones[x % 10] : ''));
  const three = (x: number) => (x >= 100 ? `${ones[Math.floor(x / 100)]} Hundred${x % 100 ? ' ' + two(x % 100) : ''}` : two(x));
  if (n === 0) return 'Zero';
  const parts: string[] = [];
  const crore = Math.floor(n / 1e7); n %= 1e7;
  const lakh = Math.floor(n / 1e5); n %= 1e5;
  const thousand = Math.floor(n / 1e3); n %= 1e3;
  if (crore) parts.push(`${three(crore)} Crore`);
  if (lakh) parts.push(`${two(lakh)} Lakh`);
  if (thousand) parts.push(`${two(thousand)} Thousand`);
  if (n) parts.push(three(n));
  return parts.join(' ');
}

function amountInWords(total: number) {
  const rupees = Math.floor(total);
  const paise = Math.round((total - rupees) * 100);
  return `Rupees ${inWords(rupees)}${paise ? ` and ${inWords(paise)} Paise` : ''} Only`;
}

export function InvoiceViewPage({ id }: { id: string }) {
  const { db, clients, projects, can } = useData();
  const settings = useSettings();
  const inv = db.invoices.find((i) => i.id === id);
  if (!inv) return <EmptyState icon={<Icon.invoices size={20} />} title="Invoice not found" body={`No invoice with ID ${id}, or your role can’t see it.`} action={<Button variant="primary" onClick={() => navigate('/invoices')}>Back to invoices</Button>} />;
  const f = invoiceFinancials(inv, db.payments);
  const client = clients.get(inv.clientId);
  const project = projects.get(inv.projectId);
  const payments = db.payments.filter((p) => p.invoiceId === inv.id).sort((a, b) => a.date.localeCompare(b.date));
  const intra = isIntraState(client, settings.companyGstin);
  const actions = invoiceActions(inv, f, can);
  const primaryPayment = can('write:payments') && inv.state === 'Sent' && f.balance > 0.004;
  const stampColor = { Paid: '#0b875c', Overdue: '#cf2f3f', Cancelled: '#6b7280', Draft: '#6b7280', Sent: '#236bb8', 'Partially Paid': '#a86a0c' }[f.status];

  return (
    <div className="print-root">
      <div className="no-print mb-5 flex flex-wrap items-center gap-3">
        <Button variant="ghost" icon={<Icon.arrowLeft size={15} />} onClick={() => navigate('/invoices')}>Invoices</Button>
        <h1 className="num text-xl font-semibold tracking-[-0.01em] text-ink">{inv.number}</h1>
        <StatusBadge status={f.status} />
        <div className="ml-auto flex flex-wrap gap-2">
          <Button icon={<Icon.print size={15} />} onClick={() => window.print()}>Print / Save as PDF</Button>
          {can('write:invoices') && inv.state !== 'Cancelled' && <Button icon={<Icon.edit size={15} />} onClick={() => openForm({ kind: 'invoice', id: inv.id })}>Edit</Button>}
          {primaryPayment && <Button variant="primary" icon={<Icon.payments size={15} />} onClick={() => openForm({ kind: 'payment', defaults: { invoiceId: inv.id } })}>Record payment</Button>}
          {actions.length > 0 && <Menu label="Invoice actions" items={actions} trigger={(t) => <Button {...t} aria-label="More actions" className="px-2.5!"><Icon.more size={17} /></Button>} />}
        </div>
      </div>

      <div className="print-block grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
        {/* The sheet is always "paper" — light — regardless of the app theme, so it prints correctly. */}
        <article className="invoice-sheet overflow-x-auto rounded-lg border border-line bg-white p-6 text-[#1f2330] sm:p-10" style={{ colorScheme: 'light' }}>
          <div className="min-w-[560px]">
            <header className="flex items-start justify-between gap-6 border-b border-[#e6e8ef] pb-6">
              <div>
                <div className="flex items-center gap-2.5">
                  <svg width="34" height="34" viewBox="0 0 32 32" aria-hidden><rect width="32" height="32" rx="7" fill="#1c1917" /><path d="M10 22V10l12 12V10" stroke="white" strokeWidth="2.6" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  <div>
                    <p className="text-[17px] font-semibold text-[#12141c]">Nexus Studio</p>
                    <p className="text-[11.5px] text-[#666c80]">{settings.companyName}</p>
                  </div>
                </div>
                <p className="mt-3 max-w-[280px] text-[12px] leading-relaxed text-[#474d60]">{settings.companyAddress}</p>
                <p className="mt-1 text-[12px] text-[#474d60]">GSTIN <span className="num font-medium text-[#12141c]">{settings.companyGstin}</span> · PAN {settings.companyPan}</p>
                <p className="text-[12px] text-[#474d60]">{settings.companyEmail} · {settings.companyPhone}</p>
              </div>
              <div className="text-right">
                <p className="text-[22px] font-semibold tracking-[-0.01em] text-[#12141c]">{inv.state === 'Draft' ? 'Draft invoice' : 'Tax invoice'}</p>
                <p className="num mt-1 text-[13px] text-[#474d60]">{inv.number}</p>
                <span className="mt-3 inline-block rounded-md border-2 px-2.5 py-0.5 text-[12px] font-bold tracking-[0.08em] uppercase" style={{ color: stampColor, borderColor: stampColor }}>{f.status}</span>
              </div>
            </header>

            <section className="grid grid-cols-3 gap-6 border-b border-[#e6e8ef] py-6 text-[12.5px]">
              <div>
                <p className="mb-1.5 text-[11.5px] font-medium text-[#666c80]">Bill to</p>
                <p className="font-semibold text-[#12141c]">{client?.companyName}</p>
                <p className="text-[#474d60]">Attn: {client?.contactPerson}</p>
                <p className="text-[#474d60]">{client?.street}</p>
                <p className="text-[#474d60]">{client?.city}, {client?.state} {client?.pincode}</p>
                <p className="num mt-1 text-[#474d60]">GSTIN {client?.gstin || 'Unregistered'}</p>
              </div>
              <div>
                <p className="mb-1.5 text-[11.5px] font-medium text-[#666c80]">Project</p>
                <p className="font-medium text-[#12141c]">{project?.name}</p>
                <p className="num text-[#474d60]">{project?.id}</p>
                <p className="mt-3 mb-1.5 text-[11.5px] font-medium text-[#666c80]">Place of supply</p>
                <p className="text-[#474d60]">{client?.state} {intra ? '(intra-state)' : '(inter-state)'}</p>
              </div>
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 self-start text-right">
                <dt className="text-left text-[#666c80]">Invoice date</dt><dd className="num text-[#12141c]">{date(inv.issueDate)}</dd>
                <dt className="text-left text-[#666c80]">Due date</dt><dd className="num font-medium text-[#12141c]">{date(inv.dueDate)}</dd>
                <dt className="text-left text-[#666c80]">Invoice ID</dt><dd className="num text-[#12141c]">{inv.id}</dd>
                <dt className="text-left text-[#666c80]">Balance due</dt><dd className="num font-semibold text-[#12141c]">{inr(inv.state === 'Cancelled' ? 0 : f.balance, true)}</dd>
              </dl>
            </section>

            <table className="mt-6 w-full text-[12.5px]">
              <thead>
                <tr className="border-b-2 border-[#12141c] text-left text-[11.5px] text-[#474d60]">
                  <th className="py-2 pr-3 font-medium">#</th>
                  <th className="py-2 pr-3 font-medium">Description</th>
                  <th className="py-2 pr-3 font-medium">SAC</th>
                  <th className="py-2 pr-3 text-right font-medium">Qty</th>
                  <th className="py-2 pr-3 text-right font-medium">Rate</th>
                  <th className="py-2 text-right font-medium">Amount</th>
                </tr>
              </thead>
              <tbody>
                {inv.lineItems.map((l, i) => (
                  <tr key={l.id} className="border-b border-[#e6e8ef]">
                    <td className="num py-3 pr-3 text-[#666c80]">{i + 1}</td>
                    <td className="py-3 pr-3 text-[#12141c]">{l.description}</td>
                    <td className="num py-3 pr-3 text-[#666c80]">998314</td>
                    <td className="num py-3 pr-3 text-right">{l.quantity}</td>
                    <td className="num py-3 pr-3 text-right">{inr(l.unitPrice, true)}</td>
                    <td className="num py-3 text-right font-medium text-[#12141c]">{inr(l.quantity * l.unitPrice, true)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="mt-6 flex justify-between gap-8">
              <div className="max-w-[300px] text-[12px] text-[#474d60]">
                <p className="text-[11.5px] font-medium text-[#666c80]">Amount in words</p>
                <p className="mt-1 text-[#12141c]">{amountInWords(f.total)}</p>
                {inv.notes && <><p className="mt-4 text-[11.5px] font-medium text-[#666c80]">Notes</p><p className="mt-1">{inv.notes}</p></>}
              </div>
              <dl className="w-[280px] text-[12.5px]">
                <Line k="Subtotal" v={inr(f.subtotal, true)} />
                {f.discount > 0 && <Line k={`Discount (${inv.discountPct}%)`} v={`− ${inr(f.discount, true)}`} />}
                <Line k="Taxable value" v={inr(f.taxable, true)} />
                {intra ? (
                  <><Line k={`CGST @ ${inv.taxRate / 2}%`} v={inr(f.tax / 2, true)} /><Line k={`SGST @ ${inv.taxRate / 2}%`} v={inr(f.tax / 2, true)} /></>
                ) : <Line k={`IGST @ ${inv.taxRate}%`} v={inr(f.tax, true)} />}
                <div className="mt-2 flex justify-between border-t-2 border-[#12141c] pt-2.5 text-[15px] font-semibold text-[#12141c]"><dt>Total</dt><dd className="num">{inr(f.total, true)}</dd></div>
                {f.paid > 0 && <Line k="Amount paid" v={`− ${inr(f.paid, true)}`} />}
                {inv.state !== 'Cancelled' && <div className="mt-1 flex justify-between rounded-md bg-[#f2f3f7] px-2 py-1.5 font-semibold text-[#12141c]"><dt>Balance due</dt><dd className="num">{inr(f.balance, true)}</dd></div>}
              </dl>
            </div>

            <footer className="mt-10 grid grid-cols-2 gap-6 border-t border-[#e6e8ef] pt-5 text-[11.5px] text-[#474d60]">
              <div>
                <p className="font-medium text-[#12141c]">Payment details</p>
                <p className="mt-1">{settings.bankName}</p>
                <p className="num">A/c {settings.bankAccount} · IFSC {settings.bankIfsc}</p>
                <p className="num">UPI {settings.upiId}</p>
                <p className="mt-1">Terms: payment due by {date(inv.dueDate)}.</p>
              </div>
              <div className="text-right">
                <p>{settings.invoiceFooter}</p>
                <p className="mt-6 font-medium text-[#12141c]">For {settings.companyName}</p>
                <p className="mt-1 text-[10.5px] text-[#666c80]">Computer-generated invoice — no signature required. Demo document with fictional data.</p>
              </div>
            </footer>
          </div>
        </article>

        <aside className="no-print flex flex-col gap-5">
          <Card>
            <CardHeader title="Payment status" />
            <div className="px-5 pb-5">
              <div className="h-2 overflow-hidden rounded-full bg-raised"><div className="h-full rounded-full bg-success" style={{ width: `${f.total ? Math.min(100, (f.paid / f.total) * 100) : 0}%` }} /></div>
              <dl className="mt-4 grid grid-cols-2 gap-3 text-[13px]">
                <div><dt className="text-ink-3">Total</dt><dd className="num font-medium text-ink">{inr(f.total, true)}</dd></div>
                <div><dt className="text-ink-3">Paid</dt><dd className="num font-medium text-success">{inr(f.paid, true)}</dd></div>
                <div><dt className="text-ink-3">Pending clearance</dt><dd className="num font-medium text-ink">{inr(f.pending, true)}</dd></div>
                <div><dt className="text-ink-3">Balance</dt><dd className={`num font-medium ${f.status === 'Overdue' ? 'text-danger' : 'text-ink'}`}>{inr(inv.state === 'Cancelled' ? 0 : f.balance, true)}</dd></div>
              </dl>
              {f.status === 'Overdue' && <p className="mt-4 rounded-lg bg-danger-soft px-3 py-2 text-[13px] text-danger">{f.daysOverdue} days past the due date.</p>}
              {inv.state === 'Draft' && <p className="mt-4 rounded-lg bg-neutral-soft px-3 py-2 text-[13px] text-ink-2">Drafts can’t take payments. Use “Mark as sent” from the ⋯ menu — this only changes the status; no email is sent.</p>}
            </div>
          </Card>
          <Card>
            <CardHeader title="Payments" description={`${payments.length} recorded`} />
            {payments.length === 0 ? <p className="px-5 pb-5 text-[13px] text-ink-3">No payments yet.</p> : (
              <ul className="px-3 pb-3">
                {payments.map((p) => (
                  <li key={p.id}>
                    <button onClick={() => openDrawer({ kind: 'payment', id: p.id })} className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-hover">
                      <span className="min-w-0 flex-1"><span className="num block text-[13px] font-medium text-ink">{inr(p.amount, true)}</span><span className="block truncate text-xs text-ink-3">{date(p.date)} · {p.method} · {p.id}</span></span>
                      <StatusBadge status={p.status} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </aside>
      </div>
    </div>
  );
}

function Line({ k, v }: { k: string; v: string }) {
  return <div className="flex justify-between py-1 text-[#474d60]"><dt>{k}</dt><dd className="num text-[#12141c]">{v}</dd></div>;
}
