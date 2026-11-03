import clsx from 'clsx';
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '../icons';
import { Button, IconButton } from './primitives';

/* ------------------------------------------------------------------
   Focus management shared by modal & drawer
------------------------------------------------------------------- */
const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
let openLayers = 0;

function useDialogBehaviour(open: boolean, onClose: () => void, panel: RefObject<HTMLDivElement | null>) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    openLayers++;
    document.body.style.overflow = 'hidden';
    const t = window.setTimeout(() => {
      const el = panel.current;
      if (!el) return;
      const preferred = el.querySelector<HTMLElement>('[data-autofocus]') ?? el.querySelector<HTMLElement>('input:not([type=hidden]),select,textarea') ?? el.querySelector<HTMLElement>(FOCUSABLE);
      (preferred ?? el).focus();
    }, 20);
    const onKey = (e: KeyboardEvent) => {
      const el = panel.current;
      if (!el) return;
      // Only the top-most layer reacts
      const layers = document.querySelectorAll('[data-layer]');
      if (layers[layers.length - 1] !== el) return;
      if (e.key === 'Escape') {
        e.stopPropagation();
        closeRef.current();
      } else if (e.key === 'Tab') {
        const items = Array.from(el.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((x) => x.offsetParent !== null);
        if (!items.length) return;
        const first = items[0], last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener('keydown', onKey, true);
      openLayers--;
      if (openLayers <= 0) { openLayers = 0; document.body.style.overflow = ''; }
      previouslyFocused?.focus?.();
    };
  }, [open, panel]);
}

/* ------------------------------------------------------------------
   Modal
------------------------------------------------------------------- */
export function Modal({ open, onClose, title, description, children, footer, size = 'md' }: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}) {
  const panel = useRef<HTMLDivElement>(null);
  useDialogBehaviour(open, onClose, panel);
  if (!open) return null;
  const width = { sm: 'max-w-md', md: 'max-w-xl', lg: 'max-w-3xl', xl: 'max-w-5xl' }[size];
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6">
      <div className="anim-fade absolute inset-0 bg-black/60 backdrop-blur-[2px]" onClick={onClose} aria-hidden />
      <div
        ref={panel}
        data-layer
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === 'string' ? title : undefined}
        tabIndex={-1}
        className={clsx('anim-pop relative flex max-h-[92vh] w-full flex-col rounded-t-xl border border-line bg-surface shadow-pop outline-none sm:rounded-xl', width)}
      >
        <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4 sm:px-6">
          <div className="min-w-0">
            <h2 className="text-base font-semibold tracking-[-0.01em] text-ink">{title}</h2>
            {description && <p className="mt-0.5 text-[13px] text-ink-3">{description}</p>}
          </div>
          <IconButton label="Close" size="sm" onClick={onClose} className="-mr-1"><Icon.x size={17} /></IconButton>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">{children}</div>
        {footer && <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line px-5 py-3.5 sm:px-6">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

/* ------------------------------------------------------------------
   Drawer (slide-over)
------------------------------------------------------------------- */
export function Drawer({ open, onClose, title, subtitle, children, footer, width = 'max-w-xl' }: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  width?: string;
}) {
  const panel = useRef<HTMLDivElement>(null);
  useDialogBehaviour(open, onClose, panel);
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="anim-fade absolute inset-0 bg-black/50" onClick={onClose} aria-hidden />
      <div ref={panel} data-layer role="dialog" aria-modal="true" tabIndex={-1} className={clsx('anim-slide relative flex h-full w-full flex-col border-l border-line bg-surface shadow-pop outline-none', width)}>
        <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4 sm:px-6">
          <div className="min-w-0">
            {subtitle && <div className="mb-1.5 flex flex-wrap items-center gap-2">{subtitle}</div>}
            <h2 className="text-[17px] font-semibold tracking-[-0.01em] text-ink">{title}</h2>
          </div>
          <IconButton label="Close panel" size="sm" onClick={onClose}><Icon.x size={17} /></IconButton>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">{children}</div>
        {footer && <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line px-5 py-3.5 sm:px-6">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

/* ------------------------------------------------------------------
   Dropdown menu
------------------------------------------------------------------- */
export interface MenuItem {
  label: ReactNode;
  icon?: ReactNode;
  onSelect?: () => void;
  danger?: boolean;
  disabled?: boolean;
  checked?: boolean;
  hint?: ReactNode;
  divider?: boolean; // render a divider before this item
  heading?: string; // render a small heading before this item
}

export function Menu({ trigger, items, align = 'right', width = 'w-56', placement = 'bottom', label }: {
  trigger: (props: { onClick: () => void; 'aria-expanded': boolean; 'aria-haspopup': 'menu' }) => ReactNode;
  items: MenuItem[];
  align?: 'left' | 'right';
  width?: string;
  placement?: 'bottom' | 'top';
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!wrap.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); (wrap.current?.querySelector('button') as HTMLElement | null)?.focus(); }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const els = Array.from(list.current?.querySelectorAll<HTMLElement>('[role=menuitem]:not([disabled]),[role=menuitemradio]:not([disabled])') ?? []);
        const i = els.indexOf(document.activeElement as HTMLElement);
        const n = e.key === 'ArrowDown' ? (i + 1) % els.length : (i - 1 + els.length) % els.length;
        els[n]?.focus();
      }
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey, true);
    const t = setTimeout(() => list.current?.querySelector<HTMLElement>('[role^=menuitem]')?.focus(), 10);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey, true); clearTimeout(t); };
  }, [open]);

  return (
    <div ref={wrap} className="relative inline-flex">
      {trigger({ onClick: () => setOpen((o) => !o), 'aria-expanded': open, 'aria-haspopup': 'menu' })}
      {open && (
        <div
          ref={list}
          role="menu"
          aria-label={label}
          className={clsx(
            'anim-pop absolute z-50 rounded-lg border border-line bg-surface p-1 shadow-pop',
            width,
            align === 'right' ? 'right-0' : 'left-0',
            placement === 'bottom' ? 'top-full mt-1.5' : 'bottom-full mb-1.5',
          )}
        >
          {items.map((it, i) => (
            <div key={i}>
              {it.divider && <div className="my-1 h-px bg-line" />}
              {it.heading && <p className="px-2.5 pt-2 pb-1 text-[11.5px] font-medium text-ink-3">{it.heading}</p>}
              <button
                type="button"
                role={it.checked !== undefined ? 'menuitemradio' : 'menuitem'}
                aria-checked={it.checked}
                disabled={it.disabled}
                onClick={() => { setOpen(false); it.onSelect?.(); }}
                className={clsx(
                  'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] outline-none transition-colors disabled:opacity-40',
                  it.danger ? 'text-danger hover:bg-danger-soft focus:bg-danger-soft' : 'text-ink-2 hover:bg-hover hover:text-ink focus:bg-hover focus:text-ink',
                )}
              >
                {it.icon && <span className="flex size-4 items-center justify-center opacity-80">{it.icon}</span>}
                <span className="min-w-0 flex-1 truncate">{it.label}</span>
                {it.hint && <span className="text-xs text-ink-3">{it.hint}</span>}
                {it.checked && <Icon.check size={15} className="text-accent-text" />}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** "⋯" row-action menu */
export function RowActions({ items, label = 'More actions' }: { items: MenuItem[]; label?: string }) {
  return (
    <span onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
      <Menu
        label={label}
        width="w-48"
        items={items}
        trigger={(p) => (
          <IconButton label={label} size="sm" {...p}><Icon.more size={17} /></IconButton>
        )}
      />
    </span>
  );
}

/* ------------------------------------------------------------------
   Global toast + confirm (tiny external stores)
------------------------------------------------------------------- */
type ToastKind = 'success' | 'error' | 'info';
interface ToastMsg { id: number; kind: ToastKind; title: string; body?: string }
let toasts: ToastMsg[] = [];
const toastSubs = new Set<() => void>();
const emitToasts = () => toastSubs.forEach((f) => f());
let toastSeq = 1;

export function toast(kind: ToastKind, title: string, body?: string) {
  const id = toastSeq++;
  toasts = [...toasts.slice(-3), { id, kind, title, body }];
  emitToasts();
  window.setTimeout(() => dismissToast(id), kind === 'error' ? 6500 : 4000);
}
function dismissToast(id: number) {
  toasts = toasts.filter((t) => t.id !== id);
  emitToasts();
}

/** Show a toast for an action Result and return whether it succeeded. */
export function notify(res: { ok: true; message?: string } | { ok: false; error: string }, successTitle?: string): boolean {
  if (res.ok) toast('success', successTitle ?? res.message ?? 'Saved');
  else toast('error', 'Couldn’t complete that', res.error);
  return res.ok;
}

export function ToastHost() {
  const list = useSyncExternalStore((f) => { toastSubs.add(f); return () => toastSubs.delete(f); }, () => toasts);
  return createPortal(
    <div className="no-print pointer-events-none fixed right-4 bottom-4 left-4 z-[70] flex flex-col items-end gap-2 sm:left-auto" aria-live="polite" role="status">
      {list.map((t) => (
        <div key={t.id} className="anim-pop pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-lg border border-line bg-surface px-4 py-3 shadow-pop">
          <span className={clsx('mt-0.5', t.kind === 'success' ? 'text-success' : t.kind === 'error' ? 'text-danger' : 'text-info')}>
            {t.kind === 'success' ? <Icon.success size={18} /> : t.kind === 'error' ? <Icon.alert size={18} /> : <Icon.info size={18} />}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[13.5px] font-medium text-ink">{t.title}</p>
            {t.body && <p className="mt-0.5 text-[13px] text-ink-2">{t.body}</p>}
          </div>
          <button className="text-ink-3 hover:text-ink" onClick={() => dismissToast(t.id)} aria-label="Dismiss"><Icon.x size={15} /></button>
        </div>
      ))}
    </div>,
    document.body,
  );
}

interface ConfirmReq {
  title: string;
  body?: ReactNode;
  confirmLabel?: string;
  tone?: 'danger' | 'primary';
  resolve: (v: boolean) => void;
}
let confirmReq: ConfirmReq | null = null;
const confirmSubs = new Set<() => void>();

export function confirmDialog(opts: Omit<ConfirmReq, 'resolve'>): Promise<boolean> {
  return new Promise((resolve) => {
    confirmReq = { ...opts, resolve };
    confirmSubs.forEach((f) => f());
  });
}

export function ConfirmHost() {
  const req = useSyncExternalStore((f) => { confirmSubs.add(f); return () => confirmSubs.delete(f); }, () => confirmReq);
  const close = (v: boolean) => {
    req?.resolve(v);
    confirmReq = null;
    confirmSubs.forEach((f) => f());
  };
  return (
    <Modal
      open={!!req}
      onClose={() => close(false)}
      size="sm"
      title={req?.title ?? ''}
      footer={
        <>
          <Button onClick={() => close(false)}>Cancel</Button>
          <Button data-autofocus variant={req?.tone === 'primary' ? 'primary' : 'danger'} onClick={() => close(true)}>{req?.confirmLabel ?? 'Delete'}</Button>
        </>
      }
    >
      <div className="text-[13.5px] leading-relaxed text-ink-2">{req?.body}</div>
    </Modal>
  );
}

/* ------------------------------------------------------------------
   Tooltip-ish popover anchored to an element (used by charts)
------------------------------------------------------------------- */
export function useElementSize<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setSize({ width: el.clientWidth, height: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, size] as const;
}
