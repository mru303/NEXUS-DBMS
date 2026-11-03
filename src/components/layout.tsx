import clsx from 'clsx';
import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { Role } from '../data/types';
import { getState, markNotificationsRead, switchUser, updateSettings, useSettings, useStore, useTimer } from '../data/store';
import { Link, navigate, useLocation } from '../lib/router';
import { can, type Permission } from '../lib/permissions';
import { isSearchOpen, openDrawer, setMobileNav, setSearchOpen, useUI } from '../lib/ui';
import { useData } from '../lib/useData';
import { buildNotifications } from '../lib/notifications';
import { clock, dateShort, inr } from '../lib/format';
import { invoiceFinancials } from '../lib/selectors';
import { Icon } from './icons';
import { Menu, notify, toast, type MenuItem } from './ui/overlays';
import { Avatar, IconButton, Kbd } from './ui/primitives';

/* ------------------------------------------------------------------
   Navigation config
------------------------------------------------------------------- */
export interface NavItem { label: string; to: string; icon: typeof Icon.overview; perm: Permission }
export const NAV: { group?: string; items: NavItem[] }[] = [
  { items: [{ label: 'Overview', to: '/', icon: Icon.overview, perm: 'view:overview' }] },
  {
    group: 'Work',
    items: [
      { label: 'Projects', to: '/projects', icon: Icon.projects, perm: 'view:projects' },
      { label: 'Tasks', to: '/tasks', icon: Icon.tasks, perm: 'view:tasks' },
      { label: 'Time Tracking', to: '/time', icon: Icon.time, perm: 'view:time' },
    ],
  },
  {
    group: 'Billing',
    items: [
      { label: 'Clients', to: '/clients', icon: Icon.clients, perm: 'view:clients' },
      { label: 'Invoices', to: '/invoices', icon: Icon.invoices, perm: 'view:invoices' },
      { label: 'Payments', to: '/payments', icon: Icon.payments, perm: 'view:payments' },
    ],
  },
  {
    group: 'Organisation',
    items: [
      { label: 'Team', to: '/team', icon: Icon.team, perm: 'view:team' },
      { label: 'Reports', to: '/reports', icon: Icon.reports, perm: 'view:reports' },
      { label: 'Settings', to: '/settings', icon: Icon.settings, perm: 'view:settings' },
    ],
  },
];

export const DEMO_USERS: Record<Role, string> = {
  Administrator: 'USR-001',
  'Project Manager': 'USR-002',
  Employee: 'USR-004',
  Client: 'USR-010',
  'Finance Staff': 'USR-008',
};

export function Logo({ collapsed }: { collapsed?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-primary text-[13px] font-semibold text-on-primary" aria-hidden>N</span>
      {!collapsed && <span className="text-[15px] font-semibold text-ink">Nexus</span>}
    </div>
  );
}

function readCollapsed() {
  try { return localStorage.getItem('nexus.sidebar') === 'collapsed'; } catch { return false; }
}

/* ------------------------------------------------------------------
   Sidebar
------------------------------------------------------------------- */
function SidebarContent({ collapsed, onNavigate }: { collapsed: boolean; onNavigate?: () => void }) {
  const { user, role } = useData();
  const loc = useLocation();
  const settings = useSettings();
  const isActive = (to: string) => (to === '/' ? loc.path === '/' : loc.path === to || loc.path.startsWith(to + '/'));
  return (
    <div className="flex h-full flex-col">
      <div className={clsx('flex h-14 shrink-0 items-center', collapsed ? 'justify-center px-2' : 'px-5')}>
        <Link to="/" onClick={onNavigate} aria-label="NEXUS home"><Logo collapsed={collapsed} /></Link>
      </div>
      {!collapsed && (
        <div className="px-3 pb-2">
          <Menu
            align="left"
            width="w-[calc(100%)] min-w-56"
            label="Workspace"
            items={[
              { heading: 'Workspace', label: settings.workspaceName, checked: true },
              ...(can(role, 'write:settings') ? [{ divider: true, label: 'Workspace settings', icon: <Icon.settings size={15} />, onSelect: () => { navigate('/settings'); onNavigate?.(); } }] : []),
            ]}
            trigger={(p) => (
              <button {...p} className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left transition-colors hover:bg-hover">
                <span className="min-w-0 flex-1 truncate text-[13px] text-ink-2">{settings.workspaceName}</span>
                <Icon.chevronDown size={14} className="text-ink-3" />
              </button>
            )}
          />
        </div>
      )}
      <nav aria-label="Main" className={clsx('flex-1 overflow-y-auto pb-4', collapsed ? 'px-2' : 'px-3')}>
        {NAV.map((section, si) => {
          const items = section.items.filter((i) => can(role, i.perm));
          if (!items.length) return null;
          return (
            <div key={si} className="mt-5 first:mt-1">
              {section.group && !collapsed && <p className="mb-1 px-2.5 text-[12px] text-ink-3">{section.group}</p>}
              {section.group && collapsed && <div className="mx-auto mb-2 h-px w-6 bg-line" />}
              <ul className="flex flex-col gap-0.5">
                {items.map((item) => {
                  const active = isActive(item.to);
                  return (
                    <li key={item.to}>
                      <Link
                        to={item.to}
                        onClick={onNavigate}
                        title={collapsed ? item.label : undefined}
                        aria-current={active ? 'page' : undefined}
                        className={clsx(
                          'group relative flex h-8 items-center gap-2.5 rounded-md text-[13.5px] transition-colors',
                          collapsed ? 'justify-center px-0' : 'px-2.5',
                          active ? 'bg-hover font-medium text-ink' : 'text-ink-2 hover:bg-hover hover:text-ink',
                        )}
                      >
                        <item.icon size={16} className={clsx('shrink-0', active ? 'text-ink' : 'text-ink-3 group-hover:text-ink-2')} />
                        {!collapsed && item.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </nav>
      <div className={clsx('border-t border-line p-3', collapsed && 'px-2')}>
        <ProfileMenu placement="top" align="left" trigger={(p) => (
          <button {...p} className={clsx('flex w-full items-center gap-2.5 rounded-lg p-1.5 text-left transition-colors hover:bg-hover', collapsed && 'justify-center')}>
            <Avatar id={user.id} name={user.fullName} size={28} />
            {!collapsed && (
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-medium text-ink">{user.fullName}</span>
                <span className="block truncate text-[11.5px] text-ink-3">{user.role}</span>
              </span>
            )}
            {!collapsed && <Icon.chevronDown size={15} className="rotate-180 text-ink-3" />}
          </button>
        )} />
      </div>
    </div>
  );
}

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const mobileOpen = useUI((s) => s.mobileNav);
  useEffect(() => {
    try { localStorage.setItem('nexus.sidebar', collapsed ? 'collapsed' : 'open'); } catch { /* ignore */ }
  }, [collapsed]);
  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMobileNav(false);
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [mobileOpen]);
  return (
    <>
      <aside className={clsx('no-print sticky top-0 hidden h-screen shrink-0 border-r border-line bg-rail transition-[width] duration-200 lg:block', collapsed ? 'w-[64px]' : 'w-[232px]')}>
        <SidebarContent collapsed={collapsed} />
        <button
          onClick={() => setCollapsed((c) => !c)}
          className="absolute top-[17px] -right-3 z-10 flex size-6 items-center justify-center rounded-full border border-line bg-surface text-ink-3 hover:text-ink"
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <Icon.chevronRight size={14} /> : <Icon.chevronLeft size={14} />}
        </button>
      </aside>
      {mobileOpen && createPortal(
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="anim-fade absolute inset-0 bg-black/60" onClick={() => setMobileNav(false)} />
          <div className="anim-slide-left relative h-full w-[280px] max-w-[85vw] border-r border-line bg-rail" role="dialog" aria-modal="true" aria-label="Navigation">
            <SidebarContent collapsed={false} onNavigate={() => setMobileNav(false)} />
            <IconButton label="Close menu" className="absolute top-3.5 right-3" onClick={() => setMobileNav(false)}><Icon.x size={18} /></IconButton>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}

/* ------------------------------------------------------------------
   Profile menu (sidebar + top bar)
------------------------------------------------------------------- */
function ProfileMenu({ trigger, placement = 'bottom', align = 'right' }: { trigger: Parameters<typeof Menu>[0]['trigger']; placement?: 'top' | 'bottom'; align?: 'left' | 'right' }) {
  const { user, fullDb } = useData();
  const settings = useSettings();
  const items: MenuItem[] = [
    { label: <span className="block"><span className="block font-medium text-ink">{user.fullName}</span><span className="block text-xs text-ink-3">{user.email}</span></span>, icon: <Icon.user size={15} />, onSelect: () => navigate('/settings?tab=profile') },
    { label: 'Profile & preferences', icon: <Icon.settings size={15} />, onSelect: () => navigate('/settings?tab=profile') },
    { label: settings.theme === 'light' ? 'Switch to dark theme' : 'Switch to light theme', icon: settings.theme === 'light' ? <Icon.moon size={15} /> : <Icon.sun size={15} />, onSelect: () => { void updateSettings({ theme: settings.theme === 'light' ? 'dark' : 'light' }).then(notify); } },
    ...(Object.entries(DEMO_USERS) as [Role, string][]).map(([role, id], i) => {
      const u = fullDb.users.find((x) => x.id === id);
      return {
        heading: i === 0 ? 'Demo · view the app as' : undefined,
        divider: i === 0,
        label: <span className="block"><span className="block">{role}</span><span className="block text-xs text-ink-3">{u?.fullName}</span></span>,
        icon: <Icon.shield size={15} />,
        checked: user.role === role,
        onSelect: () => switchRole(role),
      } as MenuItem;
    }),
  ];
  return <Menu label="Account" width="w-64" placement={placement} align={align} items={items} trigger={trigger} />;
}

export function switchRole(role: Role) {
  const id = DEMO_USERS[role];
  const u = getState().db.users.find((x) => x.id === id);
  if (!u) return;
  switchUser(id);
  toast('info', `Viewing as ${u.fullName}`, `${role} — navigation and actions now match this role.`);
  const path = window.location.hash.replace(/^#/, '').split('?')[0] || '/';
  const item = NAV.flatMap((s) => s.items).find((i) => i.to !== '/' && (path === i.to || path.startsWith(i.to + '/')));
  if (item && !can(role, item.perm)) navigate('/');
}

/* ------------------------------------------------------------------
   Top bar
------------------------------------------------------------------- */
export function Topbar({ crumbs }: { crumbs: { label: string; to?: string }[] }) {
  const { user } = useData();
  const settings = useSettings();

  return (
    <header className="no-print sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-line bg-canvas px-4 sm:px-6 lg:px-8">
      <IconButton label="Open menu" className="lg:hidden" onClick={() => setMobileNav(true)}><Icon.menu size={19} /></IconButton>
      <nav aria-label="Breadcrumb" className="hidden min-w-0 items-center gap-1.5 text-[13.5px] md:flex">
        {crumbs.map((c, i) => (
          <Fragment key={i}>
            {i > 0 && <Icon.chevronRight size={14} className="shrink-0 text-ink-3" />}
            {c.to && i < crumbs.length - 1 ? (
              <Link to={c.to} className="truncate text-ink-3 hover:text-ink">{c.label}</Link>
            ) : (
              <span className={clsx('truncate', i === crumbs.length - 1 ? 'font-medium text-ink' : 'text-ink-3')} aria-current={i === crumbs.length - 1 ? 'page' : undefined}>{c.label}</span>
            )}
          </Fragment>
        ))}
      </nav>
      <div className="flex min-w-0 flex-1 items-center justify-end gap-1.5 sm:gap-2">
        <button
          onClick={() => setSearchOpen(true)}
          className="flex h-8 min-w-0 flex-1 items-center gap-2 rounded-md border border-line bg-surface px-3 text-[13px] text-ink-3 transition-colors hover:border-line-strong md:max-w-64 md:flex-none md:w-64"
          aria-label="Search (Ctrl+K)"
        >
          <Icon.search size={15} className="shrink-0" />
          <span className="truncate">Search…</span>
          <span className="ml-auto hidden items-center gap-0.5 sm:flex"><Kbd>Ctrl</Kbd><Kbd>K</Kbd></span>
        </button>
        <TimerPill />
        <NotificationsMenu />
        <IconButton label={settings.theme === 'light' ? 'Switch to dark theme' : 'Switch to light theme'} onClick={() => { void updateSettings({ theme: settings.theme === 'light' ? 'dark' : 'light' }).then(notify); }} className="hidden sm:inline-flex">
          {settings.theme === 'light' ? <Icon.moon size={18} /> : <Icon.sun size={18} />}
        </IconButton>
        <ProfileMenu trigger={(p) => (
          <button {...p} className="ml-1 hidden rounded-full sm:block" aria-label="Account menu">
            <Avatar id={user.id} name={user.fullName} size={28} />
          </button>
        )} />
      </div>
    </header>
  );
}

function TimerPill() {
  const timer = useTimer();
  const task = useStore((s) => s.db.tasks.find((t) => t.id === s.timer.taskId));
  const [, tick] = useState(0);
  useEffect(() => {
    if (!timer.running) return;
    const id = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [timer.running]);
  if (!timer.running || !timer.startedAt) return null;
  return (
    <Link to="/time" className="hidden h-8 items-center gap-2 rounded-md px-2 text-[13px] text-ink hover:bg-hover md:flex" title={`Timer running on ${task?.title}`}>
      <span className="size-2 rounded-full bg-danger" aria-hidden />
      <span className="num font-medium">{clock(Date.now() - new Date(timer.startedAt).getTime())}</span>
      <span className="hidden max-w-40 truncate text-ink-3 xl:inline">{task?.title}</span>
    </Link>
  );
}

function NotificationsMenu() {
  const { db, user } = useData();
  const settings = useSettings();
  const read = useStore((s) => s.readNotificationIds);
  const notes = useMemo(() => buildNotifications(db, user, settings), [db, user, settings]);
  const unread = notes.filter((n) => !read.includes(n.id));
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!wrap.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);
  const toneIcon = { danger: <Icon.alert size={16} className="text-danger" />, warning: <Icon.clock size={16} className="text-warning" />, success: <Icon.success size={16} className="text-success" />, info: <Icon.info size={16} className="text-info" /> };
  return (
    <div ref={wrap} className="relative">
      <IconButton label={`Notifications${unread.length ? ` (${unread.length} unread)` : ''}`} onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <Icon.bell size={18} />
        {unread.length > 0 && <span className="absolute top-2 right-2 size-2 rounded-full bg-danger ring-2 ring-canvas" aria-hidden />}
      </IconButton>
      {open && (
        <div className="anim-pop fixed inset-x-3 top-16 z-50 overflow-hidden rounded-lg border border-line bg-surface shadow-pop sm:absolute sm:inset-x-auto sm:top-full sm:right-0 sm:mt-1.5 sm:w-[380px]">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <p className="text-sm font-semibold text-ink">Notifications</p>
            <button className="text-[12.5px] font-medium text-accent-text hover:underline disabled:opacity-40 disabled:no-underline" disabled={!unread.length} onClick={() => markNotificationsRead(notes.map((n) => n.id))}>Mark all as read</button>
          </div>
          <ul className="max-h-[60vh] overflow-y-auto">
            {notes.length === 0 && <li className="px-4 py-10 text-center text-[13px] text-ink-3">You’re all caught up.</li>}
            {notes.map((n) => (
              <li key={n.id}>
                <button
                  className="flex w-full items-start gap-3 border-b border-line px-4 py-3 text-left last:border-0 hover:bg-hover"
                  onClick={() => {
                    markNotificationsRead([n.id]);
                    setOpen(false);
                    if (n.taskId) openDrawer({ kind: 'task', id: n.taskId });
                    else if (n.href) navigate(n.href);
                  }}
                >
                  <span className="mt-0.5">{toneIcon[n.tone]}</span>
                  <span className="min-w-0 flex-1">
                    <span className={clsx('block truncate text-[13px]', read.includes(n.id) ? 'text-ink-2' : 'font-medium text-ink')}>{n.title}</span>
                    <span className="block truncate text-xs text-ink-3">{n.body}</span>
                  </span>
                  <span className="shrink-0 text-[11px] text-ink-3">{dateShort(n.date)}</span>
                  {!read.includes(n.id) && <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-accent" aria-label="Unread" />}
                </button>
              </li>
            ))}
          </ul>
          <p className="border-t border-line px-4 py-2.5 text-[11.5px] text-ink-3">Generated from your data. Change what appears in Settings → Notifications.</p>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------
   Global search (Ctrl/⌘ + K)
------------------------------------------------------------------- */
interface Hit { group: string; id: string; title: string; sub: string; icon: ReactNode; go: () => void }

export function SearchPalette() {
  const open = useUI((s) => s.search);
  const { db, role, clients, projects } = useData();
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setSearchOpen(!isSearchOpen()); }
      else if (e.key === '/' && !/input|textarea|select/i.test((e.target as HTMLElement).tagName) && !(e.target as HTMLElement).isContentEditable) { e.preventDefault(); setSearchOpen(true); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);
  useEffect(() => { if (open) { setQ(''); setActive(0); setTimeout(() => input.current?.focus(), 10); } }, [open]);

  const hits = useMemo<Hit[]>(() => {
    const term = q.trim().toLowerCase();
    const out: Hit[] = [];
    const pages = NAV.flatMap((s) => s.items).filter((i) => can(role, i.perm));
    const close = () => setSearchOpen(false);
    for (const p of pages) if (!term || p.label.toLowerCase().includes(term)) out.push({ group: 'Pages', id: p.to, title: p.label, sub: 'Go to page', icon: <p.icon size={16} />, go: () => { navigate(p.to); close(); } });
    if (!term) return out;
    const m = (...s: (string | undefined)[]) => s.some((x) => x?.toLowerCase().includes(term));
    const push = (h: Hit, max = 6) => { if (out.filter((x) => x.group === h.group).length < max) out.push(h); };
    if (can(role, 'view:projects')) for (const p of db.projects) if (m(p.name, p.id, clients.get(p.clientId)?.companyName)) push({ group: 'Projects', id: p.id, title: p.name, sub: `${p.id} · ${clients.get(p.clientId)?.companyName}`, icon: <Icon.projects size={16} />, go: () => { navigate(`/projects/${p.id}`); close(); } });
    if (can(role, 'view:tasks')) for (const t of db.tasks) if (m(t.title, t.id)) push({ group: 'Tasks', id: t.id, title: t.title, sub: `${t.id} · ${projects.get(t.projectId)?.name}`, icon: <Icon.tasks size={16} />, go: () => { close(); openDrawer({ kind: 'task', id: t.id }); } });
    if (can(role, 'view:clients')) for (const c of db.clients) if (m(c.companyName, c.contactPerson, c.id, c.gstin, c.city)) push({ group: 'Clients', id: c.id, title: c.companyName, sub: `${c.id} · ${c.contactPerson} · ${c.city}`, icon: <Icon.clients size={16} />, go: () => { navigate(`/clients/${c.id}`); close(); } });
    if (can(role, 'view:invoices')) for (const i of db.invoices) if (m(i.number, i.id, clients.get(i.clientId)?.companyName)) {
      const f = invoiceFinancials(i, db.payments);
      push({ group: 'Invoices', id: i.id, title: i.number, sub: `${clients.get(i.clientId)?.companyName} · ${inr(f.total)} · ${f.status}`, icon: <Icon.invoices size={16} />, go: () => { navigate(`/invoices/${i.id}`); close(); } });
    }
    if (can(role, 'view:payments')) for (const p of db.payments) if (m(p.id, p.reference, p.method)) push({ group: 'Payments', id: p.id, title: `${p.id} · ${inr(p.amount)}`, sub: `${p.method} · ${p.reference}`, icon: <Icon.payments size={16} />, go: () => { close(); openDrawer({ kind: 'payment', id: p.id }); } });
    if (can(role, 'view:team')) for (const u of db.users) if (m(u.fullName, u.email, u.id, u.department)) push({ group: 'People', id: u.id, title: u.fullName, sub: `${u.role} · ${u.department}`, icon: <Icon.user size={16} />, go: () => { close(); openDrawer({ kind: 'user', id: u.id }); } });
    return out;
  }, [q, db, role, clients, projects]);

  useEffect(() => { setActive(0); }, [q]);
  useEffect(() => { listRef.current?.querySelector(`[data-idx="${active}"]`)?.scrollIntoView({ block: 'nearest' }); }, [active]);

  if (!open) return null;
  let idx = -1;
  const groups = Array.from(new Set(hits.map((h) => h.group)));
  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-start justify-center p-3 pt-[12vh]">
      <div className="anim-fade absolute inset-0 bg-black/60" onClick={() => setSearchOpen(false)} />
      <div className="anim-pop relative w-full max-w-xl overflow-hidden rounded-xl border border-line bg-surface shadow-pop" role="dialog" aria-modal="true" aria-label="Search">
        <div className="flex items-center gap-3 border-b border-line px-4">
          <Icon.search size={17} className="text-ink-3" />
          <input
            ref={input}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by name, ID, invoice number, GSTIN…"
            className="h-13 flex-1 bg-transparent text-[14.5px] text-ink outline-none placeholder:text-ink-3"
            role="combobox"
            aria-expanded="true"
            aria-controls="search-results"
            aria-activedescendant={hits[active] ? `hit-${active}` : undefined}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(hits.length - 1, a + 1)); }
              else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
              else if (e.key === 'Enter') { e.preventDefault(); hits[active]?.go(); }
              else if (e.key === 'Escape') { e.preventDefault(); setSearchOpen(false); }
            }}
          />
          <Kbd>Esc</Kbd>
        </div>
        <ul id="search-results" ref={listRef} role="listbox" className="max-h-[55vh] overflow-y-auto p-2">
          {hits.length === 0 && <li className="px-3 py-10 text-center text-[13px] text-ink-3">No matches for “{q}”. Try an ID like PRJ-003 or an invoice number.</li>}
          {groups.map((g) => (
            <li key={g}>
              <p className="px-3 pt-2 pb-1 text-[11.5px] font-medium text-ink-3">{g}</p>
              <ul>
                {hits.filter((h) => h.group === g).map((h) => {
                  idx++;
                  const i = idx;
                  return (
                    <li key={h.group + h.id} id={`hit-${i}`} data-idx={i} role="option" aria-selected={i === active}>
                      <button onMouseMove={() => setActive(i)} onClick={h.go} className={clsx('flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left', i === active ? 'bg-hover' : '')}>
                        <span className="text-ink-3">{h.icon}</span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13.5px] text-ink">{h.title}</span>
                          <span className="block truncate text-xs text-ink-3">{h.sub}</span>
                        </span>
                        {i === active && <Icon.enter size={14} className="text-ink-3" />}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </li>
          ))}
        </ul>
        <div className="flex items-center gap-4 border-t border-line px-4 py-2 text-[11.5px] text-ink-3">
          <span className="flex items-center gap-1"><Kbd>↑</Kbd><Kbd>↓</Kbd> navigate</span>
          <span className="flex items-center gap-1"><Kbd>↵</Kbd> open</span>
          <span className="ml-auto">Results respect your role</span>
        </div>
      </div>
    </div>,
    document.body,
  );
}
