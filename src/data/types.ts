/* ------------------------------------------------------------------
   Domain model — one interface per table of the relational schema
   (Exp 2: users, clients, projects, tasks, work_sessions, invoices,
   payments). Foreign keys are plain ID strings, exactly as they would
   arrive from a REST API backed by PostgreSQL.

   Derived values (task logged hours, project progress, invoice totals,
   amount paid, balance, invoice status) are NOT stored — they are
   computed in src/lib/selectors.ts, the way a SQL VIEW would compute them.
------------------------------------------------------------------- */

export type ID = string;
/** Calendar date, local, `YYYY-MM-DD` */
export type ISODate = string;
/** Timestamp, ISO-8601 */
export type ISODateTime = string;

export const ROLES = ['Administrator', 'Project Manager', 'Employee', 'Client', 'Finance Staff'] as const;
export type Role = (typeof ROLES)[number];

export interface User {
  id: ID; // users.user_id (PK)
  fullName: string;
  email: string;
  phone: string;
  role: Role; // users.account_type
  department: string;
  status: 'Active' | 'Inactive';
  joinedAt: ISODate;
  /** Only for role = Client: which client company this login belongs to */
  clientId?: ID; // FK → clients
}

export const CLIENT_STATUSES = ['Active', 'Prospect', 'Inactive'] as const;
export type ClientStatus = (typeof CLIENT_STATUSES)[number];

export interface Client {
  id: ID; // clients.client_id (PK)
  companyName: string;
  contactPerson: string; // clients.client_name
  email: string;
  phone: string;
  street: string;
  city: string;
  state: string;
  pincode: string;
  country: string;
  gstin: string;
  status: ClientStatus;
  createdAt: ISODate;
  accountManagerId: ID; // FK → users  (USER — MANAGES — CLIENT)
}

export const PROJECT_STATUSES = ['Planning', 'In Progress', 'On Hold', 'Completed', 'Cancelled'] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];
export const PRIORITIES = ['Low', 'Medium', 'High', 'Urgent'] as const;
export type Priority = (typeof PRIORITIES)[number];

export interface Project {
  id: ID; // projects.project_id (PK)
  name: string;
  clientId: ID; // FK → clients   (CLIENT — OWNS — PROJECT)
  description: string;
  managerId: ID; // FK → users     (USER — MANAGES — PROJECT)
  memberIds: ID[]; // project_members(project_id, user_id) junction table
  startDate: ISODate;
  deadline: ISODate;
  budget: number;
  billingRate: number; // ₹ per hour
  status: ProjectStatus;
  priority: Priority;
  createdAt: ISODate;
}

export const TASK_STATUSES = ['To Do', 'In Progress', 'In Review', 'Completed'] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export interface Task {
  id: ID; // tasks.task_id (PK)
  projectId: ID; // FK → projects  (PROJECT — CONTAINS — TASK)
  title: string;
  description: string;
  assigneeId: ID | null; // FK → users
  priority: Priority;
  status: TaskStatus;
  startDate: ISODate;
  dueDate: ISODate;
  estimatedHours: number;
}

export interface WorkSession {
  id: ID; // work_sessions.session_id (PK)
  taskId: ID; // FK → tasks   (TASK — RECORDS — WORK SESSION); project is reached through the task
  userId: ID; // FK → users   (USER — LOGS — WORK SESSION)
  start: ISODateTime;
  end: ISODateTime;
  hourlyRate: number;
  billable: boolean;
  notes: string;
}

export const INVOICE_STATES = ['Draft', 'Sent', 'Cancelled'] as const;
/** What the user sets. Paid / Partially Paid / Overdue are derived from payments + dates. */
export type InvoiceState = (typeof INVOICE_STATES)[number];
export const INVOICE_STATUSES = ['Draft', 'Sent', 'Partially Paid', 'Paid', 'Overdue', 'Cancelled'] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

export interface LineItem {
  id: ID;
  description: string;
  quantity: number;
  unitPrice: number;
}

export interface Invoice {
  id: ID; // invoices.invoice_id (PK)
  number: string; // human invoice number, unique
  clientId: ID; // FK → clients   (CLIENT — RECEIVES — INVOICE)
  projectId: ID; // FK → projects (PROJECT — BILLS_FOR — INVOICE)
  issueDate: ISODate;
  dueDate: ISODate;
  lineItems: LineItem[]; // invoice_items child table
  discountPct: number;
  taxRate: number; // GST %
  state: InvoiceState;
  notes: string;
  sentAt?: ISODate;
}

export const PAYMENT_METHODS = ['UPI', 'Bank Transfer', 'Credit/Debit Card', 'Cash', 'Cheque'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];
export const PAYMENT_STATUSES = ['Completed', 'Pending', 'Failed', 'Refunded'] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export interface Payment {
  id: ID; // payments.payment_id (PK)
  invoiceId: ID; // FK → invoices (INVOICE — PAID THROUGH — PAYMENT); client is reached through the invoice
  date: ISODate;
  amount: number;
  method: PaymentMethod;
  reference: string; // payments.transaction_id
  status: PaymentStatus;
  notes: string;
}

export interface Database {
  users: User[];
  clients: Client[];
  projects: Project[];
  tasks: Task[];
  sessions: WorkSession[];
  invoices: Invoice[];
  payments: Payment[];
}

export type EntityKind = 'user' | 'client' | 'project' | 'task' | 'session' | 'invoice' | 'payment';

export interface ActivityEntry {
  id: ID;
  at: ISODateTime;
  actorId: ID | null;
  entity: EntityKind;
  entityId: ID;
  /** Related project/client so detail pages can show their own timeline */
  projectId?: ID;
  clientId?: ID;
  action: 'created' | 'updated' | 'deleted' | 'status' | 'payment' | 'sent' | 'completed';
  message: string;
}

export interface Settings {
  workspaceName: string;
  companyName: string;
  companyAddress: string;
  companyEmail: string;
  companyPhone: string;
  companyGstin: string;
  companyPan: string;
  bankName: string;
  bankAccount: string;
  bankIfsc: string;
  upiId: string;
  currency: 'INR';
  defaultTaxRate: number;
  invoicePrefix: string;
  paymentTermsDays: number;
  invoiceFooter: string;
  notifyOverdueInvoices: boolean;
  notifyTaskDeadlines: boolean;
  notifyPayments: boolean;
  theme: 'dark' | 'light' | 'system';
  density: 'comfortable' | 'compact';
  /** Set once the simplified light-first UI has been applied */
  uiV2?: boolean;
}

export interface TimerState {
  running: boolean;
  startedAt: ISODateTime | null;
  taskId: ID | null;
  userId: ID | null;
  notes: string;
  billable: boolean;
}

export interface AppState {
  version: number;
  seededAt: ISODateTime;
  db: Database;
  settings: Settings;
  currentUserId: ID;
  timer: TimerState;
  activity: ActivityEntry[];
  readNotificationIds: string[];
}
