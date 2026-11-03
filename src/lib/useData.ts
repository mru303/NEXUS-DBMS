import { useMemo } from 'react';
import type { Database, ID, Role, User } from '../data/types';
import { useCurrentUser, useDB } from '../data/store';
import { can as canRole, type Permission } from './permissions';
import { indexBy } from './selectors';

/**
 * Role-scoped view of the database. A Client login only "sees" rows that
 * belong to its company — the same idea as a SQL view / row-level security
 * policy (WHERE client_id = current_client_id).
 */
export function scopeDatabase(db: Database, user: User): Database {
  if (user.role !== 'Client' || !user.clientId) return db;
  const cid = user.clientId;
  const projects = db.projects.filter((p) => p.clientId === cid);
  const pids = new Set(projects.map((p) => p.id));
  const tasks = db.tasks.filter((t) => pids.has(t.projectId));
  const tids = new Set(tasks.map((t) => t.id));
  const invoices = db.invoices.filter((i) => i.clientId === cid && i.state !== 'Draft');
  const iids = new Set(invoices.map((i) => i.id));
  return {
    users: db.users,
    clients: db.clients.filter((c) => c.id === cid),
    projects,
    tasks,
    sessions: db.sessions.filter((s) => tids.has(s.taskId)),
    invoices,
    payments: db.payments.filter((p) => iids.has(p.invoiceId)),
  };
}

export function useData() {
  const fullDb = useDB();
  const user = useCurrentUser();
  return useMemo(() => {
    const db = scopeDatabase(fullDb, user);
    const role: Role = user.role;
    return {
      db,
      fullDb,
      user,
      role,
      can: (p: Permission) => canRole(role, p),
      users: indexBy(fullDb.users),
      clients: indexBy(fullDb.clients),
      projects: indexBy(fullDb.projects),
      tasks: indexBy(fullDb.tasks),
      invoices: indexBy(fullDb.invoices),
      /** Can the current user edit this task? */
      canEditTask: (assigneeId: ID | null) => canRole(role, 'write:tasks') || (canRole(role, 'write:own-tasks') && assigneeId === user.id),
    };
  }, [fullDb, user]);
}

export type DataCtx = ReturnType<typeof useData>;
