/* ------------------------------------------------------------------
   Minimal hash router (#/projects/PRJ-001?tab=tasks).
   Hash routing lets the built app run from a single file — even opened
   straight from disk — with working back/forward buttons.
------------------------------------------------------------------- */
import { useCallback, useMemo, useSyncExternalStore, type AnchorHTMLAttributes, type MouseEvent, type ReactNode } from 'react';

function subscribe(cb: () => void) {
  window.addEventListener('hashchange', cb);
  return () => window.removeEventListener('hashchange', cb);
}
const getHash = () => window.location.hash || '#/';

export interface Location {
  path: string;
  search: URLSearchParams;
  raw: string;
}

export function useLocation(): Location {
  const hash = useSyncExternalStore(subscribe, getHash, () => '#/');
  return useMemo(() => {
    const raw = hash.replace(/^#/, '') || '/';
    const [path, query = ''] = raw.split('?');
    return { path: path || '/', search: new URLSearchParams(query), raw };
  }, [hash]);
}

export function navigate(to: string, opts: { replace?: boolean } = {}) {
  const target = '#' + (to.startsWith('/') ? to : '/' + to);
  if (opts.replace) {
    window.history.replaceState(null, '', target);
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  } else if (window.location.hash !== target) {
    window.location.hash = target;
  }
  window.scrollTo({ top: 0 });
}

/** Read & write query-string state (filters, tabs) */
export function useQueryState(key: string, fallback = ''): [string, (v: string) => void] {
  const loc = useLocation();
  const value = loc.search.get(key) ?? fallback;
  const set = useCallback(
    (v: string) => {
      const params = new URLSearchParams(loc.search);
      if (!v || v === fallback) params.delete(key);
      else params.set(key, v);
      const q = params.toString();
      const target = '#' + loc.path + (q ? `?${q}` : '');
      window.history.replaceState(null, '', target);
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    },
    [loc, key, fallback],
  );
  return [value, set];
}

/** Match `/projects/:id` against a path */
export function matchPath(pattern: string, path: string): Record<string, string> | null {
  const p = pattern.split('/').filter(Boolean);
  const a = path.split('/').filter(Boolean);
  if (p.length !== a.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < p.length; i++) {
    if (p[i].startsWith(':')) params[p[i].slice(1)] = decodeURIComponent(a[i]);
    else if (p[i] !== a[i]) return null;
  }
  return params;
}

export function Link({ to, children, onClick, ...rest }: { to: string; children: ReactNode } & AnchorHTMLAttributes<HTMLAnchorElement>) {
  return (
    <a
      href={'#' + to}
      onClick={(e: MouseEvent<HTMLAnchorElement>) => {
        onClick?.(e);
        if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        e.preventDefault();
        navigate(to);
      }}
      {...rest}
    >
      {children}
    </a>
  );
}
