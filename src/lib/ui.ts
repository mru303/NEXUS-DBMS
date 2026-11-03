/* Global UI state: which create/edit form or detail drawer is open. */
import { useSyncExternalStore } from 'react';
import type { ID } from '../data/types';

export type FormKind = 'project' | 'task' | 'client' | 'invoice' | 'payment' | 'session' | 'user';
export interface FormRequest {
  kind: FormKind;
  id?: ID; // editing when present
  defaults?: Record<string, unknown>;
}
export type DrawerRequest = { kind: 'task' | 'payment' | 'user' | 'session'; id: ID } | null;

interface UIState {
  form: FormRequest | null;
  drawer: DrawerRequest;
  search: boolean;
  mobileNav: boolean;
}

let ui: UIState = { form: null, drawer: null, search: false, mobileNav: false };
const subs = new Set<() => void>();
const set = (p: Partial<UIState>) => {
  ui = { ...ui, ...p };
  subs.forEach((f) => f());
};

export function useUI<T>(sel: (s: UIState) => T): T {
  return useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => sel(ui));
}

export const openForm = (req: FormRequest) => set({ form: req });
export const closeForm = () => set({ form: null });
export const openDrawer = (req: NonNullable<DrawerRequest>) => set({ drawer: req });
export const closeDrawer = () => set({ drawer: null });
export const setSearchOpen = (open: boolean) => set({ search: open });
export const setMobileNav = (open: boolean) => set({ mobileNav: open });
export const isSearchOpen = () => ui.search;
