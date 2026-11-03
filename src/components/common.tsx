/* Shared building blocks used across several pages. */
import clsx from 'clsx';
import { useState, type ReactNode } from 'react';
import type { ActivityEntry, ID, ISODate, User } from '../data/types';
import { RANGE_LABELS, daysBetween, today, type RangeKey } from '../lib/dates';
import { date as fmtDate, timeAgo } from '../lib/format';
import { downloadCsv } from '../lib/csv';
import { Link } from '../lib/router';
import { Icon } from './icons';
import { Avatar, Card, CardHeader, EmptyState, IconButton } from './ui/primitives';

export function UserCell({ user, sub, size = 26 }: { user?: User; sub?: ReactNode; size?: number }) {
  if (!user) return <span className="text-ink-3">Unassigned</span>;
  return (
    <span className="flex min-w-0 items-center gap-2.5">
      <Avatar id={user.id} name={user.fullName} size={size} />
      <span className="min-w-0">
        <span className="block truncate text-[13px] text-ink">{user.fullName}</span>
        {sub && <span className="block truncate text-xs text-ink-3">{sub}</span>}
      </span>
    </span>
  );
}

/** Deadline with relative hint; red when overdue */
export function DueDate({ date, done, className }: { date: ISODate; done?: boolean; className?: string }) {
  const d = daysBetween(today(), date);
  const overdue = !done && d < 0;
  const soon = !done && d >= 0 && d <= 3;
  return (
    <span className={clsx('flex flex-col', className)}>
      <span className="num text-[13px] whitespace-nowrap text-ink">{fmtDate(date)}</span>
      {!done && (
        <span className={clsx('text-xs whitespace-nowrap', overdue ? 'font-medium text-danger' : soon ? 'text-warning' : 'text-ink-3')}>
          {overdue ? (
            <span>{-d} day{d === -1 ? '' : 's'} overdue</span>
          ) : d === 0 ? 'Due today' : `in ${d} day${d === 1 ? '' : 's'}`}
        </span>
      )}
    </span>
  );
}

export function RangeSelect({ value, onChange, options = ['7d', '30d', '90d', 'month', 'quarter', '6m', '12m', 'ytd'] }: { value: RangeKey; onChange: (v: RangeKey) => void; options?: RangeKey[] }) {
  return (
    <div className="relative">
      <Icon.calendar size={15} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-3" />
      <select aria-label="Date range" value={value} onChange={(e) => onChange(e.target.value as RangeKey)} className="field h-9! w-auto! pl-9! text-[13px]">
        {options.map((o) => <option key={o} value={o}>{RANGE_LABELS[o]}</option>)}
      </select>
    </div>
  );
}

export function ActivityFeed({ entries, users, limit = 8, empty = 'No activity yet.' }: { entries: ActivityEntry[]; users: Map<ID, User>; limit?: number; empty?: string }) {
  const [showAll, setShowAll] = useState(false);
  const list = showAll ? entries.slice(0, 60) : entries.slice(0, limit);
  if (!entries.length) return <p className="px-5 pb-5 text-[13px] text-ink-3">{empty}</p>;
  return (
    <div className="px-5 pb-4">
      <ol className="flex flex-col divide-y divide-line">
        {list.map((a) => {
          const actor = a.actorId ? users.get(a.actorId) : undefined;
          return (
            <li key={a.id} className="flex items-baseline justify-between gap-4 py-2.5 first:pt-0">
              <p className="min-w-0 text-[13px] leading-snug text-ink-2">
                <span className="font-medium text-ink">{actor?.fullName ?? 'System'}</span> {a.message}
              </p>
              <span className="shrink-0 text-xs whitespace-nowrap text-ink-3">{timeAgo(a.at)}</span>
            </li>
          );
        })}
      </ol>
      {entries.length > limit && (
        <button onClick={() => setShowAll((s) => !s)} className="mt-2 text-[12.5px] font-medium text-accent-text hover:underline">
          {showAll ? 'Show less' : `Show more (${Math.min(entries.length, 60) - limit})`}
        </button>
      )}
    </div>
  );
}

/** Card that can flip between a chart and its data table, with CSV export. */
export function ChartCard({ title, description, children, table, csvName, actions, className, legend }: {
  title: string;
  description?: ReactNode;
  children: ReactNode;
  table?: { headers: string[]; rows: (string | number)[][]; display?: ReactNode[][] };
  csvName?: string;
  actions?: ReactNode;
  className?: string;
  legend?: ReactNode;
}) {
  const [asTable, setAsTable] = useState(false);
  return (
    <Card className={clsx('flex min-w-0 flex-col', className)}>
      <CardHeader
        title={title}
        description={description}
        actions={
          <>
            {actions}
            {table && (
              <IconButton size="sm" label={asTable ? 'Show chart' : 'Show data table'} onClick={() => setAsTable((t) => !t)} className={asTable ? 'bg-hover text-ink' : ''}>
                {asTable ? <Icon.reports size={15} /> : <Icon.table size={15} />}
              </IconButton>
            )}
            {table && csvName && (
              <IconButton size="sm" label="Export CSV" onClick={() => downloadCsv(csvName, table.headers, table.rows)}><Icon.download size={15} /></IconButton>
            )}
          </>
        }
      />
      {legend && !asTable && <div className="px-5 pb-2">{legend}</div>}
      <div className="min-w-0 flex-1 px-3 pb-4 sm:px-5">
        {asTable && table ? (
          table.rows.length === 0 ? <EmptyState compact title="No data in this range" /> : (
            <div className="max-h-80 overflow-auto rounded-lg border border-line">
              <table className="w-full text-[13px]">
                <thead className="table-head"><tr>{table.headers.map((h, i) => <th key={h} className={i > 0 ? 'text-right!' : ''}>{h}</th>)}</tr></thead>
                <tbody className="table-body">
                  {(table.display ?? table.rows).map((r, ri) => (
                    <tr key={ri}>{r.map((c, ci) => <td key={ci} className={clsx('py-2!', ci > 0 && 'num text-right')}>{c}</td>)}</tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : children}
      </div>
    </Card>
  );
}

export function SectionLink({ to, children }: { to: string; children: ReactNode }) {
  return <Link to={to} className="text-[12.5px] font-medium text-accent-text hover:underline">{children}</Link>;
}

export function MetaItem({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-ink-3">{label}</dt>
      <dd className="mt-1 text-[13.5px] text-ink">{children}</dd>
    </div>
  );
}

/** Shows the dependency counts that a delete would cascade/restrict on */
export function DependencyList({ items }: { items: { label: string; count: number; effect: 'cascade' | 'restrict' }[] }) {
  const shown = items.filter((i) => i.count > 0);
  if (!shown.length) return null;
  return (
    <ul className="mt-3 flex flex-col gap-1.5 border-y border-line py-3 text-[13px]">
      {shown.map((i) => (
        <li key={i.label} className="flex items-center justify-between gap-3">
          <span className="text-ink-2">{i.count} {i.label}</span>
          <span className={clsx('text-xs font-medium', i.effect === 'cascade' ? 'text-warning' : 'text-danger')}>{i.effect === 'cascade' ? 'will also be deleted' : 'blocks deletion'}</span>
        </li>
      ))}
    </ul>
  );
}
