/* ------------------------------------------------------------------
   Schema metadata for the Database Overview page, a live integrity
   checker, and a PostgreSQL export (DDL + INSERTs) of the current data —
   so the exact dataset in the app can be loaded into pgAdmin 4.
------------------------------------------------------------------- */
import type { Database, Settings } from './types';
import { PAYMENT_METHODS, PAYMENT_STATUSES, PRIORITIES, PROJECT_STATUSES, ROLES, TASK_STATUSES } from './types';
import { invoiceTotals, round2 } from '../lib/selectors';
import { hoursBetween } from '../lib/dates';

export interface Column { name: string; type: string; key?: 'PK' | 'FK' | 'PK, FK'; ref?: string; note?: string; added?: boolean }
export interface TableMeta { name: string; entity: string; key: keyof Database; description: string; columns: Column[] }

export const TABLES: TableMeta[] = [
  {
    name: 'users', entity: 'USER', key: 'users', description: 'People who sign in: staff of every role, plus client portal logins.',
    columns: [
      { name: 'user_id', type: 'VARCHAR(10)', key: 'PK' },
      { name: 'full_name', type: 'VARCHAR(100)', note: 'Exp 2 splits this into first_name / last_name' },
      { name: 'email', type: 'VARCHAR(120)', note: 'UNIQUE' },
      { name: 'phone_number', type: 'VARCHAR(20)' },
      { name: 'account_type', type: 'VARCHAR(20)', note: `CHECK IN (${ROLES.join(', ')})` },
      { name: 'department', type: 'VARCHAR(60)', added: true },
      { name: 'status', type: 'VARCHAR(10)', added: true, note: 'Active / Inactive' },
      { name: 'joined_at', type: 'DATE', added: true },
      { name: 'client_id', type: 'VARCHAR(10)', key: 'FK', ref: 'clients', added: true, note: 'Only for Client logins' },
    ],
  },
  {
    name: 'clients', entity: 'CLIENT', key: 'clients', description: 'Companies that commission projects and receive invoices.',
    columns: [
      { name: 'client_id', type: 'VARCHAR(10)', key: 'PK' },
      { name: 'company_name', type: 'VARCHAR(120)', note: 'UNIQUE' },
      { name: 'client_name', type: 'VARCHAR(100)', note: 'Contact person' },
      { name: 'email', type: 'VARCHAR(120)' },
      { name: 'phone_number', type: 'VARCHAR(20)' },
      { name: 'street, city, state, pincode, country', type: 'VARCHAR', note: 'Composite ADDRESS attribute, flattened (Exp 2)' },
      { name: 'gstin', type: 'CHAR(15)', added: true },
      { name: 'status', type: 'VARCHAR(10)', added: true },
      { name: 'created_at', type: 'DATE', added: true },
      { name: 'account_manager_id', type: 'VARCHAR(10)', key: 'FK', ref: 'users', note: 'USER — MANAGES — CLIENT (Exp 1)' },
    ],
  },
  {
    name: 'projects', entity: 'PROJECT', key: 'projects', description: 'Client engagements with budget, billing rate, team and deadline.',
    columns: [
      { name: 'project_id', type: 'VARCHAR(10)', key: 'PK' },
      { name: 'project_name', type: 'VARCHAR(120)' },
      { name: 'description', type: 'TEXT' },
      { name: 'start_date', type: 'DATE' },
      { name: 'deadline', type: 'DATE', note: 'CHECK (deadline >= start_date)' },
      { name: 'status', type: 'VARCHAR(15)', note: PROJECT_STATUSES.join(' / ') },
      { name: 'priority', type: 'VARCHAR(10)', added: true },
      { name: 'budget', type: 'NUMERIC(12,2)', added: true },
      { name: 'billing_rate', type: 'NUMERIC(10,2)', added: true, note: '₹ per hour' },
      { name: 'user_id', type: 'VARCHAR(10)', key: 'FK', ref: 'users', note: 'Project manager (USER — MANAGES — PROJECT)' },
      { name: 'client_id', type: 'VARCHAR(10)', key: 'FK', ref: 'clients', note: 'CLIENT — OWNS — PROJECT' },
    ],
  },
  {
    name: 'tasks', entity: 'TASK', key: 'tasks', description: 'Units of work inside a project, assigned to one person.',
    columns: [
      { name: 'task_id', type: 'VARCHAR(10)', key: 'PK', note: 'Surrogate key; Exp 2 used (project_id, task_id) as TASK is weak' },
      { name: 'project_id', type: 'VARCHAR(10)', key: 'FK', ref: 'projects', note: 'ON DELETE CASCADE (weak entity)' },
      { name: 'title', type: 'VARCHAR(120)', note: 'Exp 2: task_number' },
      { name: 'description', type: 'TEXT', added: true },
      { name: 'assignee_id', type: 'VARCHAR(10)', key: 'FK', ref: 'users', added: true },
      { name: 'priority', type: 'VARCHAR(10)' },
      { name: 'status', type: 'VARCHAR(15)', note: TASK_STATUSES.join(' / ') },
      { name: 'start_date', type: 'DATE', added: true },
      { name: 'due_date', type: 'DATE' },
      { name: 'estimated_hours', type: 'NUMERIC(6,2)' },
    ],
  },
  {
    name: 'work_sessions', entity: 'WORK SESSION', key: 'sessions', description: 'Timed work on a task by one person; priced at an hourly rate.',
    columns: [
      { name: 'session_id', type: 'VARCHAR(10)', key: 'PK' },
      { name: 'task_id', type: 'VARCHAR(10)', key: 'FK', ref: 'tasks', note: 'TASK — RECORDS — WORK SESSION, ON DELETE CASCADE' },
      { name: 'user_id', type: 'VARCHAR(10)', key: 'FK', ref: 'users', added: true, note: 'Who did the work' },
      { name: 'start_time', type: 'TIMESTAMPTZ' },
      { name: 'end_time', type: 'TIMESTAMPTZ', note: 'CHECK (end_time > start_time)' },
      { name: 'duration', type: 'NUMERIC', note: 'GENERATED from end_time − start_time (hours)' },
      { name: 'hourly_rate', type: 'NUMERIC(10,2)', added: true },
      { name: 'billable_status', type: 'BOOLEAN' },
      { name: 'notes', type: 'TEXT' },
    ],
  },
  {
    name: 'invoices', entity: 'INVOICE', key: 'invoices', description: 'GST invoices to a client for a project. Line items live in invoice_items.',
    columns: [
      { name: 'invoice_id', type: 'VARCHAR(10)', key: 'PK' },
      { name: 'invoice_number', type: 'VARCHAR(20)', added: true, note: 'UNIQUE, financial-year series' },
      { name: 'invoice_date', type: 'DATE' },
      { name: 'due_date', type: 'DATE' },
      { name: 'discount_pct', type: 'NUMERIC(5,2)', added: true },
      { name: 'tax_rate', type: 'NUMERIC(5,2)', note: 'tax_amount & total_amount are derived (see view)' },
      { name: 'invoice_status', type: 'VARCHAR(12)', note: 'Stored: Draft / Sent / Cancelled. Paid, Partially Paid, Overdue are derived.' },
      { name: 'client_id', type: 'VARCHAR(10)', key: 'FK', ref: 'clients', note: 'CLIENT — RECEIVES — INVOICE' },
      { name: 'project_id', type: 'VARCHAR(10)', key: 'FK', ref: 'projects', note: 'PROJECT — BILLS_FOR — INVOICE' },
    ],
  },
  {
    name: 'payments', entity: 'PAYMENT', key: 'payments', description: 'Money received against an invoice. Partial payments allowed.',
    columns: [
      { name: 'payment_id', type: 'VARCHAR(10)', key: 'PK' },
      { name: 'invoice_id', type: 'VARCHAR(10)', key: 'FK', ref: 'invoices', note: 'INVOICE — PAID THROUGH — PAYMENT' },
      { name: 'payment_date', type: 'DATE' },
      { name: 'amount', type: 'NUMERIC(12,2)', note: 'CHECK (amount > 0); trigger blocks overpayment' },
      { name: 'payment_method', type: 'VARCHAR(20)', note: PAYMENT_METHODS.join(' / ') },
      { name: 'transaction_id', type: 'VARCHAR(60)' },
      { name: 'payment_status', type: 'VARCHAR(12)', note: PAYMENT_STATUSES.join(' / ') },
      { name: 'notes', type: 'TEXT', added: true },
    ],
  },
];

export interface Relationship { name: string; from: string; to: string; card: string; fk: string; onDelete: string }
export const RELATIONSHIPS: Relationship[] = [
  { name: 'MANAGES', from: 'users', to: 'clients', card: '1 : N', fk: 'clients.account_manager_id', onDelete: 'RESTRICT' },
  { name: 'MANAGES', from: 'users', to: 'projects', card: '1 : N', fk: 'projects.user_id', onDelete: 'RESTRICT' },
  { name: 'OWNS', from: 'clients', to: 'projects', card: '1 : N', fk: 'projects.client_id', onDelete: 'RESTRICT' },
  { name: 'RECEIVES', from: 'clients', to: 'invoices', card: '1 : N', fk: 'invoices.client_id', onDelete: 'RESTRICT' },
  { name: 'BILLS_FOR', from: 'projects', to: 'invoices', card: '1 : N', fk: 'invoices.project_id', onDelete: 'RESTRICT' },
  { name: 'CONTAINS', from: 'projects', to: 'tasks', card: '1 : N', fk: 'tasks.project_id', onDelete: 'CASCADE' },
  { name: 'ASSIGNED_TO', from: 'users', to: 'tasks', card: '1 : N', fk: 'tasks.assignee_id', onDelete: 'RESTRICT' },
  { name: 'RECORDS', from: 'tasks', to: 'work_sessions', card: '1 : N', fk: 'work_sessions.task_id', onDelete: 'CASCADE' },
  { name: 'LOGS', from: 'users', to: 'work_sessions', card: '1 : N', fk: 'work_sessions.user_id', onDelete: 'RESTRICT' },
  { name: 'PAID THROUGH', from: 'invoices', to: 'payments', card: '1 : N', fk: 'payments.invoice_id', onDelete: 'RESTRICT' },
  { name: 'MEMBER_OF', from: 'users', to: 'projects', card: 'M : N', fk: 'project_members(project_id, user_id)', onDelete: 'CASCADE' },
];

/* ---------------- Integrity checks ---------------- */
export interface Check { label: string; violations: number; detail: string }

export function integrityChecks(db: Database): Check[] {
  const ids = <T extends { id: string }>(r: T[]) => new Set(r.map((x) => x.id));
  const U = ids(db.users), C = ids(db.clients), P = ids(db.projects), T = ids(db.tasks), I = ids(db.invoices);
  const proj = new Map(db.projects.map((p) => [p.id, p]));
  const checks: Check[] = [
    { label: 'projects.client_id → clients', violations: db.projects.filter((p) => !C.has(p.clientId)).length, detail: 'Every project belongs to an existing client' },
    { label: 'projects.user_id → users', violations: db.projects.filter((p) => !U.has(p.managerId)).length, detail: 'Every project has an existing manager' },
    { label: 'project_members → users', violations: db.projects.reduce((n, p) => n + p.memberIds.filter((m) => !U.has(m)).length, 0), detail: 'Team members exist' },
    { label: 'tasks.project_id → projects', violations: db.tasks.filter((t) => !P.has(t.projectId)).length, detail: 'No orphan tasks' },
    { label: 'tasks.assignee_id → users', violations: db.tasks.filter((t) => t.assigneeId && !U.has(t.assigneeId)).length, detail: 'Assignees exist (NULL allowed)' },
    { label: 'work_sessions.task_id → tasks', violations: db.sessions.filter((s) => !T.has(s.taskId)).length, detail: 'No orphan sessions' },
    { label: 'work_sessions.user_id → users', violations: db.sessions.filter((s) => !U.has(s.userId)).length, detail: 'Who logged it exists' },
    { label: 'invoices.client_id / project_id', violations: db.invoices.filter((i) => !C.has(i.clientId) || !P.has(i.projectId) || proj.get(i.projectId)?.clientId !== i.clientId).length, detail: 'Invoice client matches its project’s client' },
    { label: 'payments.invoice_id → invoices', violations: db.payments.filter((p) => !I.has(p.invoiceId)).length, detail: 'No orphan payments' },
    { label: 'clients.account_manager_id → users', violations: db.clients.filter((c) => !U.has(c.accountManagerId)).length, detail: 'Account managers exist' },
    { label: 'CHECK end_time > start_time', violations: db.sessions.filter((s) => !(hoursBetween(s.start, s.end) > 0)).length, detail: 'Sessions have positive duration' },
    { label: 'CHECK deadline ≥ start_date', violations: db.projects.filter((p) => p.deadline < p.startDate).length + db.tasks.filter((t) => t.dueDate < t.startDate).length, detail: 'Projects and tasks' },
    {
      label: 'Σ payments ≤ invoice total', detail: 'No invoice is overpaid (Completed + Pending)',
      violations: db.invoices.filter((i) => db.payments.filter((p) => p.invoiceId === i.id && (p.status === 'Completed' || p.status === 'Pending')).reduce((s, p) => s + p.amount, 0) > invoiceTotals(i).total + 0.005).length,
    },
    { label: 'UNIQUE invoice_number', violations: db.invoices.length - new Set(db.invoices.map((i) => i.number)).size, detail: 'Invoice numbers are unique' },
    { label: 'UNIQUE users.email', violations: db.users.length - new Set(db.users.map((u) => u.email.toLowerCase())).size, detail: 'Emails are unique' },
  ];
  return checks;
}

/* ---------------- PostgreSQL export ---------------- */
const q = (v: unknown): string => {
  if (v === null || v === undefined || v === '') return 'NULL';
  if (typeof v === 'number') return String(v);
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  return `'${String(v).replace(/'/g, "''")}'`;
};
const list = (xs: readonly string[]) => xs.map((x) => `'${x}'`).join(', ');

export function postgresDDL(): string {
  return `-- =============================================================
-- NEXUS · Project Management & Client Billing System
-- PostgreSQL schema (matches the frontend data model)
-- =============================================================
DROP VIEW  IF EXISTS invoice_summary;
DROP TABLE IF EXISTS payments, invoice_items, invoices, work_sessions, tasks, project_members, projects, clients, users CASCADE;

CREATE TABLE users (
  user_id       VARCHAR(10)  PRIMARY KEY,
  full_name     VARCHAR(100) NOT NULL,
  email         VARCHAR(120) NOT NULL UNIQUE,
  phone_number  VARCHAR(20),
  account_type  VARCHAR(20)  NOT NULL CHECK (account_type IN (${list(ROLES)})),
  department    VARCHAR(60),
  status        VARCHAR(10)  NOT NULL DEFAULT 'Active' CHECK (status IN ('Active', 'Inactive')),
  joined_at     DATE         NOT NULL,
  client_id     VARCHAR(10)  -- FK added after clients exists
);

CREATE TABLE clients (
  client_id          VARCHAR(10)  PRIMARY KEY,
  company_name       VARCHAR(120) NOT NULL UNIQUE,
  client_name        VARCHAR(100) NOT NULL,
  email              VARCHAR(120) NOT NULL,
  phone_number       VARCHAR(20),
  street             VARCHAR(150),
  city               VARCHAR(60),
  state              VARCHAR(60),
  pincode            CHAR(6) CHECK (pincode ~ '^[0-9]{6}$'),
  country            VARCHAR(60)  DEFAULT 'India',
  gstin              CHAR(15) CHECK (gstin IS NULL OR gstin ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$'),
  status             VARCHAR(10)  NOT NULL CHECK (status IN ('Active', 'Prospect', 'Inactive')),
  created_at         DATE         NOT NULL DEFAULT CURRENT_DATE,
  account_manager_id VARCHAR(10)  NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT
);

ALTER TABLE users
  ADD CONSTRAINT fk_users_client FOREIGN KEY (client_id) REFERENCES clients(client_id) ON DELETE RESTRICT,
  ADD CONSTRAINT chk_client_login CHECK (account_type <> 'Client' OR client_id IS NOT NULL);

CREATE TABLE projects (
  project_id    VARCHAR(10)   PRIMARY KEY,
  project_name  VARCHAR(120)  NOT NULL,
  description   TEXT,
  start_date    DATE          NOT NULL,
  deadline      DATE          NOT NULL,
  status        VARCHAR(15)   NOT NULL CHECK (status IN (${list(PROJECT_STATUSES)})),
  priority      VARCHAR(10)   NOT NULL CHECK (priority IN (${list(PRIORITIES)})),
  budget        NUMERIC(12,2) NOT NULL CHECK (budget >= 0),
  billing_rate  NUMERIC(10,2) NOT NULL CHECK (billing_rate >= 0),
  created_at    DATE          NOT NULL DEFAULT CURRENT_DATE,
  user_id       VARCHAR(10)   NOT NULL REFERENCES users(user_id)     ON DELETE RESTRICT,  -- MANAGES
  client_id     VARCHAR(10)   NOT NULL REFERENCES clients(client_id) ON DELETE RESTRICT,  -- OWNS
  CONSTRAINT chk_project_dates CHECK (deadline >= start_date)
);

CREATE TABLE project_members (
  project_id VARCHAR(10) REFERENCES projects(project_id) ON DELETE CASCADE,
  user_id    VARCHAR(10) REFERENCES users(user_id)       ON DELETE CASCADE,
  PRIMARY KEY (project_id, user_id)
);

CREATE TABLE tasks (
  task_id          VARCHAR(10)  PRIMARY KEY,
  project_id       VARCHAR(10)  NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,  -- CONTAINS (weak entity)
  title            VARCHAR(120) NOT NULL,
  description      TEXT,
  assignee_id      VARCHAR(10)  REFERENCES users(user_id) ON DELETE RESTRICT,
  priority         VARCHAR(10)  NOT NULL CHECK (priority IN (${list(PRIORITIES)})),
  status           VARCHAR(15)  NOT NULL CHECK (status IN (${list(TASK_STATUSES)})),
  start_date       DATE         NOT NULL,
  due_date         DATE         NOT NULL,
  estimated_hours  NUMERIC(6,2) NOT NULL CHECK (estimated_hours >= 0),
  CONSTRAINT chk_task_dates CHECK (due_date >= start_date)
);

CREATE TABLE work_sessions (
  session_id       VARCHAR(10)   PRIMARY KEY,
  task_id          VARCHAR(10)   NOT NULL REFERENCES tasks(task_id) ON DELETE CASCADE,   -- RECORDS
  user_id          VARCHAR(10)   NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,  -- LOGS
  start_time       TIMESTAMPTZ   NOT NULL,
  end_time         TIMESTAMPTZ   NOT NULL,
  duration         NUMERIC GENERATED ALWAYS AS (ROUND(EXTRACT(EPOCH FROM (end_time - start_time)) / 3600, 2)) STORED,
  hourly_rate      NUMERIC(10,2) NOT NULL CHECK (hourly_rate >= 0),
  billable_status  BOOLEAN       NOT NULL DEFAULT TRUE,
  notes            TEXT,
  CONSTRAINT chk_session_time CHECK (end_time > start_time AND end_time - start_time <= INTERVAL '16 hours')
);

CREATE TABLE invoices (
  invoice_id      VARCHAR(10)  PRIMARY KEY,
  invoice_number  VARCHAR(20)  NOT NULL UNIQUE,
  invoice_date    DATE         NOT NULL,
  due_date        DATE         NOT NULL,
  discount_pct    NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (discount_pct BETWEEN 0 AND 100),
  tax_rate        NUMERIC(5,2) NOT NULL DEFAULT 18 CHECK (tax_rate IN (0, 5, 12, 18, 28)),
  invoice_status  VARCHAR(12)  NOT NULL CHECK (invoice_status IN ('Draft', 'Sent', 'Cancelled')),
  notes           TEXT,
  client_id       VARCHAR(10)  NOT NULL REFERENCES clients(client_id)   ON DELETE RESTRICT,  -- RECEIVES
  project_id      VARCHAR(10)  NOT NULL REFERENCES projects(project_id) ON DELETE RESTRICT,  -- BILLS_FOR
  CONSTRAINT chk_invoice_dates CHECK (due_date >= invoice_date)
);

CREATE TABLE invoice_items (
  item_id      VARCHAR(40)   PRIMARY KEY,
  invoice_id   VARCHAR(10)   NOT NULL REFERENCES invoices(invoice_id) ON DELETE CASCADE,
  description  VARCHAR(200)  NOT NULL,
  quantity     NUMERIC(10,2) NOT NULL CHECK (quantity > 0),
  unit_price   NUMERIC(12,2) NOT NULL CHECK (unit_price >= 0)
);

CREATE TABLE payments (
  payment_id      VARCHAR(10)   PRIMARY KEY,
  invoice_id      VARCHAR(10)   NOT NULL REFERENCES invoices(invoice_id) ON DELETE RESTRICT,  -- PAID THROUGH
  payment_date    DATE          NOT NULL,
  amount          NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  payment_method  VARCHAR(20)   NOT NULL CHECK (payment_method IN (${list(PAYMENT_METHODS)})),
  transaction_id  VARCHAR(60),
  payment_status  VARCHAR(12)   NOT NULL CHECK (payment_status IN (${list(PAYMENT_STATUSES)})),
  notes           TEXT
);

-- Derived invoice figures: same maths as the app (src/lib/selectors.ts)
CREATE VIEW invoice_summary AS
WITH t AS (
  SELECT i.invoice_id,
         ROUND(COALESCE(SUM(ii.quantity * ii.unit_price), 0), 2) AS subtotal,
         i.discount_pct, i.tax_rate, i.invoice_status, i.due_date
  FROM invoices i LEFT JOIN invoice_items ii ON ii.invoice_id = i.invoice_id
  GROUP BY i.invoice_id
), m AS (
  SELECT t.*, ROUND(subtotal - ROUND(subtotal * discount_pct / 100, 2), 2) AS taxable FROM t
), x AS (
  SELECT m.*, ROUND(taxable * tax_rate / 100, 2) AS tax_amount,
         ROUND(taxable + ROUND(taxable * tax_rate / 100, 2), 2) AS total_amount,
         COALESCE((SELECT SUM(amount) FROM payments p WHERE p.invoice_id = m.invoice_id AND p.payment_status = 'Completed'), 0)::NUMERIC(12,2) AS amount_paid
  FROM m
)
SELECT invoice_id, subtotal, taxable, tax_amount, total_amount, amount_paid,
       GREATEST(total_amount - amount_paid, 0) AS balance_due,
       CASE
         WHEN invoice_status IN ('Draft', 'Cancelled')   THEN invoice_status
         WHEN total_amount - amount_paid <= 0.005         THEN 'Paid'
         WHEN due_date < CURRENT_DATE                     THEN 'Overdue'
         WHEN amount_paid > 0                             THEN 'Partially Paid'
         ELSE 'Sent'
       END AS derived_status
FROM x;

-- Trigger: block payments that would exceed the invoice total (like Exp 6)
CREATE OR REPLACE FUNCTION check_payment_limit() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  inv_total NUMERIC;
  committed NUMERIC;
BEGIN
  IF NEW.payment_status NOT IN ('Completed', 'Pending') THEN RETURN NEW; END IF;
  SELECT total_amount INTO inv_total FROM invoice_summary WHERE invoice_id = NEW.invoice_id;
  SELECT COALESCE(SUM(amount), 0) INTO committed FROM payments
   WHERE invoice_id = NEW.invoice_id AND payment_id <> NEW.payment_id
     AND payment_status IN ('Completed', 'Pending');
  IF committed + NEW.amount > inv_total + 0.005 THEN
    RAISE EXCEPTION 'Payment of % exceeds remaining balance % on invoice %', NEW.amount, inv_total - committed, NEW.invoice_id;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_payment_limit
BEFORE INSERT OR UPDATE ON payments
FOR EACH ROW EXECUTE FUNCTION check_payment_limit();
`;
}

export function postgresInserts(db: Database, settings: Settings): string {
  const out: string[] = [`-- Data exported from NEXUS on ${new Date().toISOString()} (${settings.workspaceName})`, 'BEGIN;', ''];
  // users ↔ clients reference each other: staff first, then clients, then client logins
  const userRow = (u: (typeof db.users)[number]) =>
    `INSERT INTO users (user_id, full_name, email, phone_number, account_type, department, status, joined_at, client_id) VALUES (${[u.id, u.fullName, u.email, u.phone, u.role, u.department, u.status, u.joinedAt, u.clientId].map(q).join(', ')});`;
  for (const u of db.users) if (u.role !== 'Client') out.push(userRow(u));
  out.push('');
  for (const c of db.clients) out.push(`INSERT INTO clients VALUES (${[c.id, c.companyName, c.contactPerson, c.email, c.phone, c.street, c.city, c.state, c.pincode, c.country, c.gstin, c.status, c.createdAt, c.accountManagerId].map(q).join(', ')});`);
  out.push('');
  for (const u of db.users) if (u.role === 'Client') out.push(userRow(u));
  out.push('');
  for (const p of db.projects) out.push(`INSERT INTO projects VALUES (${[p.id, p.name, p.description, p.startDate, p.deadline, p.status, p.priority, p.budget, p.billingRate, p.createdAt, p.managerId, p.clientId].map(q).join(', ')});`);
  for (const p of db.projects) for (const m of p.memberIds) out.push(`INSERT INTO project_members VALUES (${q(p.id)}, ${q(m)});`);
  out.push('');
  for (const t of db.tasks) out.push(`INSERT INTO tasks VALUES (${[t.id, t.projectId, t.title, t.description, t.assigneeId, t.priority, t.status, t.startDate, t.dueDate, t.estimatedHours].map(q).join(', ')});`);
  out.push('');
  for (const s of db.sessions) out.push(`INSERT INTO work_sessions (session_id, task_id, user_id, start_time, end_time, hourly_rate, billable_status, notes) VALUES (${[s.id, s.taskId, s.userId, s.start, s.end, s.hourlyRate, s.billable, s.notes].map(q).join(', ')});`);
  out.push('');
  for (const i of db.invoices) {
    out.push(`INSERT INTO invoices VALUES (${[i.id, i.number, i.issueDate, i.dueDate, i.discountPct, i.taxRate, i.state, i.notes, i.clientId, i.projectId].map(q).join(', ')});`);
    for (const li of i.lineItems) out.push(`INSERT INTO invoice_items VALUES (${[li.id, i.id, li.description, round2(li.quantity), round2(li.unitPrice)].map(q).join(', ')});`);
  }
  out.push('');
  for (const p of db.payments) out.push(`INSERT INTO payments VALUES (${[p.id, p.invoiceId, p.date, p.amount, p.method, p.reference, p.status, p.notes].map(q).join(', ')});`);
  out.push('', 'COMMIT;', '', '-- Try: SELECT * FROM invoice_summary ORDER BY invoice_id;');
  return out.join('\n');
}
