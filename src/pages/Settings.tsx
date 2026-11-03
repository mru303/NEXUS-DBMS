import clsx from 'clsx';
import { useMemo, useState, type ReactNode } from 'react';
import type { Settings } from '../data/types';
import { getState, updateSettings, updateUserApi, useSettings } from '../data/store';
import { RELATIONSHIPS, TABLES, integrityChecks, postgresDDL, postgresInserts, type TableMeta } from '../data/schema';
import { useData } from '../lib/useData';
import { useQueryState } from '../lib/router';
import { downloadText } from '../lib/csv';
import { Icon } from '../components/icons';
import { notify, toast } from '../components/ui/overlays';
import { Badge, Button, Card, CardHeader, IdChip, PageHeader, SelectInput, TextArea, TextInput, Toggle } from '../components/ui/primitives';

type Tab = 'workspace' | 'company' | 'billing' | 'notifications' | 'appearance' | 'profile' | 'database' | 'data';

export function SettingsPage() {
  const { can } = useData();
  const admin = can('write:settings');
  const [tab, setTab] = useQueryState('tab', admin ? 'workspace' : 'profile');
  const tabs: { value: Tab; label: string; icon: ReactNode; adminOnly?: boolean }[] = [
    { value: 'workspace', label: 'Workspace', icon: <Icon.briefcase size={16} />, adminOnly: true },
    { value: 'company', label: 'Company & GST', icon: <Icon.clients size={16} />, adminOnly: true },
    { value: 'billing', label: 'Billing defaults', icon: <Icon.invoices size={16} />, adminOnly: true },
    { value: 'notifications', label: 'Notifications', icon: <Icon.bell size={16} /> },
    { value: 'appearance', label: 'Appearance', icon: <Icon.palette size={16} /> },
    { value: 'profile', label: 'Profile', icon: <Icon.user size={16} /> },
    { value: 'database', label: 'Database overview', icon: <Icon.database size={16} /> },
    { value: 'data', label: 'Backups', icon: <Icon.refresh size={16} />, adminOnly: true },
  ];
  const visible = tabs.filter((t) => !t.adminOnly || admin);
  const current = (visible.find((t) => t.value === tab) ?? visible[0]).value;

  return (
    <>
      <PageHeader title="Settings" description="Workspace, billing, and appearance settings are saved to PostgreSQL." />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
        <nav aria-label="Settings sections" className="-mx-4 flex gap-1 overflow-x-auto px-4 lg:mx-0 lg:flex-col lg:px-0">
          {visible.map((t) => (
            <button key={t.value} onClick={() => setTab(t.value)} aria-current={current === t.value ? 'page' : undefined}
              className={clsx('flex h-9 shrink-0 items-center gap-2.5 rounded-lg px-3 text-[13.5px] font-medium transition-colors', current === t.value ? 'bg-hover text-ink' : 'text-ink-2 hover:bg-hover hover:text-ink')}>
              <span className={current === t.value ? 'text-ink' : 'text-ink-3'}>{t.icon}</span>{t.label}
            </button>
          ))}
        </nav>
        <div className="min-w-0">
          {current === 'workspace' && <SettingsForm key="ws" title="Workspace profile" fields={['workspaceName']} />}
          {current === 'company' && <SettingsForm key="co" title="Company details" description="Printed on every invoice." fields={['companyName', 'companyAddress', 'companyEmail', 'companyPhone', 'companyGstin', 'companyPan', 'bankName', 'bankAccount', 'bankIfsc', 'upiId']} />}
          {current === 'billing' && <SettingsForm key="bi" title="Billing defaults" description="Used when creating new invoices. Existing invoices keep their own values." fields={['currency', 'defaultTaxRate', 'paymentTermsDays', 'invoicePrefix', 'invoiceFooter']} />}
          {current === 'notifications' && <NotificationSettings />}
          {current === 'appearance' && <AppearanceSettings />}
          {current === 'profile' && <ProfileSettings />}
          {current === 'database' && <DatabaseOverview />}
          {current === 'data' && <DemoData />}
        </div>
      </div>
    </>
  );
}

/* ---------------- generic settings form ---------------- */
type FieldKey = keyof Settings;
const FIELD_META: Partial<Record<FieldKey, { label: string; hint?: string; type?: 'text' | 'number' | 'textarea' | 'gst' | 'currency' | 'email'; wide?: boolean }>> = {
  workspaceName: { label: 'Workspace name', hint: 'Shown in the sidebar and breadcrumbs.' },
  companyName: { label: 'Legal company name' },
  companyAddress: { label: 'Registered address', type: 'textarea', wide: true },
  companyEmail: { label: 'Accounts email', type: 'email' },
  companyPhone: { label: 'Phone' },
  companyGstin: { label: 'GSTIN', hint: 'First two digits = state code (27 = Maharashtra). Decides CGST+SGST vs IGST.' },
  companyPan: { label: 'PAN' },
  bankName: { label: 'Bank & branch' },
  bankAccount: { label: 'Account number' },
  bankIfsc: { label: 'IFSC' },
  upiId: { label: 'UPI ID' },
  currency: { label: 'Default currency', type: 'currency', hint: 'All amounts are stored in INR. Multi-currency isn’t part of this demo.' },
  defaultTaxRate: { label: 'Default GST rate', type: 'gst' },
  paymentTermsDays: { label: 'Payment terms (days)', type: 'number', hint: 'Due date = issue date + this many days.' },
  invoicePrefix: { label: 'Invoice number prefix', hint: 'Numbers look like PREFIX/26-27/0001 (Indian financial year).' },
  invoiceFooter: { label: 'Invoice footer', type: 'textarea', wide: true },
};

function SettingsForm({ title, description, fields }: { title: string; description?: string; fields: FieldKey[] }) {
  const settings = useSettings();
  const [draft, setDraft] = useState<Partial<Settings>>(() => Object.fromEntries(fields.map((f) => [f, settings[f]])));
  const [error, setError] = useState<Record<string, string>>({});
  const dirty = fields.some((f) => String(draft[f]) !== String(settings[f]));
  const save = async () => {
    const errs: Record<string, string> = {};
    if ('workspaceName' in draft && !String(draft.workspaceName).trim()) errs.workspaceName = 'Enter a workspace name';
    if ('companyGstin' in draft && !/^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(String(draft.companyGstin))) errs.companyGstin = 'GSTIN must be 15 characters, e.g. 27AAJCN5521K1Z8';
    if ('companyEmail' in draft && !/^\S+@\S+\.\S+$/.test(String(draft.companyEmail))) errs.companyEmail = 'Enter a valid email';
    if ('paymentTermsDays' in draft && !(Number(draft.paymentTermsDays) >= 0 && Number(draft.paymentTermsDays) <= 180)) errs.paymentTermsDays = 'Use 0–180 days';
    if ('invoicePrefix' in draft && !/^[A-Z0-9]{1,6}$/.test(String(draft.invoicePrefix))) errs.invoicePrefix = '1–6 capital letters or digits';
    setError(errs);
    if (Object.keys(errs).length) return;
    const patch: Partial<Settings> = { ...draft };
    if ('paymentTermsDays' in patch) patch.paymentTermsDays = Number(patch.paymentTermsDays);
    if ('defaultTaxRate' in patch) patch.defaultTaxRate = Number(patch.defaultTaxRate);
    notify(await updateSettings(patch));
  };
  return (
    <Card>
      <CardHeader title={title} description={description} />
      <div className="grid grid-cols-1 gap-4 px-5 pb-5 sm:grid-cols-2">
        {fields.map((f) => {
          const m = FIELD_META[f]!;
          const v = String(draft[f] ?? '');
          const set = (val: string) => setDraft((d) => ({ ...d, [f]: val }));
          if (m.type === 'textarea') return <TextArea key={f} className="sm:col-span-2" label={m.label} hint={m.hint} value={v} onChange={(e) => set(e.target.value)} rows={3} />;
          if (m.type === 'gst') return <SelectInput key={f} label={m.label} hint={m.hint} value={v} onChange={(e) => set(e.target.value)}>{[0, 5, 12, 18, 28].map((r) => <option key={r} value={r}>{r}%</option>)}</SelectInput>;
          if (m.type === 'currency') return <SelectInput key={f} label={m.label} hint={m.hint} value={v} onChange={(e) => set(e.target.value)}><option value="INR">Indian Rupee (₹ INR)</option></SelectInput>;
          return <TextInput key={f} label={m.label} hint={m.hint} error={error[f]} type={m.type === 'number' ? 'number' : m.type === 'email' ? 'email' : 'text'} value={v} onChange={(e) => set(f === 'companyGstin' || f === 'invoicePrefix' ? e.target.value.toUpperCase() : e.target.value)} className={m.wide ? 'sm:col-span-2' : undefined} />;
        })}
      </div>
      <div className="flex items-center justify-end gap-2 border-t border-line px-5 py-3">
        {dirty && <span className="mr-auto text-xs text-warning">Unsaved changes</span>}
        <Button disabled={!dirty} onClick={() => { setDraft(Object.fromEntries(fields.map((f) => [f, settings[f]]))); setError({}); }}>Discard</Button>
        <Button variant="primary" disabled={!dirty} onClick={save}>Save changes</Button>
      </div>
    </Card>
  );
}

function NotificationSettings() {
  const s = useSettings();
  return (
    <Card>
      <CardHeader title="Notifications" description="Controls what appears in the bell menu. Notifications are generated from your data — no emails or SMS are sent." />
      <div className="flex flex-col gap-5 px-5 pb-5">
        <Toggle label="Overdue & due-soon invoices" description="Invoices past their due date, or due within 5 days." checked={s.notifyOverdueInvoices} onChange={(v) => { void updateSettings({ notifyOverdueInvoices: v }).then(notify); }} />
        <Toggle label="Task deadlines" description="Overdue tasks and tasks due in the next 2 days." checked={s.notifyTaskDeadlines} onChange={(v) => { void updateSettings({ notifyTaskDeadlines: v }).then(notify); }} />
        <Toggle label="Payments" description="Payments recorded in the last 7 days." checked={s.notifyPayments} onChange={(v) => { void updateSettings({ notifyPayments: v }).then(notify); }} />
      </div>
    </Card>
  );
}

function AppearanceSettings() {
  const s = useSettings();
  const opts: { value: Settings['theme']; label: string; icon: ReactNode; preview: string }[] = [
    { value: 'dark', label: 'Dark', icon: <Icon.moon size={16} />, preview: 'bg-[#0a0c13]' },
    { value: 'light', label: 'Light', icon: <Icon.sun size={16} />, preview: 'bg-[#f5f6f9]' },
    { value: 'system', label: 'Match system', icon: <Icon.monitor size={16} />, preview: 'bg-gradient-to-r from-[#0a0c13] from-50% to-[#f5f6f9] to-50%' },
  ];
  return (
    <Card>
      <CardHeader title="Theme" description="Saved to this workspace." />
      <div className="grid grid-cols-1 gap-3 px-5 pb-5 sm:grid-cols-3" role="radiogroup" aria-label="Theme">
        {opts.map((o) => (
          <button key={o.value} role="radio" aria-checked={s.theme === o.value} onClick={() => { void updateSettings({ theme: o.value }).then(notify); }}
            className={clsx('rounded-lg border p-3 text-left transition-colors', s.theme === o.value ? 'border-ink' : 'border-line hover:border-line-strong')}>
            <div className={clsx('mb-3 h-16 rounded-lg border border-line', o.preview)} />
            <span className="flex items-center gap-2 text-[13.5px] font-medium text-ink">{o.icon}{o.label}{s.theme === o.value && <Icon.check size={15} className="ml-auto text-accent-text" />}</span>
          </button>
        ))}
      </div>
    </Card>
  );
}

function ProfileSettings() {
  const { user } = useData();
  const [d, setD] = useState({ fullName: user.fullName, email: user.email, phone: user.phone });
  const dirty = d.fullName !== user.fullName || d.email !== user.email || d.phone !== user.phone;
  return (
    <Card>
      <CardHeader title="Your profile" description={<>Signed in as <IdChip>{user.id}</IdChip> · {user.role}. Use the profile menu to switch demo roles.</>} />
      <div className="grid grid-cols-1 gap-4 px-5 pb-5 sm:grid-cols-2">
        <TextInput label="Full name" value={d.fullName} onChange={(e) => setD({ ...d, fullName: e.target.value })} />
        <TextInput label="Email" type="email" value={d.email} onChange={(e) => setD({ ...d, email: e.target.value })} />
        <TextInput label="Phone" value={d.phone} onChange={(e) => setD({ ...d, phone: e.target.value })} />
        <TextInput label="Department" value={user.department} disabled hint="Changed by an administrator on the Team page." />
      </div>
      <div className="flex justify-end gap-2 border-t border-line px-5 py-3">
        <Button disabled={!dirty} onClick={() => setD({ fullName: user.fullName, email: user.email, phone: user.phone })}>Discard</Button>
        <Button variant="primary" disabled={!dirty || !d.fullName.trim() || !/^\S+@\S+\.\S+$/.test(d.email)} onClick={() => { void updateUserApi(user.id, { fullName: d.fullName.trim(), email: d.email.trim(), phone: d.phone.trim() }).then((result) => notify(result, 'Profile saved')); }}>Save profile</Button>
      </div>
    </Card>
  );
}

/* ---------------- Database overview ---------------- */
const BOX: Record<string, { x: number; y: number }> = {
  users: { x: 100, y: 30 }, clients: { x: 400, y: 30 }, invoices: { x: 700, y: 30 },
  tasks: { x: 100, y: 250 }, projects: { x: 400, y: 250 }, payments: { x: 700, y: 250 },
  work_sessions: { x: 100, y: 470 },
};
/** Curved edges (perpendicular offset of the control point) to avoid running through a box */
const BEND: Record<string, number> = { 'users>work_sessions': -260 };
const BW = 200, BH = 116;

function DatabaseOverview() {
  const { fullDb, can } = useData();
  const settings = useSettings();
  const [selected, setSelected] = useState<string>('projects');
  const checks = useMemo(() => integrityChecks(fullDb), [fullDb]);
  const bad = checks.filter((c) => c.violations > 0).length;
  const meta = TABLES.find((t) => t.name === selected)!;
  const rows = (fullDb[meta.key] as unknown as { id: string }[]);
  const ddl = useMemo(() => postgresDDL(), []);
  const fkCount = (t: TableMeta) => t.columns.filter((c) => c.key?.includes('FK')).length;

  const center = (n: string) => ({ x: BOX[n].x + BW / 2, y: BOX[n].y + BH / 2 });
  const edges = RELATIONSHIPS.filter((r) => r.name !== 'MEMBER_OF');

  return (
    <div className="flex flex-col gap-5">
      <Card>
        <CardHeader
          title="Entity–relationship map"
          description="The seven tables from Experiments 1 & 2 with live row counts. Click a table to inspect its columns and rows."
          actions={<Badge tone={bad ? 'danger' : 'success'}>{bad ? `${bad} integrity issue(s)` : 'All constraints hold'}</Badge>}
        />
        <div className="overflow-x-auto px-3 pb-4 sm:px-5">
          <svg viewBox="0 0 960 620" className="min-w-[720px]" role="img" aria-label="Entity relationship diagram of users, clients, projects, tasks, work sessions, invoices and payments">
            <defs>
              <marker id="crow" viewBox="0 0 12 12" refX="11" refY="6" markerWidth="12" markerHeight="12" orient="auto-start-reverse">
                <path d="M0,6 L11,6 M11,1 L4,6 L11,11" fill="none" stroke="var(--c-ink-3)" strokeWidth="1.3" />
              </marker>
            </defs>
            {edges.map((e, i) => {
              const a = center(e.from), b = center(e.to);
              const bend = BEND[`${e.from}>${e.to}`] ?? 0;
              const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1;
              // control point: midpoint pushed sideways by `bend` px
              const c = { x: (a.x + b.x) / 2 + (dy / len) * bend, y: (a.y + b.y) / 2 - (dx / len) * bend };
              const clip = (p: { x: number; y: number }, toward: { x: number; y: number }) => {
                const ddx = toward.x - p.x, ddy = toward.y - p.y;
                const t = Math.min(Math.abs((BW / 2 + 4) / (ddx || 1e-9)), Math.abs((BH / 2 + 4) / (ddy || 1e-9)));
                return { x: p.x + ddx * t, y: p.y + ddy * t };
              };
              const s0 = clip(a, bend ? c : b), t0 = clip(b, bend ? c : a);
              const path = bend ? `M${s0.x},${s0.y} Q${c.x},${c.y} ${t0.x},${t0.y}` : `M${s0.x},${s0.y} L${t0.x},${t0.y}`;
              const mx = bend ? 0.25 * s0.x + 0.5 * c.x + 0.25 * t0.x : (s0.x + t0.x) / 2;
              const my = bend ? 0.25 * s0.y + 0.5 * c.y + 0.25 * t0.y : (s0.y + t0.y) / 2;
              const highlight = e.from === selected || e.to === selected;
              return (
                <g key={i}>
                  <path d={path} fill="none" stroke={highlight ? 'var(--c-accent)' : 'var(--c-line-strong)'} strokeWidth={highlight ? 1.8 : 1.3} markerEnd="url(#crow)" />
                  <g transform={`translate(${mx},${my})`}>
                    <rect x={-e.name.length * 3.6 - 7} y={-10} width={e.name.length * 7.2 + 14} height={20} rx={5} fill="var(--c-surface)" stroke={highlight ? 'var(--c-accent)' : 'var(--c-line)'} />
                    <text textAnchor="middle" dy="0.35em" className={clsx('text-[10.5px] font-medium', highlight ? 'fill-accent-text' : 'fill-ink-2')}>{e.name}</text>
                  </g>
                </g>
              );
            })}
            {TABLES.map((t) => {
              const b = BOX[t.name];
              const sel = selected === t.name;
              const count = (fullDb[t.key] as unknown[]).length;
              return (
                <g key={t.name} transform={`translate(${b.x},${b.y})`} className="cursor-pointer" onClick={() => setSelected(t.name)} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && setSelected(t.name)} aria-label={`${t.name} table, ${count} rows`}>
                  <rect width={BW} height={BH} rx={12} fill="var(--c-surface)" stroke={sel ? 'var(--c-accent)' : 'var(--c-line-strong)'} strokeWidth={sel ? 2 : 1} />
                  <rect width={BW} height={34} rx={12} fill={sel ? 'var(--c-hover)' : 'var(--c-raised)'} />
                  <rect y={22} width={BW} height={12} fill={sel ? 'var(--c-hover)' : 'var(--c-raised)'} />
                  <text x={14} y={22} className="fill-ink text-[13px] font-semibold">{t.name}</text>
                  <text x={BW - 14} y={22} textAnchor="end" className="num fill-ink-3 text-[11px]">{count} rows</text>
                  <text x={14} y={56} className="fill-ink-2 text-[11px]"><tspan className="fill-warning font-semibold">PK </tspan>{t.columns[0].name}</text>
                  {t.columns.filter((c) => c.key?.includes('FK')).slice(0, 3).map((c, i) => (
                    <text key={c.name} x={14} y={74 + i * 16} className="fill-ink-3 text-[11px]"><tspan className="fill-info font-semibold">FK </tspan>{c.name.length > 22 ? c.name.slice(0, 21) + '…' : c.name}</text>
                  ))}
                  {fkCount(t) === 0 && <text x={14} y={74} className="fill-ink-3 text-[11px]">{t.columns.length} columns</text>}
                </g>
              );
            })}
          </svg>
          <p className="mt-2 text-xs text-ink-3">Crow’s foot marks the “many” side. Plus the junction table <span className="num">project_members(project_id, user_id)</span> for the M:N team relationship and <span className="num">invoice_items</span> for line items.</p>
        </div>
      </Card>

      <Card className="overflow-hidden">
        <CardHeader title={<span className="flex items-center gap-2"><Icon.table size={16} className="text-ink-3" /><span className="num">{meta.name}</span><Badge tone="neutral" dot={false}>{meta.entity}</Badge></span>} description={meta.description}
          actions={<select aria-label="Table" className="field h-8! w-auto! text-[13px]" value={selected} onChange={(e) => setSelected(e.target.value)}>{TABLES.map((t) => <option key={t.name}>{t.name}</option>)}</select>} />
        <div className="overflow-x-auto border-t border-line">
          <table className="w-full min-w-[640px] text-[13px]">
            <thead className="table-head"><tr><th>Column</th><th>Type</th><th>Key</th><th>Notes</th></tr></thead>
            <tbody className="table-body">
              {meta.columns.map((c) => (
                <tr key={c.name}>
                  <td className="num font-medium text-ink">{c.name}{c.added && <span className="ml-2 align-middle text-[10.5px] font-normal text-accent-text" title="Added beyond the Exp 2 relational model">added</span>}</td>
                  <td className="num text-xs text-ink-2">{c.type}</td>
                  <td>{c.key && <Badge tone={c.key === 'PK' ? 'warning' : 'info'} dot={false}>{c.key}{c.ref ? ` → ${c.ref}` : ''}</Badge>}</td>
                  <td className="text-xs text-ink-3">{c.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="border-t border-line px-5 py-3">
          <p className="mb-2 text-xs font-medium text-ink-3">First rows ({rows.length} total)</p>
          <pre className="max-h-56 overflow-auto rounded-lg border border-line bg-raised p-3 text-[11.5px] leading-relaxed text-ink-2">{JSON.stringify(rows.slice(0, 3), null, 2)}</pre>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <Card className="overflow-hidden">
          <CardHeader title="Relationships" description="Foreign keys and what happens on delete" />
          <div className="overflow-x-auto border-t border-line">
            <table className="w-full min-w-[520px] text-[13px]">
              <thead className="table-head"><tr><th>Relationship</th><th>Card.</th><th>Foreign key</th><th>On delete</th></tr></thead>
              <tbody className="table-body">
                {RELATIONSHIPS.map((r, i) => (
                  <tr key={i}>
                    <td><span className="font-medium text-ink">{r.name}</span><span className="block text-xs text-ink-3">{r.from} → {r.to}</span></td>
                    <td className="num text-ink-2">{r.card}</td>
                    <td className="num text-xs text-ink-2">{r.fk}</td>
                    <td><Badge tone={r.onDelete === 'CASCADE' ? 'warning' : 'danger'} dot={false}>{r.onDelete}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
        <Card className="overflow-hidden">
          <CardHeader title="Live integrity check" description="Re-runs on every change — the same constraints the PostgreSQL schema enforces" />
          <ul className="divide-y divide-line border-t border-line">
            {checks.map((c) => (
              <li key={c.label} className="flex items-center gap-3 px-5 py-2.5">
                {c.violations ? <Icon.alert size={16} className="shrink-0 text-danger" /> : <Icon.success size={16} className="shrink-0 text-success" />}
                <span className="min-w-0 flex-1"><span className="num block text-[12.5px] text-ink">{c.label}</span><span className="block text-xs text-ink-3">{c.detail}</span></span>
                <span className={clsx('num text-xs', c.violations ? 'font-medium text-danger' : 'text-ink-3')}>{c.violations ? `${c.violations} violation(s)` : 'OK'}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <Card>
        <CardHeader
          title="Export to PostgreSQL"
          description="Load this exact dataset into pgAdmin 4: run the schema, then the data script. Includes an invoice_summary VIEW and an overpayment-blocking TRIGGER."
          actions={<>
            <Button size="sm" icon={<Icon.copy size={14} />} onClick={() => { navigator.clipboard?.writeText(ddl).then(() => toast('success', 'Schema copied'), () => toast('error', 'Clipboard not available')); }}>Copy DDL</Button>
            <Button size="sm" icon={<Icon.download size={14} />} onClick={() => downloadText('nexus_schema.sql', ddl)}>Schema .sql</Button>
            <Button size="sm" variant="primary" icon={<Icon.download size={14} />} onClick={() => downloadText('nexus_data.sql', postgresInserts(getState().db, settings))}>Data .sql</Button>
          </>}
        />
        <pre className="mx-5 mb-5 max-h-80 overflow-auto rounded-lg border border-line bg-raised p-4 text-[11.5px] leading-relaxed text-ink-2"><code>{ddl}</code></pre>
        {!can('write:settings') && <p className="px-5 pb-4 text-xs text-ink-3">Read-only for your role.</p>}
      </Card>

      <Card>
        <CardHeader title="Frontend architecture" description="How this demo maps to a real 3-tier deployment" />
        <div className="grid grid-cols-1 gap-4 px-5 pb-5 text-[13px] leading-relaxed text-ink-2 md:grid-cols-3">
          <div className="rounded-lg border border-line p-4"><p className="font-medium text-ink">Website</p><p className="mt-1">React and TypeScript served locally at <span className="num">localhost:5173</span>.</p></div>
          <div className="rounded-lg border border-line p-4"><p className="font-medium text-ink">Application API</p><p className="mt-1">The shared browser API client sends reads and changes to Express at <span className="num">localhost:3001</span>.</p></div>
          <div className="rounded-lg border border-line p-4"><p className="font-medium text-ink">Database</p><p className="mt-1">PostgreSQL stores clients, projects, tasks, time, invoices, payments, users, and workspace settings.</p></div>
        </div>
      </Card>
    </div>
  );
}

/* ---------------- Demo data ---------------- */
function DemoData() {
  const { fullDb } = useData();
  const recordCount = Object.values(fullDb).reduce((count, rows) => count + rows.length, 0);
  return (
    <div className="flex flex-col gap-5">
      <Card>
        <CardHeader title="Database" description="Live records loaded from the local PostgreSQL workspace." />
        <div className="grid grid-cols-2 gap-4 px-5 pb-5 text-[13px] sm:grid-cols-4">
          <div><p className="text-ink-3">Engine</p><p className="font-medium text-ink">PostgreSQL 16</p></div>
          <div><p className="text-ink-3">Clients</p><p className="num font-medium text-ink">{fullDb.clients.length}</p></div>
          <div><p className="text-ink-3">Projects</p><p className="num font-medium text-ink">{fullDb.projects.length}</p></div>
          <div><p className="text-ink-3">Records loaded</p><p className="num font-medium text-ink">{recordCount}</p></div>
        </div>
      </Card>
      <Card>
        <CardHeader title="Backup" description="Download a snapshot of the current database records." />
        <div className="flex flex-wrap gap-2 px-5 pb-5">
          <Button icon={<Icon.download size={15} />} onClick={() => downloadText(`nexus-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(getState().db, null, 2), 'application/json')}>Export JSON backup</Button>
        </div>
      </Card>
      <Card><CardHeader title="Data protection" description="The application does not replace or reset the live database from this screen." /></Card>
    </div>
  );
}
