import { useEffect, useState, type ReactNode } from 'react';
import { useSettings } from './data/store';
import { clearRemoteDatabase, refreshDatabaseFromApi } from './data/store';
import { matchPath, useLocation, Link } from './lib/router';
import { useData } from './lib/useData';
import type { Permission } from './lib/permissions';
import { SearchPalette, Sidebar, Topbar } from './components/layout';
import { ConfirmHost, ToastHost } from './components/ui/overlays';
import { FormHost } from './components/forms';
import { DrawerHost } from './components/drawers';
import { EmptyState, Button } from './components/ui/primitives';
import { Icon } from './components/icons';
import { OverviewPage } from './pages/Overview';
import { ProjectsPage } from './pages/Projects';
import { ProjectDetailPage } from './pages/ProjectDetail';
import { TasksPage } from './pages/Tasks';
import { TimePage } from './pages/Time';
import { ClientsPage } from './pages/Clients';
import { ClientDetailPage } from './pages/ClientDetail';
import { InvoicesPage } from './pages/Invoices';
import { InvoiceViewPage } from './pages/InvoiceView';
import { PaymentsPage } from './pages/Payments';
import { TeamPage } from './pages/Team';
import { ReportsPage } from './pages/Reports';
import { SettingsPage } from './pages/Settings';

interface Route {
  path: string;
  perm: Permission;
  section: string;
  sectionTo?: string;
  render: (params: Record<string, string>) => ReactNode;
}

const ROUTES: Route[] = [
  { path: '/', perm: 'view:overview', section: 'Overview', render: () => <OverviewPage /> },
  { path: '/projects', perm: 'view:projects', section: 'Projects', render: () => <ProjectsPage /> },
  { path: '/projects/:id', perm: 'view:projects', section: 'Projects', sectionTo: '/projects', render: (p) => <ProjectDetailPage id={p.id} /> },
  { path: '/tasks', perm: 'view:tasks', section: 'Tasks', render: () => <TasksPage /> },
  { path: '/time', perm: 'view:time', section: 'Time Tracking', render: () => <TimePage /> },
  { path: '/clients', perm: 'view:clients', section: 'Clients', render: () => <ClientsPage /> },
  { path: '/clients/:id', perm: 'view:clients', section: 'Clients', sectionTo: '/clients', render: (p) => <ClientDetailPage id={p.id} /> },
  { path: '/invoices', perm: 'view:invoices', section: 'Invoices', render: () => <InvoicesPage /> },
  { path: '/invoices/:id', perm: 'view:invoices', section: 'Invoices', sectionTo: '/invoices', render: (p) => <InvoiceViewPage id={p.id} /> },
  { path: '/payments', perm: 'view:payments', section: 'Payments', render: () => <PaymentsPage /> },
  { path: '/team', perm: 'view:team', section: 'Team', render: () => <TeamPage /> },
  { path: '/reports', perm: 'view:reports', section: 'Reports', render: () => <ReportsPage /> },
  { path: '/settings', perm: 'view:settings', section: 'Settings', render: () => <SettingsPage /> },
];

function useThemeSync() {
  const { theme } = useSettings();
  useEffect(() => {
    const apply = () => {
      const t = theme === 'system' ? (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark') : theme;
      document.documentElement.dataset.theme = t;
    };
    apply();
    if (theme !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: light)');
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [theme]);
}

export function App() {
  useThemeSync();
  const loc = useLocation();
  const { can, fullDb, user } = useData();
  const [apiStatus, setApiStatus] = useState<'loading' | 'online' | 'offline'>('loading');

  useEffect(() => {
    let cancelled = false;
    refreshDatabaseFromApi()
      .then(() => { if (!cancelled) setApiStatus('online'); })
      .catch(() => {
        clearRemoteDatabase();
        if (!cancelled) setApiStatus('offline');
      });

    return () => {
      cancelled = true;
    };
  }, []);

  let route: Route | undefined;
  let params: Record<string, string> = {};
  for (const r of ROUTES) {
    const m = matchPath(r.path, loc.path);
    if (m) { route = r; params = m; break; }
  }

  const crumbs: { label: string; to?: string }[] = [{ label: 'Nexus Studio', to: '/' }];
  if (route) {
    crumbs.push({ label: route.section, to: route.sectionTo ?? route.path });
    if (params.id) {
      const label =
        fullDb.projects.find((x) => x.id === params.id)?.name ??
        fullDb.clients.find((x) => x.id === params.id)?.companyName ??
        fullDb.invoices.find((x) => x.id === params.id)?.number ??
        params.id;
      crumbs.push({ label });
    }
  } else crumbs.push({ label: 'Not found' });

  useEffect(() => {
    document.title = `${crumbs[crumbs.length - 1].label} · NEXUS`;
  });

  let page: ReactNode;
  if (!route) {
    page = <EmptyState icon={<Icon.alert size={20} />} title="Page not found" body={`Nothing lives at “${loc.path}”.`} action={<Link to="/"><Button variant="primary">Back to overview</Button></Link>} />;
  } else if (!can(route.perm)) {
    page = <EmptyState icon={<Icon.shield size={20} />} title="Not available for your role" body={`${user.role} accounts can’t open ${route.section}. Switch role from the profile menu to demo other views.`} action={<Link to="/"><Button variant="primary">Back to overview</Button></Link>} />;
  } else {
    page = route.render(params);
  }

  return (
    <div className="flex min-h-screen">
      <a href="#main" className="sr-only z-[80] rounded-lg bg-accent px-3 py-2 text-white focus:not-sr-only focus:fixed focus:top-3 focus:left-3">Skip to content</a>
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar crumbs={crumbs} />
        {apiStatus !== 'online' && (
          <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900">
            {apiStatus === 'loading' ? 'Connecting to the NEXUS API and database…' : 'Backend or database unavailable. Server data is not loaded. Start PostgreSQL and the API, then refresh this page.'}
          </div>
        )}
        <main id="main" className="print-root mx-auto w-full max-w-[1480px] flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8" key={loc.path}>
          {apiStatus === 'loading' ? <div className="rounded-lg border border-line bg-surface px-4 py-6 text-sm text-ink-3">Loading workspace data…</div> : page}
        </main>
      </div>
      <SearchPalette />
      <FormHost />
      <DrawerHost />
      <ConfirmHost />
      <ToastHost />
    </div>
  );
}
