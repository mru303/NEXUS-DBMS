import clsx from 'clsx';
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';
import { useId } from 'react';
import { initials } from '../../lib/format';
import { Icon } from '../icons';

/* ---------------- Button ---------------- */
type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'subtle';
type Size = 'sm' | 'md' | 'lg';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-primary text-on-primary hover:bg-primary-hover disabled:opacity-40',
  secondary: 'bg-surface text-ink border border-line-strong hover:bg-hover disabled:opacity-50',
  ghost: 'text-ink-2 hover:text-ink hover:bg-hover disabled:opacity-40',
  danger: 'bg-danger text-white hover:opacity-90 disabled:opacity-50',
  subtle: 'bg-raised text-ink-2 disabled:opacity-60',
};
const SIZES: Record<Size, string> = {
  sm: 'h-8 px-3 text-[13px] gap-1.5 rounded-md',
  md: 'h-9 px-3.5 text-[13.5px] gap-2 rounded-md',
  lg: 'h-10 px-4 text-sm gap-2 rounded-md',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  icon?: ReactNode;
  iconRight?: ReactNode;
}

export function Button({ variant = 'secondary', size = 'md', icon, iconRight, className, children, type = 'button', ...rest }: ButtonProps) {
  return (
    <button
      type={type}
      className={clsx('inline-flex shrink-0 items-center justify-center font-medium whitespace-nowrap transition-colors select-none', VARIANTS[variant], SIZES[size], className)}
      {...rest}
    >
      {icon}
      {children}
      {iconRight}
    </button>
  );
}

export function IconButton({ label, className, children, size = 'md', ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; size?: 'sm' | 'md' }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={clsx(
        'inline-flex shrink-0 items-center justify-center rounded-md text-ink-3 transition-colors hover:bg-hover hover:text-ink disabled:opacity-40',
        size === 'sm' ? 'size-7' : 'size-9',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

/* ---------------- Badges ---------------- */
export type Tone = 'accent' | 'success' | 'warning' | 'danger' | 'info' | 'neutral';
// Statuses are plain text with a small coloured dot — the word carries the meaning,
// the dot helps scanning. Only "danger" also colours the text.
const TONES: Record<Tone, { text: string; dot: string }> = {
  accent: { text: 'text-ink', dot: 'bg-accent' },
  success: { text: 'text-ink-2', dot: 'bg-success' },
  warning: { text: 'text-ink', dot: 'bg-warning' },
  danger: { text: 'text-danger', dot: 'bg-danger' },
  info: { text: 'text-ink-2', dot: 'bg-info' },
  neutral: { text: 'text-ink-3', dot: 'bg-line-strong' },
};

export function Badge({ tone = 'neutral', children, dot = true, className }: { tone?: Tone; children: ReactNode; dot?: boolean; className?: string }) {
  return (
    <span className={clsx('inline-flex items-center gap-1.5 text-[13px] whitespace-nowrap', TONES[tone].text, className)}>
      {dot && <span className={clsx('size-[7px] shrink-0 rounded-full', TONES[tone].dot)} aria-hidden />}
      {children}
    </span>
  );
}

const STATUS_TONE: Record<string, Tone> = {
  // projects
  Planning: 'info', 'In Progress': 'accent', 'On Hold': 'warning', Completed: 'success', Cancelled: 'neutral',
  // tasks
  'To Do': 'neutral', 'In Review': 'warning',
  // invoices
  Draft: 'neutral', Sent: 'info', 'Partially Paid': 'warning', Paid: 'success', Overdue: 'danger',
  // payments
  Pending: 'warning', Failed: 'danger', Refunded: 'neutral',
  // clients / users
  Active: 'success', Prospect: 'info', Inactive: 'neutral',
};
export const statusTone = (s: string): Tone => STATUS_TONE[s] ?? 'neutral';

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  return <Badge tone={statusTone(status)} className={className}>{status}</Badge>;
}

const PRIORITY_COLOR: Record<string, string> = { Low: 'text-ink-3', Medium: 'text-ink-2', High: 'text-ink font-medium', Urgent: 'text-danger font-medium' };
/** Plain text. In compact spots (board cards) only High/Urgent are shown. */
export function PriorityBadge({ priority, compact }: { priority: string; compact?: boolean }) {
  if (compact && (priority === 'Low' || priority === 'Medium')) return null;
  return (
    <span className={clsx('text-[12.5px] whitespace-nowrap', PRIORITY_COLOR[priority])} title={`${priority} priority`}>
      {priority}
    </span>
  );
}

/* ---------------- Avatar ---------------- */
export function Avatar({ name, id, size = 28, className, ring }: { name: string; id: string; size?: number; className?: string; ring?: boolean }) {
  return (
    <span
      data-id={id}
      className={clsx('inline-flex shrink-0 items-center justify-center rounded-full border border-line-strong bg-raised font-medium text-ink-2 select-none', ring && 'ring-2 ring-surface', className)}
      style={{ width: size, height: size, fontSize: Math.max(10, size * 0.36) }}
      title={name}
      aria-hidden
    >
      {initials(name)}
    </span>
  );
}

export function AvatarStack({ people, max = 4, size = 26 }: { people: { id: string; fullName: string }[]; max?: number; size?: number }) {
  const shown = people.slice(0, max);
  const extra = people.length - shown.length;
  return (
    <span className="flex items-center -space-x-1.5" aria-label={people.map((p) => p.fullName).join(', ')}>
      {shown.map((p) => <Avatar key={p.id} id={p.id} name={p.fullName} size={size} ring />)}
      {extra > 0 && (
        <span className="inline-flex items-center justify-center rounded-full bg-raised text-[11px] font-medium text-ink-2 ring-2 ring-surface" style={{ width: size, height: size }}>
          +{extra}
        </span>
      )}
    </span>
  );
}

/* ---------------- Progress ---------------- */
export function Progress({ value, tone = 'accent', className, label }: { value: number; tone?: 'accent' | 'success' | 'warning' | 'danger'; className?: string; label?: string }) {
  const v = Math.max(0, Math.min(100, value));
  const color = { accent: 'bg-ink-2', success: 'bg-success', warning: 'bg-warning', danger: 'bg-danger' }[tone];
  return (
    <div className={clsx('h-1 w-full overflow-hidden rounded-full bg-line', className)} role="progressbar" aria-valuenow={Math.round(v)} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
      <div className={clsx('h-full rounded-full transition-[width] duration-500', color)} style={{ width: `${v}%` }} />
    </div>
  );
}

/* ---------------- Card ---------------- */
export function Card({ className, children, as: As = 'section' }: { className?: string; children: ReactNode; as?: 'section' | 'div' | 'article' }) {
  return <As className={clsx('card', className)}>{children}</As>;
}

export function CardHeader({ title, description, actions, className }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; className?: string }) {
  return (
    <div className={clsx('flex flex-wrap items-start justify-between gap-x-4 gap-y-2 px-5 pt-4 pb-3', className)}>
      <div className="min-w-0">
        <h2 className="text-[14.5px] font-semibold text-ink">{title}</h2>
        {description && <p className="mt-0.5 text-[13px] text-ink-3">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

/* ---------------- Page header ---------------- */
export function PageHeader({ title, description, actions, meta }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; meta?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {meta && <div className="mb-2 flex flex-wrap items-center gap-2">{meta}</div>}
        <h1 className="text-[22px] leading-tight font-semibold tracking-[-0.01em] text-ink">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-[13.5px] text-ink-3">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

/* ---------------- Empty state ---------------- */
export function EmptyState({ icon, title, body, action, compact }: { icon?: ReactNode; title: string; body?: ReactNode; action?: ReactNode; compact?: boolean }) {
  return (
    <div className={clsx('flex flex-col items-center justify-center text-center', compact ? 'px-4 py-8' : 'px-6 py-14')}>
      <div className="mb-2 text-ink-3">{icon ?? <Icon.inbox size={20} />}</div>
      <p className="text-sm font-semibold text-ink">{title}</p>
      {body && <p className="mt-1 max-w-sm text-[13px] text-ink-3">{body}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/* ---------------- Keyboard hint ---------------- */
export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded border border-line bg-surface px-1 font-sans text-[11px] text-ink-3">{children}</kbd>;
}

/* ---------------- Segmented control ---------------- */
export function Segmented<T extends string>({ value, onChange, options, label, size = 'md' }: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: ReactNode; icon?: ReactNode }[];
  label: string;
  size?: 'sm' | 'md';
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-md bg-raised p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={clsx(
            'inline-flex items-center gap-1.5 rounded-md font-medium transition-colors',
            size === 'sm' ? 'h-7 px-2.5 text-xs' : 'h-8 px-3 text-[13px]',
            value === o.value ? 'bg-surface text-ink ring-1 ring-line-strong' : 'text-ink-3 hover:text-ink',
          )}
        >
          {o.icon}
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* ---------------- Tabs ---------------- */
export function Tabs<T extends string>({ value, onChange, tabs, className }: {
  value: T;
  onChange: (v: T) => void;
  tabs: { value: T; label: ReactNode; count?: number }[];
  className?: string;
}) {
  return (
    <div role="tablist" className={clsx('flex gap-1 overflow-x-auto border-b border-line', className)}>
      {tabs.map((t) => (
        <button
          key={t.value}
          role="tab"
          type="button"
          aria-selected={value === t.value}
          onClick={() => onChange(t.value)}
          className={clsx(
            'relative inline-flex h-10 shrink-0 items-center gap-2 px-3 text-[13.5px] font-medium transition-colors',
            value === t.value ? 'text-ink' : 'text-ink-3 hover:text-ink',
          )}
        >
          {t.label}
          {t.count !== undefined && (
            <span className="num text-[12px] text-ink-3">{t.count}</span>
          )}
          {value === t.value && <span className="absolute inset-x-2 -bottom-px h-0.5 bg-ink" />}
        </button>
      ))}
    </div>
  );
}

/* ---------------- Pagination ---------------- */
export function Pagination({ page, pageSize, total, onPage }: { page: number; pageSize: number; total: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (total === 0) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return (
    <div className="flex items-center justify-between gap-3 border-t border-line px-4 py-3 text-[13px] text-ink-3">
      <span className="num">{from}–{to} of {total}</span>
      <div className="flex items-center gap-1">
        <IconButton size="sm" label="Previous page" disabled={page <= 1} onClick={() => onPage(page - 1)}><Icon.chevronLeft size={16} /></IconButton>
        <span className="num px-2 text-ink-2">{page} / {pages}</span>
        <IconButton size="sm" label="Next page" disabled={page >= pages} onClick={() => onPage(page + 1)}><Icon.chevronRight size={16} /></IconButton>
      </div>
    </div>
  );
}

/* ---------------- Form fields ---------------- */
export function Field({ label, error, hint, children, className, htmlFor, required }: {
  label: string; error?: string; hint?: ReactNode; children: ReactNode; className?: string; htmlFor?: string; required?: boolean;
}) {
  return (
    <div className={clsx('flex flex-col gap-1.5', className)}>
      <label htmlFor={htmlFor} className="text-[13px] font-medium text-ink-2">
        {label}
        {required && <span className="text-danger" aria-hidden> *</span>}
      </label>
      {children}
      {error ? <p className="text-xs text-danger" role="alert">{error}</p> : hint ? <p className="text-xs text-ink-3">{hint}</p> : null}
    </div>
  );
}

export function TextInput({ label, error, hint, className, required, id, ...rest }: InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string; hint?: ReactNode }) {
  const auto = useId();
  const fid = id ?? auto;
  return (
    <Field label={label} error={error} hint={hint} htmlFor={fid} className={className} required={required}>
      <input id={fid} className="field" aria-invalid={!!error} {...rest} />
    </Field>
  );
}

export function SelectInput({ label, error, hint, className, children, required, id, ...rest }: SelectHTMLAttributes<HTMLSelectElement> & { label: string; error?: string; hint?: ReactNode }) {
  const auto = useId();
  const fid = id ?? auto;
  return (
    <Field label={label} error={error} hint={hint} htmlFor={fid} className={className} required={required}>
      <select id={fid} className="field" aria-invalid={!!error} {...rest}>{children}</select>
    </Field>
  );
}

export function TextArea({ label, error, hint, className, required, id, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string; error?: string; hint?: ReactNode }) {
  const auto = useId();
  const fid = id ?? auto;
  return (
    <Field label={label} error={error} hint={hint} htmlFor={fid} className={className} required={required}>
      <textarea id={fid} className="field" aria-invalid={!!error} {...rest} />
    </Field>
  );
}

export function Toggle({ checked, onChange, label, description }: { checked: boolean; onChange: (v: boolean) => void; label: string; description?: string }) {
  const id = useId();
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <label htmlFor={id} className="text-[13.5px] font-medium text-ink">{label}</label>
        {description && <p className="text-[13px] text-ink-3">{description}</p>}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={clsx('relative mt-0.5 h-5 w-9 shrink-0 rounded-full transition-colors', checked ? 'bg-accent' : 'bg-line-strong')}
      >
        <span className={clsx('absolute top-0.5 left-0 size-4 rounded-full bg-white shadow transition-transform', checked ? 'translate-x-4.5' : 'translate-x-0.5')} />
      </button>
    </div>
  );
}

/** Compact select used in filter toolbars */
export function FilterSelect({ value, onChange, children, label, className, defaultValue = '' }: { value: string; onChange: (v: string) => void; children: ReactNode; label: string; className?: string; defaultValue?: string }) {
  return (
    <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} className={clsx('field h-9! w-auto! min-w-[8.5rem] text-[13px]', value !== defaultValue && 'border-ink-3! text-ink', className)}>
      {children}
    </select>
  );
}

export function SearchInput({ value, onChange, placeholder = 'Search…', className }: { value: string; onChange: (v: string) => void; placeholder?: string; className?: string }) {
  return (
    <div className={clsx('relative', className)}>
      <Icon.search size={15} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-3" />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="field h-9! pl-9! text-[13px]"
      />
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={clsx('skeleton', className)} aria-hidden />;
}

export function Stat({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: 'danger' | 'success' | 'warning' }) {
  return (
    <div className="min-w-0">
      <p className="text-[12.5px] text-ink-3">{label}</p>
      <p className={clsx('num mt-0.5 truncate text-lg font-semibold', tone === 'danger' ? 'text-danger' : 'text-ink')}>{value}</p>
      {sub && <p className="mt-0.5 text-xs text-ink-3">{sub}</p>}
    </div>
  );
}

export function IdChip({ children }: { children: ReactNode }) {
  return <span className="num text-[11.5px] text-ink-3">{children}</span>;
}

/* ---------------- Stat strip ----------------
   One bordered row of figures separated by hairlines — used instead of a
   grid of separate "KPI cards". */
export interface StripItem {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  tone?: 'danger';
  extra?: ReactNode;
  onClick?: () => void;
  active?: boolean;
}
const STRIP_COLS: Record<number, string> = {
  2: 'sm:grid-cols-2', 3: 'sm:grid-cols-3', 4: 'grid-cols-2 lg:grid-cols-4', 5: 'grid-cols-2 lg:grid-cols-5', 6: 'grid-cols-2 md:grid-cols-3 xl:grid-cols-6',
};
export function StatStrip({ items, className }: { items: StripItem[]; className?: string }) {
  return (
    <div className={clsx('grid gap-px overflow-hidden rounded-lg border border-line bg-line', STRIP_COLS[items.length] ?? 'grid-cols-2', className)}>
      {items.map((it) => {
        const body = (
          <>
            <p className="text-[12.5px] text-ink-3">{it.label}</p>
            <p className={clsx('num mt-1 truncate text-[22px] leading-tight font-semibold', it.tone === 'danger' ? 'text-danger' : 'text-ink')}>{it.value}</p>
            {it.sub && <p className="mt-1 text-xs text-ink-3">{it.sub}</p>}
            {it.extra && <div className="mt-2.5">{it.extra}</div>}
          </>
        );
        return it.onClick ? (
          <button key={it.label} type="button" onClick={it.onClick} aria-pressed={it.active} className={clsx('min-w-0 bg-surface px-4 py-3.5 text-left transition-colors hover:bg-hover', it.active && 'bg-hover')}>{body}</button>
        ) : (
          <div key={it.label} className="min-w-0 bg-surface px-4 py-3.5">{body}</div>
        );
      })}
    </div>
  );
}

/** "+12% vs previous period" — colour on the arrow only */
export function Delta({ value, label = 'vs previous period', invert }: { value: number | null; label?: string; invert?: boolean }) {
  if (value === null) return <span>New this period</span>;
  const good = invert ? value < 0 : value > 0;
  const bad = invert ? value > 0 : value < 0;
  return (
    <span>
      <span className={clsx('num font-medium', good ? 'text-success' : bad ? 'text-danger' : 'text-ink-2')}>
        {value > 0 ? '↑' : value < 0 ? '↓' : ''} {Math.abs(value).toFixed(Math.abs(value) < 10 ? 1 : 0)}%
      </span>{' '}
      {label}
    </span>
  );
}
