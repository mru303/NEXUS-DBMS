import { useMemo, useState } from 'react';
import { PAYMENT_METHODS } from '../data/types';
import { useData } from '../lib/useData';
import { navigate } from '../lib/router';
import { RANGE_LABELS, daysBetween, inRange, resolveRange, type RangeKey } from '../lib/dates';
import { hours, inr, inrCompact, pct } from '../lib/format';
import { AGING_BUCKETS, agingBucket, invoiceFinancials, isOutstanding, projectStats, sessionDate, sessionHours } from '../lib/selectors';
import { collectedBetween, hoursBetweenDates, hoursSeries, invoicedBetween, revenueSeries } from '../lib/analytics';
import { Icon } from '../components/icons';
import { BarChart, HBarList, Legend } from '../components/charts';
import { Button, PageHeader, StatStrip } from '../components/ui/primitives';
import { ChartCard, RangeSelect } from '../components/common';

export function ReportsPage() {
  const { db, clients } = useData();
  const [rangeKey, setRangeKey] = useState<RangeKey>('12m');
  const range = useMemo(() => resolveRange(rangeKey), [rangeKey]);
  const monthly = useMemo(() => resolveRange(rangeKey === '7d' || rangeKey === '30d' ? '90d' : rangeKey), [rangeKey]);

  const data = useMemo(() => {
    const rev = revenueSeries(db, { ...monthly, bucket: monthly.bucket === 'day' ? 'week' : monthly.bucket });
    const collected = collectedBetween(db, range.from, range.to);
    const invoiced = invoicedBetween(db, range.from, range.to);
    const billable = hoursBetweenDates(db, range.from, range.to, { billable: true });
    const total = hoursBetweenDates(db, range.from, range.to);
    // Average days from issue to full payment, for invoices fully paid in range
    const paidDurations: number[] = [];
    for (const inv of db.invoices) {
      const f = invoiceFinancials(inv, db.payments);
      if (f.status !== 'Paid') continue;
      const last = db.payments.filter((p) => p.invoiceId === inv.id && p.status === 'Completed').map((p) => p.date).sort().pop();
      if (last && inRange(last, range.from, range.to)) paidDurations.push(daysBetween(inv.issueDate, last));
    }
    const avgDays = paidDurations.length ? paidDurations.reduce((a, b) => a + b, 0) / paidDurations.length : 0;

    const outstanding = db.invoices.map((i) => ({ i, f: invoiceFinancials(i, db.payments) })).filter((r) => isOutstanding(r.f.status));
    const aging = AGING_BUCKETS.map((b) => {
      const rows = outstanding.filter((r) => agingBucket(r.f) === b);
      return { label: b, value: rows.reduce((s, r) => s + r.f.balance, 0), count: rows.length };
    });

    const projectsLive = db.projects.filter((p) => p.status !== 'Cancelled');
    const budget = projectsLive.map((p) => ({ p, s: projectStats(p, db) })).sort((a, b) => b.s.costToDate / (b.p.budget || 1) - a.s.costToDate / (a.p.budget || 1));
    const hs = hoursSeries(db, { ...range, bucket: range.bucket === 'day' ? 'day' : range.bucket });

    const staff = db.users.filter((u) => u.role !== 'Client');
    const workload = staff.map((u) => {
      const ss = db.sessions.filter((s) => s.userId === u.id && inRange(sessionDate(s), range.from, range.to));
      const h = ss.reduce((a, s) => a + sessionHours(s), 0);
      const b = ss.filter((s) => s.billable).reduce((a, s) => a + sessionHours(s), 0);
      const open = db.tasks.filter((t) => t.assigneeId === u.id && t.status !== 'Completed' && db.projects.find((p) => p.id === t.projectId)?.status !== 'Cancelled').length;
      return { u, h, b, open };
    }).filter((w) => w.h > 0 || w.open > 0).sort((a, b) => b.h - a.h);

    const completion = db.projects.filter((p) => p.status === 'In Progress' || p.status === 'On Hold' || p.status === 'Planning').map((p) => ({ p, s: projectStats(p, db) })).sort((a, b) => b.s.progress - a.s.progress);

    const methods = PAYMENT_METHODS.map((m) => {
      const ps = db.payments.filter((p) => p.method === m && p.status === 'Completed' && inRange(p.date, range.from, range.to));
      return { m, value: ps.reduce((s, p) => s + p.amount, 0), count: ps.length };
    }).sort((a, b) => b.value - a.value);

    return { rev, collected, invoiced, billable, total, avgDays, paidCount: paidDurations.length, aging, budget, hs, workload, completion, methods };
  }, [db, range, monthly]);

  return (
    <>
      <PageHeader
        title="Reports"
        description="Financial and delivery analytics computed live from the seven tables. Every chart has a data-table view and CSV export."
        actions={<>
          <RangeSelect value={rangeKey} onChange={setRangeKey} options={['30d', '90d', 'quarter', '6m', '12m', 'ytd', 'all']} />
          <Button icon={<Icon.database size={15} />} onClick={() => navigate('/settings?tab=database')}>Database overview</Button>
        </>}
      />

      <StatStrip className="mb-5" items={[
        { label: 'Collected', value: inr(data.collected), sub: RANGE_LABELS[rangeKey] },
        { label: 'Invoiced (incl. GST)', value: inr(data.invoiced), sub: `Collection ratio ${data.invoiced ? pct((data.collected / data.invoiced) * 100) : '—'}` },
        { label: 'Billable utilisation', value: data.total ? pct((data.billable / data.total) * 100) : '—', sub: `${hours(data.billable)} of ${hours(data.total)} logged` },
        { label: 'Average days to get paid', value: data.paidCount ? `${data.avgDays.toFixed(1)} days` : '—', sub: `${data.paidCount} invoices fully paid in range` },
      ]} />

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <ChartCard
          title="Revenue by period"
          description="Invoiced (when issued) vs collected (when paid)"
          legend={<Legend series={[{ name: 'Invoiced', color: 'var(--viz-2)' }, { name: 'Collected', color: 'var(--viz-1)' }]} />}
          csvName="nexus-revenue.csv"
          table={{ headers: ['Period', 'Invoiced', 'Collected'], rows: data.rev.map((r) => [r.label, Math.round(r.invoiced), Math.round(r.collected)]), display: data.rev.map((r) => [r.label, inr(r.invoiced), inr(r.collected)]) }}
        >
          <BarChart ariaLabel="Invoiced and collected revenue by period" data={data.rev.map((r) => ({ label: r.label, title: r.title, values: [r.invoiced, r.collected] }))} series={[{ name: 'Invoiced', color: 'var(--viz-2)' }, { name: 'Collected', color: 'var(--viz-1)' }]} format={(n) => inr(n)} axisFormat={inrCompact} />
        </ChartCard>

        <ChartCard
          title="Outstanding invoices by age"
          description="Days past due date, as of today"
          csvName="nexus-aging.csv"
          table={{ headers: ['Age', 'Invoices', 'Balance'], rows: data.aging.map((a) => [a.label, a.count, Math.round(a.value)]), display: data.aging.map((a) => [a.label, a.count, inr(a.value)]) }}
        >
          <BarChart ariaLabel="Outstanding balance by age bucket" data={data.aging.map((a) => ({ label: a.label, title: `${a.label} · ${a.count} invoice${a.count === 1 ? '' : 's'}`, values: [a.value] }))} series={[{ name: 'Balance due', color: 'var(--viz-1)' }]} format={(n) => inr(n)} axisFormat={inrCompact} onSelect={(i) => navigate(i === 0 ? '/invoices?status=Outstanding' : '/invoices?status=Overdue')} />
        </ChartCard>

        <ChartCard
          title="Budget vs actual cost"
          description="Logged hours × rate; the marker is the budget"
          csvName="nexus-budget-vs-actual.csv"
          table={{ headers: ['Project', 'Budget', 'Actual cost', 'Used %'], rows: data.budget.map(({ p, s }) => [p.name, p.budget, Math.round(s.costToDate), Math.round((s.costToDate / (p.budget || 1)) * 100)]), display: data.budget.map(({ p, s }) => [p.name, inr(p.budget), inr(s.costToDate), pct((s.costToDate / (p.budget || 1)) * 100)]) }}
        >
          <div className="max-h-[300px] overflow-y-auto pr-1">
            <HBarList referenceLabel="Budget" format={inrCompact} items={data.budget.map(({ p, s }) => ({ key: p.id, label: p.name, value: s.costToDate, reference: p.budget, onClick: () => navigate(`/projects/${p.id}`) }))} />
          </div>
        </ChartCard>

        <ChartCard
          title="Billable vs non-billable hours"
          description={`${hours(data.billable)} billable · ${hours(data.total - data.billable)} non-billable`}
          legend={<Legend series={[{ name: 'Billable', color: 'var(--viz-1)' }, { name: 'Non-billable', color: 'var(--viz-muted)' }]} />}
          csvName="nexus-hours.csv"
          table={{ headers: ['Period', 'Billable h', 'Non-billable h'], rows: data.hs.map((h) => [h.label, +h.billable.toFixed(2), +h.nonBillable.toFixed(2)]) }}
        >
          <BarChart stacked ariaLabel="Billable and non-billable hours per period" data={data.hs.map((h) => ({ label: h.label, values: [h.billable, h.nonBillable] }))} series={[{ name: 'Billable', color: 'var(--viz-1)' }, { name: 'Non-billable', color: 'var(--viz-muted)' }]} format={(n) => hours(n)} axisFormat={(n) => `${n}h`} />
        </ChartCard>

        <ChartCard
          title="Employee workload"
          description="Hours logged in range · open tasks right now"
          csvName="nexus-workload.csv"
          table={{ headers: ['Person', 'Hours', 'Billable %', 'Open tasks'], rows: data.workload.map((w) => [w.u.fullName, +w.h.toFixed(1), w.h ? Math.round((w.b / w.h) * 100) : 0, w.open]) }}
        >
          <HBarList format={(n) => hours(n)} items={data.workload.map((w) => ({ key: w.u.id, label: <span>{w.u.fullName}<span className="text-ink-3"> · {w.u.department}</span></span>, value: w.h, sub: `${w.open} open task${w.open === 1 ? '' : 's'} · ${w.h ? Math.round((w.b / w.h) * 100) : 0}% billable${w.u.status === 'Inactive' ? ' · inactive' : ''}`, onClick: () => navigate(`/time?user=${w.u.id}&period=all`) }))} />
        </ChartCard>

        <ChartCard
          title="Project completion"
          description="Open projects · completion weighted by estimated hours"
          csvName="nexus-completion.csv"
          table={{ headers: ['Project', 'Completion %', 'Tasks done', 'Tasks total'], rows: data.completion.map(({ p, s }) => [p.name, s.progress, s.doneCount, s.taskCount]) }}
        >
          <HBarList max={100} format={(n) => `${Math.round(n)}%`} items={data.completion.map(({ p, s }) => ({ key: p.id, label: <span>{p.name}<span className="text-ink-3"> · {clients.get(p.clientId)?.companyName}</span></span>, value: s.progress, sub: `${s.doneCount}/${s.taskCount} tasks · ${p.status}${s.overdueTasks ? ` · ${s.overdueTasks} overdue` : ''}`, color: p.status === 'On Hold' ? 'var(--c-warning)' : 'var(--viz-1)', onClick: () => navigate(`/projects/${p.id}`) }))} />
        </ChartCard>

        <ChartCard
          title="Payment methods"
          description="Completed payments in range"
          csvName="nexus-payment-methods.csv"
          className="xl:col-span-2"
          table={{ headers: ['Method', 'Payments', 'Amount'], rows: data.methods.map((m) => [m.m, m.count, Math.round(m.value)]), display: data.methods.map((m) => [m.m, m.count, inr(m.value)]) }}
        >
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
            <HBarList format={(n) => inr(n)} items={data.methods.map((m) => ({ key: m.m, label: m.m, value: m.value, sub: `${m.count} payment${m.count === 1 ? '' : 's'} · ${data.collected ? pct((m.value / data.collected) * 100) : '0%'}`, onClick: () => navigate(`/payments?method=${encodeURIComponent(m.m)}&from=${range.from}`) }))} />
            <div className="rounded-lg border border-line bg-raised p-4 text-[13px] leading-relaxed text-ink-2">
              <p className="font-medium text-ink">Reading this report</p>
              <p className="mt-1">Only payments with status <b>Completed</b> are counted. Pending cheques reserve the invoice balance but aren’t revenue until they clear; failed attempts are ignored.</p>
              <p className="mt-2">Equivalent SQL:</p>
              <pre className="mt-1 overflow-x-auto rounded-lg bg-surface p-3 text-[12px] text-ink-2"><code>{`SELECT payment_method, COUNT(*), SUM(amount)
FROM payments
WHERE payment_status = 'Completed'
  AND payment_date BETWEEN '${range.from}' AND '${range.to}'
GROUP BY payment_method
ORDER BY SUM(amount) DESC;`}</code></pre>
            </div>
          </div>
        </ChartCard>
      </div>
    </>
  );
}
