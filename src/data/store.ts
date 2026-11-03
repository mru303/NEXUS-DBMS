/* ------------------------------------------------------------------
   Central store + data-access layer.

   • One immutable AppState object, persisted to localStorage.
   • Components subscribe with useStore(selector) (React useSyncExternalStore).
   • Every write goes through an action below. Each action enforces the
     same rules a database would: foreign keys must resolve, deletes are
     RESTRICTed or CASCADEd, payments can't exceed the invoice balance.
   • Actions are named like REST endpoints (createProject ≈ POST
     /projects). To connect a real backend, replace each action body with
     a fetch() call and keep the signatures — pages won't change.
------------------------------------------------------------------- */
import { useSyncExternalStore } from 'react';
import { apiGet, apiRequest } from '../lib/api';
import type {
  ActivityEntry, AppState, Client, Database, EntityKind, ID, Invoice, Payment, Project, Settings, Task, TimerState,
  User, WorkSession,
} from './types';
import { createSeed, DEFAULT_SETTINGS } from './seed';
import {
  EPS, invoiceFinancials, invoiceTotals, nextId, nextInvoiceNumber, payableBalance,
} from '../lib/selectors';
import { hoursBetween, today } from '../lib/dates';
import { inr } from '../lib/format';

const STORAGE_KEY = 'nexus.db.v1';
const VERSION = 3;

const IDLE_TIMER: TimerState = { running: false, startedAt: null, taskId: null, userId: null, notes: '', billable: true };

function freshState(): AppState {
  const seed = createSeed();
  return {
    version: VERSION,
    seededAt: new Date().toISOString(),
    db: seed.db,
    settings: { ...DEFAULT_SETTINGS },
    currentUserId: 'USR-001',
    timer: { ...IDLE_TIMER },
    activity: seed.activity,
    readNotificationIds: [],
  };
}

export let storageAvailable = true;

function load(): AppState | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AppState;
    if (parsed.version !== VERSION || !parsed.db?.users) return null;
    // The redesigned UI is light-first: switch older saved states over once
    const migrated = parsed.settings?.uiV2 ? {} : { theme: 'light' as const, uiV2: true };
    parsed.settings = { ...DEFAULT_SETTINGS, ...parsed.settings, ...migrated };
    return parsed;
  } catch {
    storageAvailable = false;
    return null;
  }
}

let state: AppState = load() ?? freshState();
const listeners = new Set<() => void>();

function persist() {
  try {
    if (typeof localStorage === 'undefined') {
      storageAvailable = false;
      return;
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    storageAvailable = true;
  } catch {
    storageAvailable = false;
  }
}
persist();

function emit() {
  for (const l of listeners) l();
}

function commit(next: AppState) {
  state = next;
  persist();
  emit();
}

// Keep several open tabs in sync
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key !== STORAGE_KEY || !e.newValue) return;
    try {
      const parsed = JSON.parse(e.newValue) as AppState;
      if (parsed.version === VERSION) {
        state = parsed;
        emit();
      }
    } catch { /* ignore */ }
  });
}

export function getState() {
  return state;
}

export async function refreshDatabaseFromApi(): Promise<Database> {
  const response = await apiGet<{ ok: boolean; data?: { db?: Database; settings?: Partial<Settings> }; error?: string }>('/bootstrap');
  if (!response?.ok || !response.data?.db) throw new Error(response?.error || 'The backend returned an invalid database snapshot.');
  const db = response.data.db;
  const collections: (keyof Database)[] = ['users', 'clients', 'projects', 'tasks', 'sessions', 'invoices', 'payments'];
  if (!collections.every((key) => Array.isArray(db[key]))) throw new Error('The backend returned an incomplete database snapshot.');
  commit({ ...state, db, settings: { ...state.settings, ...response.data.settings } });
  return db;
}

export function clearRemoteDatabase() {
  commit({ ...state, db: { users: [], clients: [], projects: [], tasks: [], sessions: [], invoices: [], payments: [] } });
}

async function mutateApi<T = ID>(method: 'POST' | 'PATCH' | 'DELETE', path: string, body: unknown, idField: string, message: string): Promise<Result<T>> {
  try {
    const response = await apiRequest<{ ok?: boolean; data?: Record<string, unknown>; error?: string }>(path, { method, body });
    if (response?.ok === false) return fail(response.error || 'The backend rejected the request.');
    const data = response?.data;
    const value = method === 'DELETE' ? null : data?.id ?? data?.[idField];
    if (method !== 'DELETE' && typeof value !== 'string') return fail('The backend returned an invalid record identifier.');
    await refreshDatabaseFromApi();
    return ok(value as T, message);
  } catch (error) {
    return fail(error instanceof Error ? error.message : 'The request could not be completed.');
  }
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

/** Selector must return a value already in state (no new objects) to stay stable. */
export function useStore<T>(selector: (s: AppState) => T): T {
  return useSyncExternalStore(subscribe, () => selector(state), () => selector(state));
}

export const useDB = () => useStore((s) => s.db);
export const useSettings = () => useStore((s) => s.settings);
export const useTimer = () => useStore((s) => s.timer);
export const useActivity = () => useStore((s) => s.activity);
export const useCurrentUser = () => useStore((s) => s.db.users.find((u) => u.id === s.currentUserId) ?? s.db.users[0]);

/* ------------------------------------------------------------------
   Result type & helpers
------------------------------------------------------------------- */
export type Result<T = ID> = { ok: true; value: T; message?: string } | { ok: false; error: string };
const ok = <T,>(value: T, message?: string): Result<T> => ({ ok: true, value, message });
const fail = (error: string): Result<never> => ({ ok: false, error });

function exists<T extends { id: ID }>(rows: T[], id: ID | null | undefined) {
  return !!id && rows.some((r) => r.id === id);
}

function activity(entity: EntityKind, entityId: ID, action: ActivityEntry['action'], message: string, extra: Partial<ActivityEntry> = {}): ActivityEntry {
  return {
    id: `ACT-${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`,
    at: new Date().toISOString(),
    actorId: state.currentUserId,
    entity,
    entityId,
    action,
    message,
    ...extra,
  };
}

function write(db: Database, entries: ActivityEntry[] = [], patch: Partial<AppState> = {}) {
  commit({ ...state, ...patch, db, activity: [...entries, ...state.activity].slice(0, 400) });
}

function clientOfProject(projectId: ID) {
  return state.db.projects.find((p) => p.id === projectId)?.clientId;
}

/* ------------------------------------------------------------------
   PROJECTS
------------------------------------------------------------------- */
export type ProjectInput = Omit<Project, 'id' | 'createdAt'>;

function checkProject(p: ProjectInput): string | null {
  const { db } = state;
  if (!exists(db.clients, p.clientId)) return 'Choose a client that exists.';
  if (!exists(db.users, p.managerId)) return 'Choose a project manager.';
  if (p.memberIds.some((m) => !exists(db.users, m))) return 'One of the team members no longer exists.';
  if (p.deadline < p.startDate) return 'Deadline must be on or after the start date.';
  if (p.budget < 0 || p.billingRate < 0) return 'Budget and billing rate cannot be negative.';
  return null;
}

export function createProject(input: ProjectInput): Result {
  const err = checkProject(input);
  if (err) return fail(err);
  const { db } = state;
  const id = nextId('PRJ', db.projects);
  const project: Project = { ...input, id, createdAt: today() };
  write({ ...db, projects: [...db.projects, project] }, [
    activity('project', id, 'created', `created project ${project.name}`, { projectId: id, clientId: project.clientId }),
  ]);
  return ok(id, `Project ${id} created`);
}

export function updateProject(id: ID, patch: Partial<ProjectInput>): Result {
  const { db } = state;
  const cur = db.projects.find((p) => p.id === id);
  if (!cur) return fail('Project not found.');
  const next = { ...cur, ...patch };
  const err = checkProject(next);
  if (err) return fail(err);
  if (next.clientId !== cur.clientId && db.invoices.some((i) => i.projectId === id)) {
    return fail('This project already has invoices for its current client, so its client can’t be changed.');
  }
  const statusChanged = patch.status && patch.status !== cur.status;
  write({ ...db, projects: db.projects.map((p) => (p.id === id ? next : p)) }, [
    activity('project', id, statusChanged ? 'status' : 'updated', statusChanged ? `moved ${next.name} to ${next.status}` : `updated project ${next.name}`, { projectId: id, clientId: next.clientId }),
  ]);
  return ok(id, 'Project saved');
}

export function projectDependencies(id: ID) {
  const { db } = state;
  const tasks = db.tasks.filter((t) => t.projectId === id);
  const taskIds = new Set(tasks.map((t) => t.id));
  return {
    tasks: tasks.length,
    sessions: db.sessions.filter((s) => taskIds.has(s.taskId)).length,
    invoices: db.invoices.filter((i) => i.projectId === id).length,
  };
}

/** ON DELETE: tasks & work sessions CASCADE (weak entities); invoices RESTRICT. */
export function deleteProject(id: ID): Result<null> {
  const { db } = state;
  const p = db.projects.find((x) => x.id === id);
  if (!p) return fail('Project not found.');
  const deps = projectDependencies(id);
  if (deps.invoices) return fail(`Can’t delete: ${deps.invoices} invoice(s) reference this project. Cancel or delete the invoices first, or set the project to Cancelled.`);
  const taskIds = new Set(db.tasks.filter((t) => t.projectId === id).map((t) => t.id));
  const timer = state.timer.taskId && taskIds.has(state.timer.taskId) ? { ...IDLE_TIMER } : state.timer;
  write(
    {
      ...db,
      projects: db.projects.filter((x) => x.id !== id),
      tasks: db.tasks.filter((t) => t.projectId !== id),
      sessions: db.sessions.filter((s) => !taskIds.has(s.taskId)),
    },
    [activity('project', id, 'deleted', `deleted project ${p.name} (${deps.tasks} tasks, ${deps.sessions} sessions removed)`, { clientId: p.clientId })],
    { timer },
  );
  return ok(null, `Project ${id} deleted`);
}

/* ------------------------------------------------------------------
   TASKS
------------------------------------------------------------------- */
export type TaskInput = Omit<Task, 'id'>;

function checkTask(t: TaskInput): string | null {
  if (!exists(state.db.projects, t.projectId)) return 'Choose a project.';
  if (t.assigneeId && !exists(state.db.users, t.assigneeId)) return 'Assignee no longer exists.';
  if (t.dueDate < t.startDate) return 'Due date must be on or after the start date.';
  if (!(t.estimatedHours >= 0)) return 'Estimated hours must be zero or more.';
  return null;
}

export function createTask(input: TaskInput): Result {
  const err = checkTask(input);
  if (err) return fail(err);
  const { db } = state;
  const id = nextId('TSK', db.tasks);
  write({ ...db, tasks: [...db.tasks, { ...input, id }] }, [
    activity('task', id, 'created', `created task ${input.title}`, { projectId: input.projectId, clientId: clientOfProject(input.projectId) }),
  ]);
  return ok(id, `Task ${id} created`);
}

export function updateTask(id: ID, patch: Partial<TaskInput>): Result {
  const { db } = state;
  const cur = db.tasks.find((t) => t.id === id);
  if (!cur) return fail('Task not found.');
  const next = { ...cur, ...patch };
  const err = checkTask(next);
  if (err) return fail(err);
  const statusChanged = patch.status && patch.status !== cur.status;
  write({ ...db, tasks: db.tasks.map((t) => (t.id === id ? next : t)) }, [
    activity('task', id, statusChanged ? (next.status === 'Completed' ? 'completed' : 'status') : 'updated',
      statusChanged ? (next.status === 'Completed' ? `completed ${next.title}` : `moved ${next.title} to ${next.status}`) : `updated task ${next.title}`,
      { projectId: next.projectId, clientId: clientOfProject(next.projectId) }),
  ]);
  return ok(id, statusChanged ? `Moved to ${next.status}` : 'Task saved');
}

export function deleteTask(id: ID): Result<null> {
  const { db } = state;
  const t = db.tasks.find((x) => x.id === id);
  if (!t) return fail('Task not found.');
  const removed = db.sessions.filter((s) => s.taskId === id).length;
  write(
    { ...db, tasks: db.tasks.filter((x) => x.id !== id), sessions: db.sessions.filter((s) => s.taskId !== id) },
    [activity('task', id, 'deleted', `deleted task ${t.title}${removed ? ` and ${removed} work session(s)` : ''}`, { projectId: t.projectId, clientId: clientOfProject(t.projectId) })],
    { timer: state.timer.taskId === id ? { ...IDLE_TIMER } : state.timer },
  );
  return ok(null, 'Task deleted');
}

/* ------------------------------------------------------------------
   WORK SESSIONS + TIMER
------------------------------------------------------------------- */
export type SessionInput = Omit<WorkSession, 'id'>;

function checkSession(s: SessionInput): string | null {
  if (!exists(state.db.tasks, s.taskId)) return 'Choose a task.';
  if (!exists(state.db.users, s.userId)) return 'Choose who did the work.';
  const h = hoursBetween(s.start, s.end);
  if (!(h > 0)) return 'End time must be after the start time.';
  if (h > 16) return 'A single session can’t be longer than 16 hours.';
  if (new Date(s.end).getTime() > Date.now() + 60_000) return 'Sessions can’t end in the future.';
  if (s.hourlyRate < 0) return 'Hourly rate can’t be negative.';
  return null;
}

function sessionProject(taskId: ID) {
  const t = state.db.tasks.find((x) => x.id === taskId);
  return t ? { projectId: t.projectId, clientId: clientOfProject(t.projectId) } : {};
}

export function createSession(input: SessionInput): Result {
  const err = checkSession(input);
  if (err) return fail(err);
  const { db } = state;
  const id = nextId('WS', db.sessions, 4);
  const hrs = hoursBetween(input.start, input.end);
  write({ ...db, sessions: [...db.sessions, { ...input, id }] }, [
    activity('session', id, 'created', `logged ${hrs.toFixed(1)} h on ${db.tasks.find((t) => t.id === input.taskId)?.title}`, sessionProject(input.taskId)),
  ]);
  return ok(id, `Logged ${hrs.toFixed(2)} h`);
}

export function updateSession(id: ID, patch: Partial<SessionInput>): Result {
  const { db } = state;
  const cur = db.sessions.find((s) => s.id === id);
  if (!cur) return fail('Session not found.');
  const next = { ...cur, ...patch };
  const err = checkSession(next);
  if (err) return fail(err);
  write({ ...db, sessions: db.sessions.map((s) => (s.id === id ? next : s)) }, [
    activity('session', id, 'updated', `edited work session ${id}`, sessionProject(next.taskId)),
  ]);
  return ok(id, 'Session saved');
}

export function deleteSession(id: ID): Result<null> {
  const { db } = state;
  const cur = db.sessions.find((s) => s.id === id);
  if (!cur) return fail('Session not found.');
  write({ ...db, sessions: db.sessions.filter((s) => s.id !== id) }, [
    activity('session', id, 'deleted', `deleted work session ${id}`, sessionProject(cur.taskId)),
  ]);
  return ok(null, 'Session deleted');
}

export function updateTimer(patch: Partial<TimerState>) {
  commit({ ...state, timer: { ...state.timer, ...patch } });
}

export function startTimer(p: { taskId: ID; userId: ID; notes: string; billable: boolean }): Result<null> {
  if (!exists(state.db.tasks, p.taskId)) return fail('Pick a task to track time against.');
  if (!exists(state.db.users, p.userId)) return fail('Pick who is working.');
  commit({ ...state, timer: { running: true, startedAt: new Date().toISOString(), ...p } });
  return ok(null, 'Timer started');
}

export function stopTimer(): Result {
  const t = state.timer;
  if (!t.running || !t.startedAt || !t.taskId || !t.userId) return fail('No timer is running.');
  const end = new Date().toISOString();
  const mins = hoursBetween(t.startedAt, end) * 60;
  if (mins < 1) {
    commit({ ...state, timer: { ...IDLE_TIMER, taskId: t.taskId, userId: t.userId } });
    return fail('Timer discarded — sessions under one minute aren’t saved.');
  }
  const task = state.db.tasks.find((x) => x.id === t.taskId);
  const project = state.db.projects.find((p) => p.id === task?.projectId);
  const capped = mins > 16 * 60 ? new Date(new Date(t.startedAt).getTime() + 16 * 3600000).toISOString() : end;
  const res = createSession({
    taskId: t.taskId,
    userId: t.userId,
    start: t.startedAt,
    end: capped,
    hourlyRate: project?.billingRate ?? 0,
    billable: t.billable,
    notes: t.notes.trim(),
  });
  if (res.ok) commit({ ...state, timer: { ...IDLE_TIMER, taskId: t.taskId, userId: t.userId, billable: t.billable } });
  return res;
}

export async function stopTimerApi(): Promise<Result> {
  const timer = state.timer;
  if (!timer.running || !timer.startedAt || !timer.taskId || !timer.userId) return fail('No timer is running.');
  const end = new Date().toISOString();
  const minutes = hoursBetween(timer.startedAt, end) * 60;
  if (minutes < 1) {
    commit({ ...state, timer: { ...IDLE_TIMER, taskId: timer.taskId, userId: timer.userId } });
    return fail('Timer discarded — sessions under one minute aren’t saved.');
  }
  const task = state.db.tasks.find((row) => row.id === timer.taskId);
  const project = state.db.projects.find((row) => row.id === task?.projectId);
  const cappedEnd = minutes > 16 * 60 ? new Date(new Date(timer.startedAt).getTime() + 16 * 3600000).toISOString() : end;
  const result = await createSessionApi({
    taskId: timer.taskId, userId: timer.userId, start: timer.startedAt, end: cappedEnd,
    hourlyRate: project?.billingRate ?? 0, billable: timer.billable, notes: timer.notes.trim(),
  });
  if (result.ok) commit({ ...state, timer: { ...IDLE_TIMER, taskId: timer.taskId, userId: timer.userId, billable: timer.billable } });
  return result;
}

export function discardTimer() {
  commit({ ...state, timer: { ...IDLE_TIMER, taskId: state.timer.taskId, userId: state.timer.userId } });
}

/* ------------------------------------------------------------------
   CLIENTS
------------------------------------------------------------------- */
export type ClientInput = Omit<Client, 'id' | 'createdAt'>;
const GSTIN_RE = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

export function normalizeClientRecord(row: Partial<Client> & Record<string, unknown>): Client | null {
  if (!row) return null;

  const id = (row.id ?? row.client_id) as string | undefined;
  if (!id) return null;

  return {
    id,
    companyName: String(row.companyName ?? row.company_name ?? ''),
    contactPerson: String(row.contactPerson ?? row.client_name ?? ''),
    email: String(row.email ?? ''),
    phone: String(row.phone ?? row.phone_number ?? ''),
    street: String(row.street ?? ''),
    city: String(row.city ?? ''),
    state: String(row.state ?? ''),
    pincode: String(row.pincode ?? ''),
    country: String(row.country ?? 'India'),
    gstin: String(row.gstin ?? ''),
    status: (row.status ?? 'Active') as Client['status'],
    createdAt: String(row.createdAt ?? row.created_at ?? today()),
    accountManagerId: String(row.accountManagerId ?? row.account_manager_id ?? ''),
  };
}

export async function refreshClientsFromApi(): Promise<Client[]> {
  return (await refreshDatabaseFromApi()).clients;
}

export async function createClientApi(input: ClientInput): Promise<Result> {
  return mutateApi('POST', '/clients', input, 'client_id', 'Client added');
}

export async function updateClientApi(id: ID, patch: Partial<ClientInput>): Promise<Result> {
  return mutateApi('PATCH', `/clients/${id}`, patch, 'client_id', 'Client saved');
}

export async function deleteClientApi(id: ID): Promise<Result<null>> {
  return mutateApi('DELETE', `/clients/${id}`, undefined, 'client_id', 'Client deleted');
}

export const createProjectApi = (input: ProjectInput) => mutateApi('POST', '/projects', input, 'project_id', 'Project created');
export const updateProjectApi = (id: ID, patch: Partial<ProjectInput>) => mutateApi('PATCH', `/projects/${id}`, patch, 'project_id', 'Project saved');
export const deleteProjectApi = (id: ID) => mutateApi<null>('DELETE', `/projects/${id}`, undefined, 'project_id', 'Project deleted');
export const createTaskApi = (input: TaskInput) => mutateApi('POST', '/tasks', input, 'task_id', 'Task created');
export const updateTaskApi = (id: ID, patch: Partial<TaskInput>) => mutateApi('PATCH', `/tasks/${id}`, patch, 'task_id', 'Task saved');
export const deleteTaskApi = (id: ID) => mutateApi<null>('DELETE', `/tasks/${id}`, undefined, 'task_id', 'Task deleted');
export const createSessionApi = (input: SessionInput) => mutateApi('POST', '/work-sessions', input, 'session_id', 'Work session saved');
export const updateSessionApi = (id: ID, patch: Partial<SessionInput>) => mutateApi('PATCH', `/work-sessions/${id}`, patch, 'session_id', 'Work session saved');
export const deleteSessionApi = (id: ID) => mutateApi<null>('DELETE', `/work-sessions/${id}`, undefined, 'session_id', 'Work session deleted');
export const createInvoiceApi = (input: InvoiceInput) => mutateApi('POST', '/invoices', input, 'invoice_id', 'Invoice saved');
export const updateInvoiceApi = (id: ID, patch: Partial<InvoiceInput>) => mutateApi('PATCH', `/invoices/${id}`, patch, 'invoice_id', 'Invoice saved');
export const deleteInvoiceApi = (id: ID) => mutateApi<null>('DELETE', `/invoices/${id}`, undefined, 'invoice_id', 'Invoice deleted');
export const createPaymentApi = (input: PaymentInput) => mutateApi('POST', '/payments', input, 'payment_id', 'Payment recorded');
export const updatePaymentApi = (id: ID, patch: Partial<PaymentInput>) => mutateApi('PATCH', `/payments/${id}`, patch, 'payment_id', 'Payment saved');
export const deletePaymentApi = (id: ID) => mutateApi<null>('DELETE', `/payments/${id}`, undefined, 'payment_id', 'Payment deleted');
export const createUserApi = (input: UserInput) => mutateApi('POST', '/users', input, 'user_id', 'User added');
export const updateUserApi = (id: ID, patch: Partial<UserInput>) => mutateApi('PATCH', `/users/${id}`, patch, 'user_id', 'User saved');
export const deleteUserApi = (id: ID) => mutateApi<null>('DELETE', `/users/${id}`, undefined, 'user_id', 'User deleted');

function checkClient(c: ClientInput, selfId?: ID): string | null {
  if (c.gstin && !GSTIN_RE.test(c.gstin)) return 'GSTIN should look like 27AAKCS4821M1Z5 (15 characters).';
  if (state.db.clients.some((x) => x.id !== selfId && x.companyName.trim().toLowerCase() === c.companyName.trim().toLowerCase())) return 'A client with this company name already exists.';
  if (!exists(state.db.users, c.accountManagerId)) return 'Choose an account manager.';
  return null;
}

export function createClient(input: ClientInput): Result {
  const err = checkClient(input);
  if (err) return fail(err);
  const { db } = state;
  const id = nextId('CLT', db.clients);
  write({ ...db, clients: [...db.clients, { ...input, id, createdAt: today() }] }, [
    activity('client', id, 'created', `added client ${input.companyName}`, { clientId: id }),
  ]);
  return ok(id, `Client ${id} added`);
}

export function updateClient(id: ID, patch: Partial<ClientInput>): Result {
  const { db } = state;
  const cur = db.clients.find((c) => c.id === id);
  if (!cur) return fail('Client not found.');
  const next = { ...cur, ...patch };
  const err = checkClient(next, id);
  if (err) return fail(err);
  write({ ...db, clients: db.clients.map((c) => (c.id === id ? next : c)) }, [
    activity('client', id, 'updated', `updated client ${next.companyName}`, { clientId: id }),
  ]);
  return ok(id, 'Client saved');
}

export function clientDependencies(id: ID) {
  const { db } = state;
  return {
    projects: db.projects.filter((p) => p.clientId === id).length,
    invoices: db.invoices.filter((i) => i.clientId === id).length,
    users: db.users.filter((u) => u.clientId === id).length,
  };
}

/** ON DELETE RESTRICT: a client with projects, invoices or portal users can't be deleted. */
export function deleteClient(id: ID): Result<null> {
  const { db } = state;
  const c = db.clients.find((x) => x.id === id);
  if (!c) return fail('Client not found.');
  const d = clientDependencies(id);
  if (d.projects || d.invoices || d.users) {
    return fail(`Can’t delete ${c.companyName}: it still has ${[d.projects && `${d.projects} project(s)`, d.invoices && `${d.invoices} invoice(s)`, d.users && `${d.users} portal user(s)`].filter(Boolean).join(', ')}. Mark the client Inactive instead.`);
  }
  write({ ...db, clients: db.clients.filter((x) => x.id !== id) }, [activity('client', id, 'deleted', `deleted client ${c.companyName}`)]);
  return ok(null, 'Client deleted');
}

/* ------------------------------------------------------------------
   INVOICES
------------------------------------------------------------------- */
export type InvoiceInput = Omit<Invoice, 'id' | 'number' | 'sentAt'>;

function checkInvoice(i: InvoiceInput, selfId?: ID): string | null {
  const { db } = state;
  const project = db.projects.find((p) => p.id === i.projectId);
  if (!exists(db.clients, i.clientId)) return 'Choose a client.';
  if (!project) return 'Choose a project.';
  if (project.clientId !== i.clientId) return 'That project belongs to a different client.';
  if (i.dueDate < i.issueDate) return 'Due date must be on or after the issue date.';
  if (!i.lineItems.length) return 'Add at least one line item.';
  if (i.lineItems.some((li) => !li.description.trim())) return 'Every line item needs a description.';
  if (i.lineItems.some((li) => !(li.quantity > 0) || li.unitPrice < 0)) return 'Quantities must be above zero and prices can’t be negative.';
  if (i.discountPct < 0 || i.discountPct > 100) return 'Discount must be between 0 and 100%.';
  if (selfId) {
    const committed = db.payments.filter((p) => p.invoiceId === selfId && (p.status === 'Completed' || p.status === 'Pending')).reduce((s, p) => s + p.amount, 0);
    const { total } = invoiceTotals(i);
    if (total + EPS < committed) return `The new total (${inr(total)}) is less than the ${inr(committed)} already paid.`;
  }
  return null;
}

export function createInvoice(input: InvoiceInput): Result {
  const err = checkInvoice(input);
  if (err) return fail(err);
  const { db, settings } = state;
  const id = nextId('INV', db.invoices);
  const number = nextInvoiceNumber(settings.invoicePrefix, input.issueDate, db.invoices);
  const inv: Invoice = { ...input, id, number, ...(input.state === 'Sent' ? { sentAt: today() } : {}) };
  const client = db.clients.find((c) => c.id === input.clientId);
  write({ ...db, invoices: [...db.invoices, inv] }, [
    activity('invoice', id, input.state === 'Sent' ? 'sent' : 'created',
      input.state === 'Sent' ? `issued invoice ${number} to ${client?.companyName}` : `drafted invoice ${number}`,
      { projectId: inv.projectId, clientId: inv.clientId }),
  ]);
  return ok(id, input.state === 'Sent' ? `Invoice ${number} marked as sent` : `Draft ${number} saved`);
}

export function updateInvoice(id: ID, patch: Partial<InvoiceInput>): Result {
  const { db } = state;
  const cur = db.invoices.find((i) => i.id === id);
  if (!cur) return fail('Invoice not found.');
  const next = { ...cur, ...patch };
  const hasPayments = db.payments.some((p) => p.invoiceId === id);
  if (hasPayments && next.clientId !== cur.clientId) return fail('This invoice has payments, so its client can’t be changed.');
  const err = checkInvoice(next, id);
  if (err) return fail(err);
  if (next.state === 'Draft' && hasPayments) return fail('An invoice with payments can’t go back to Draft.');
  if (next.state === 'Sent' && !next.sentAt) next.sentAt = today();
  write({ ...db, invoices: db.invoices.map((i) => (i.id === id ? next : i)) }, [
    activity('invoice', id, 'updated', `updated invoice ${next.number}`, { projectId: next.projectId, clientId: next.clientId }),
  ]);
  return ok(id, 'Invoice saved');
}

export function markInvoiceSent(id: ID): Result {
  const inv = state.db.invoices.find((i) => i.id === id);
  if (!inv) return fail('Invoice not found.');
  if (inv.state !== 'Draft') return fail('Only drafts can be marked as sent.');
  const { db } = state;
  const client = db.clients.find((c) => c.id === inv.clientId);
  write({ ...db, invoices: db.invoices.map((i) => (i.id === id ? { ...i, state: 'Sent', sentAt: today() } : i)) }, [
    activity('invoice', id, 'sent', `marked invoice ${inv.number} as sent to ${client?.companyName}`, { projectId: inv.projectId, clientId: inv.clientId }),
  ]);
  return ok(id, `Marked ${inv.number} as sent (simulated — no email is sent)`);
}

export function cancelInvoice(id: ID): Result {
  const { db } = state;
  const inv = db.invoices.find((i) => i.id === id);
  if (!inv) return fail('Invoice not found.');
  const f = invoiceFinancials(inv, db.payments);
  if (f.paid > EPS || f.pending > EPS) return fail('This invoice has payments recorded. Refund or delete them before cancelling.');
  write({ ...db, invoices: db.invoices.map((i) => (i.id === id ? { ...i, state: 'Cancelled' } : i)) }, [
    activity('invoice', id, 'status', `cancelled invoice ${inv.number}`, { projectId: inv.projectId, clientId: inv.clientId }),
  ]);
  return ok(id, `Invoice ${inv.number} cancelled`);
}

/** ON DELETE RESTRICT when payments exist. */
export function deleteInvoice(id: ID): Result<null> {
  const { db } = state;
  const inv = db.invoices.find((i) => i.id === id);
  if (!inv) return fail('Invoice not found.');
  const n = db.payments.filter((p) => p.invoiceId === id).length;
  if (n) return fail(`Can’t delete ${inv.number}: ${n} payment record(s) reference it. Cancel the invoice instead to keep the audit trail.`);
  write({ ...db, invoices: db.invoices.filter((i) => i.id !== id) }, [
    activity('invoice', id, 'deleted', `deleted invoice ${inv.number}`, { projectId: inv.projectId, clientId: inv.clientId }),
  ]);
  return ok(null, 'Invoice deleted');
}

/* ------------------------------------------------------------------
   PAYMENTS
------------------------------------------------------------------- */
export type PaymentInput = Omit<Payment, 'id'>;

function checkPayment(p: PaymentInput, selfId?: ID): string | null {
  const { db } = state;
  const inv = db.invoices.find((i) => i.id === p.invoiceId);
  if (!inv) return 'Choose an invoice.';
  if (inv.state === 'Draft') return 'This invoice is still a draft. Mark it as sent before recording payments.';
  if (inv.state === 'Cancelled') return 'Payments can’t be recorded against a cancelled invoice.';
  if (!(p.amount > 0)) return 'Amount must be greater than zero.';
  if (p.date > today()) return 'Payment date can’t be in the future.';
  if (p.method !== 'Cash' && !p.reference.trim()) return 'Add the transaction reference (UTR, UPI ref, cheque no.).';
  if (p.status === 'Completed' || p.status === 'Pending') {
    const cap = payableBalance(inv, db.payments, selfId);
    if (p.amount > cap + EPS) return `Amount exceeds the remaining balance of ${inr(cap, true)} on ${inv.number}.`;
  }
  return null;
}

function paymentEffect(invoiceId: ID, payments: Payment[]) {
  const inv = state.db.invoices.find((i) => i.id === invoiceId)!;
  const f = invoiceFinancials(inv, payments);
  return { inv, f };
}

export function createPayment(input: PaymentInput): Result {
  const err = checkPayment(input);
  if (err) return fail(err);
  const { db } = state;
  const id = nextId('PAY', db.payments);
  const payments = [...db.payments, { ...input, id }];
  const { inv, f } = paymentEffect(input.invoiceId, payments);
  write({ ...db, payments }, [
    activity('payment', id, 'payment', `recorded ${input.status === 'Completed' ? 'a payment' : `a ${input.status.toLowerCase()} payment`} of ${inr(input.amount)} on ${inv.number}`, { projectId: inv.projectId, clientId: inv.clientId }),
  ]);
  return ok(id, `Payment recorded — ${inv.number} is now ${f.status}${f.balance > EPS ? ` (${inr(f.balance)} due)` : ''}`);
}

export function updatePayment(id: ID, patch: Partial<PaymentInput>): Result {
  const { db } = state;
  const cur = db.payments.find((p) => p.id === id);
  if (!cur) return fail('Payment not found.');
  const next = { ...cur, ...patch };
  const err = checkPayment(next, id);
  if (err) return fail(err);
  const payments = db.payments.map((p) => (p.id === id ? next : p));
  const { inv, f } = paymentEffect(next.invoiceId, payments);
  write({ ...db, payments }, [
    activity('payment', id, 'updated', `updated payment ${id} on ${inv.number}`, { projectId: inv.projectId, clientId: inv.clientId }),
  ]);
  return ok(id, `Payment saved — ${inv.number} is now ${f.status}`);
}

export function deletePayment(id: ID): Result<null> {
  const { db } = state;
  const cur = db.payments.find((p) => p.id === id);
  if (!cur) return fail('Payment not found.');
  const payments = db.payments.filter((p) => p.id !== id);
  const { inv, f } = paymentEffect(cur.invoiceId, payments);
  write({ ...db, payments }, [
    activity('payment', id, 'deleted', `deleted payment ${id} on ${inv.number}`, { projectId: inv.projectId, clientId: inv.clientId }),
  ]);
  return ok(null, `Payment deleted — ${inv.number} is now ${f.status}`);
}

/* ------------------------------------------------------------------
   USERS
------------------------------------------------------------------- */
export type UserInput = Omit<User, 'id'>;

function checkUser(u: UserInput, selfId?: ID): string | null {
  if (state.db.users.some((x) => x.id !== selfId && x.email.toLowerCase() === u.email.toLowerCase())) return 'Another user already has this email.';
  if (u.role === 'Client' && !exists(state.db.clients, u.clientId)) return 'Client users must be linked to a client company.';
  return null;
}

export function createUser(input: UserInput): Result {
  const err = checkUser(input);
  if (err) return fail(err);
  const { db } = state;
  const id = nextId('USR', db.users);
  const user: User = { ...input, id };
  if (user.role !== 'Client') delete user.clientId;
  write({ ...db, users: [...db.users, user] }, [activity('user', id, 'created', `added ${input.fullName} as ${input.role}`)]);
  return ok(id, `${input.fullName} added`);
}

export function updateUser(id: ID, patch: Partial<UserInput>): Result {
  const { db } = state;
  const cur = db.users.find((u) => u.id === id);
  if (!cur) return fail('User not found.');
  const next: User = { ...cur, ...patch };
  if (next.role !== 'Client') delete next.clientId;
  const err = checkUser(next, id);
  if (err) return fail(err);
  if (id === 'USR-001' && (next.role !== 'Administrator' || next.status !== 'Active')) return fail('The workspace owner must stay an active Administrator.');
  write({ ...db, users: db.users.map((u) => (u.id === id ? next : u)) }, [activity('user', id, 'updated', `updated ${next.fullName}`)]);
  return ok(id, 'Saved');
}

export function userDependencies(id: ID) {
  const { db } = state;
  return {
    managedProjects: db.projects.filter((p) => p.managerId === id).length,
    memberships: db.projects.filter((p) => p.memberIds.includes(id)).length,
    tasks: db.tasks.filter((t) => t.assigneeId === id).length,
    sessions: db.sessions.filter((s) => s.userId === id).length,
    clients: db.clients.filter((c) => c.accountManagerId === id).length,
  };
}

export function deleteUser(id: ID): Result<null> {
  const { db } = state;
  const u = db.users.find((x) => x.id === id);
  if (!u) return fail('User not found.');
  if (id === state.currentUserId) return fail('You can’t delete the account you’re signed in with.');
  if (id === 'USR-001') return fail('The workspace owner can’t be deleted.');
  const d = userDependencies(id);
  const blockers = [
    d.managedProjects && `manages ${d.managedProjects} project(s)`,
    d.tasks && `is assigned ${d.tasks} task(s)`,
    d.sessions && `has ${d.sessions} logged work session(s)`,
    d.clients && `is account manager for ${d.clients} client(s)`,
  ].filter(Boolean);
  if (blockers.length) return fail(`Can’t delete ${u.fullName}: ${blockers.join(', ')}. Set them to Inactive instead to keep history intact.`);
  write(
    { ...db, users: db.users.filter((x) => x.id !== id), projects: db.projects.map((p) => ({ ...p, memberIds: p.memberIds.filter((m) => m !== id) })) },
    [activity('user', id, 'deleted', `removed ${u.fullName}`)],
  );
  return ok(null, `${u.fullName} removed`);
}

/* ------------------------------------------------------------------
   SESSION / SETTINGS / DEMO
------------------------------------------------------------------- */
export function switchUser(id: ID) {
  if (!exists(state.db.users, id)) return;
  commit({ ...state, currentUserId: id });
}

export async function updateSettings(patch: Partial<Settings>): Promise<Result<null>> {
  try {
    const response = await apiRequest<{ ok: boolean; data?: { settings?: Partial<Settings> }; error?: string }>('/settings', { method: 'PUT', body: patch });
    if (!response?.ok || !response.data?.settings) return fail(response?.error || 'The backend did not save these settings.');
    commit({ ...state, settings: { ...state.settings, ...response.data.settings } });
    return ok(null, 'Settings saved');
  } catch (error) {
    return fail(error instanceof Error ? error.message : 'Could not save settings.');
  }
}

export function markNotificationsRead(ids: string[]) {
  commit({ ...state, readNotificationIds: Array.from(new Set([...state.readNotificationIds, ...ids])).slice(-300) });
}

export function resetDemoData() {
  const keepTheme = state.settings.theme;
  const fresh = freshState();
  fresh.settings.theme = keepTheme;
  commit(fresh);
}

/** Replace whole DB (used by JSON import). Validates shape lightly. */
export function importDatabase(db: Database): Result<null> {
  const keys: (keyof Database)[] = ['users', 'clients', 'projects', 'tasks', 'sessions', 'invoices', 'payments'];
  if (!keys.every((k) => Array.isArray(db[k]))) return fail('That file is not a NEXUS export.');
  if (!db.users.some((u) => u.id === 'USR-001')) return fail('The export is missing the workspace owner (USR-001).');
  commit({ ...state, db, currentUserId: 'USR-001', timer: { ...IDLE_TIMER } });
  return ok(null, 'Data imported');
}

