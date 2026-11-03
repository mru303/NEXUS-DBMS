/* ------------------------------------------------------------------
   Role-based UI for the demo.
   IMPORTANT: these checks only shape what the interface shows. They are
   NOT security — anyone can edit browser state. In a real deployment the
   same rules must be enforced by the API / database (e.g. PostgreSQL
   GRANTs and row-level security policies).
------------------------------------------------------------------- */
import type { Role } from '../data/types';

export type Permission =
  | 'view:overview' | 'view:projects' | 'view:tasks' | 'view:time' | 'view:clients' | 'view:invoices'
  | 'view:payments' | 'view:team' | 'view:reports' | 'view:settings'
  | 'write:projects' | 'write:tasks' | 'write:own-tasks' | 'write:sessions:any' | 'write:sessions:own'
  | 'write:clients' | 'write:invoices' | 'write:payments' | 'write:users' | 'write:settings'
  | 'view:financials';

const ALL: Permission[] = [
  'view:overview', 'view:projects', 'view:tasks', 'view:time', 'view:clients', 'view:invoices', 'view:payments',
  'view:team', 'view:reports', 'view:settings', 'write:projects', 'write:tasks', 'write:own-tasks',
  'write:sessions:any', 'write:sessions:own', 'write:clients', 'write:invoices', 'write:payments',
  'write:users', 'write:settings', 'view:financials',
];

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  Administrator: ALL,
  'Project Manager': [
    'view:overview', 'view:projects', 'view:tasks', 'view:time', 'view:clients', 'view:invoices', 'view:team',
    'view:reports', 'view:settings', 'write:projects', 'write:tasks', 'write:own-tasks', 'write:sessions:any',
    'write:sessions:own', 'write:clients', 'view:financials',
  ],
  Employee: ['view:overview', 'view:projects', 'view:tasks', 'view:time', 'view:team', 'view:settings', 'write:own-tasks', 'write:sessions:own'],
  Client: ['view:overview', 'view:projects', 'view:invoices', 'view:payments', 'view:settings', 'view:financials'],
  'Finance Staff': [
    'view:overview', 'view:projects', 'view:clients', 'view:invoices', 'view:payments', 'view:team', 'view:reports',
    'view:settings', 'write:clients', 'write:invoices', 'write:payments', 'view:financials',
  ],
};

export function can(role: Role, p: Permission) {
  return ROLE_PERMISSIONS[role].includes(p);
}

export const ROLE_SUMMARY: Record<Role, string> = {
  Administrator: 'Full access to every module, team management and workspace settings.',
  'Project Manager': 'Runs projects: creates tasks, assigns people, logs time for the team, manages clients.',
  Employee: 'Works on assigned tasks, updates their status and logs their own time.',
  Client: 'Sees only their own company’s projects, invoices and payments. Read-only.',
  'Finance Staff': 'Creates invoices, records payments and manages client billing details.',
};

export const PERMISSION_MATRIX: { label: string; perm: Permission }[] = [
  { label: 'Projects — create & edit', perm: 'write:projects' },
  { label: 'Tasks — create & assign', perm: 'write:tasks' },
  { label: 'Tasks — update own status', perm: 'write:own-tasks' },
  { label: 'Time — log for anyone', perm: 'write:sessions:any' },
  { label: 'Time — log own hours', perm: 'write:sessions:own' },
  { label: 'Clients — create & edit', perm: 'write:clients' },
  { label: 'Invoices — create & edit', perm: 'write:invoices' },
  { label: 'Payments — record', perm: 'write:payments' },
  { label: 'Reports', perm: 'view:reports' },
  { label: 'Team management', perm: 'write:users' },
  { label: 'Workspace settings', perm: 'write:settings' },
];
