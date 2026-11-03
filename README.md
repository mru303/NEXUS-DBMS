# NEXUS — Projects, People & Payments

Frontend for the DBMS mini-project **Project Management and Client Billing System**
(K. J. Somaiya School of Engineering · Dept. of EXTC · CCE · Semester IV).

It manages the seven entities from Experiments 1 & 2 — `users`, `clients`, `projects`,
`tasks`, `work_sessions`, `invoices`, `payments` — with working CRUD, relationships
and integrity rules, and can export its data as a PostgreSQL script for pgAdmin 4.

---

## Run locally

Requires Node.js 18+, Homebrew PostgreSQL 16, and npm dependencies. The ignored `.env` file configures this Mac's local database; copy `.env.example` and set `PGUSER` to your macOS username on another machine.

One-time database setup:

```bash
brew services start postgresql@16
npm run db:migrate
npm run db:seed
```

Start the application:

```bash
npm install
npm run dev:full
```

Open **http://localhost:5173**. The API runs at **http://localhost:3001**. The frontend and backend can also be started separately with `npm run dev` and `npm run server`.

Useful checks: `npm test`, `npm run typecheck`, and `npm run build`. Database setup uses `npm run db:migrate`; `npm run db:seed` inserts the fictional starter dataset without deleting existing rows.

---

## Demo script (for the viva)

1. **Overview**: KPIs and charts are calculated from the tables, so nothing is hard-coded. Change the date range.
2. **Profile menu → “Demo · view the app as”**: switch between Administrator, Project Manager,
   Employee, Client and Finance Staff. The navigation, the data you can see and the allowed actions all change.
   The Client login only sees its own company's rows.
3. **Invoices → Create invoice**: add line items. Subtotal, discount and GST are calculated as you type
   (CGST + SGST for Maharashtra clients, IGST for other states).
4. **Record a partial payment**. The invoice's paid amount, balance and status update automatically.
   Paying more than the balance is blocked.
5. **Time Tracking**: start the timer, move to another page, then come back. It's still running, and it
   survives a refresh too. Stopping it creates a `work_sessions` row.
6. **Try to delete a client that has projects**. The delete is blocked (ON DELETE RESTRICT).
   Deleting a project removes its tasks and sessions (ON DELETE CASCADE, because they are weak entities).
7. **Settings → Database overview**: the ER map with live row counts, column/key details, the relationship
   list, a live integrity checker, and **Export to PostgreSQL**.

---

## Features

- **App shell**: collapsible sidebar (a drawer on mobile), breadcrumbs, global search (`Ctrl/⌘ + K` or `/`),
  a notifications menu, a light/dark theme toggle (light by default), a profile menu with a role switcher,
  and a running-timer indicator. Each page has its own primary action button (New project, Create invoice…).
- **Overview**: 6 KPI cards with previous-period comparisons, a revenue chart (collected vs invoiced),
  project status distribution, projects in flight, upcoming deadlines, an outstanding-invoice ageing summary
  and an activity feed. Employees and clients see their own versions.
- **Projects**: search, filters (status, client, manager, deadline), sorting, table and card views, and
  pagination. The detail page has tabs for overview, tasks, work sessions, invoices & payments, and activity.
- **Tasks**: grouped list view, plus a Kanban board with drag-and-drop and a status dropdown fallback.
  Overdue tasks are highlighted. The task drawer shows its work sessions.
- **Time Tracking**: a start/stop timer that persists, manual entries, team week stats, and a
  billable/non-billable chart. The session history can be filtered, edited, deleted and exported as CSV.
- **Clients**: card and table views. The detail page shows contact and GST info, projects, billed/paid/outstanding
  totals, invoice history, payments and activity.
- **Invoices**: summary cards, status tabs, and a dynamic line-item editor. You can add lines straight from
  logged billable hours. Indian FY numbering looks like `NX/26-27/0001`. The printable GST invoice includes
  the amount in words, and you can print it or save it as a PDF.
- **Payments**: a ledger with filters for method, status, client and date range. It records partial payments,
  shows pending cheques and failed attempts, and breaks totals down by method.
- **Team**: user CRUD, activate/deactivate, and a role-permission matrix with “View as” buttons.
- **Reports**: revenue by period, outstanding by age, budget vs actual, billable vs non-billable hours,
  employee workload, project completion and payment methods. Every chart has a table view and CSV export.
- **Settings**: workspace, company & GST, billing defaults, notifications, theme, profile, database
  overview, and JSON backup export.

## How the data layer works

| Concern | Where |
|---|---|
| Table types (one interface per relation) | `src/data/types.ts` |
| API mutations and refreshed workspace state | `src/data/store.ts` |
| Derived values, like SQL views (totals, balance, status, progress) | `src/lib/selectors.ts` |
| Seed data (relative to the day you first open the app) | `src/data/seed.ts` |
| Schema metadata, integrity checks, PostgreSQL export | `src/data/schema.ts` |
| Role permissions (UI only) | `src/lib/permissions.ts` |

Invoice **status** is never stored as Paid/Overdue. Only `Draft / Sent / Cancelled` is stored;
`Paid`, `Partially Paid` and `Overdue` are derived from payments and the due date, so they can't get out
of sync. The exported SQL has an `invoice_summary` VIEW with the same logic and a trigger that blocks
overpayments. Both were tested on PostgreSQL 16, and the view's totals match the app exactly.

### Differences from the Exp 2 relational model (worth mentioning in the viva)

- `work_sessions.user_id` was **added**. Exp 2 has no way to know who logged a session.
- `tasks.payment_id` (TASK — DEPENDS_ON — PAYMENT) was **dropped**. A task doesn't depend on a payment;
  billing goes through `projects → invoices → payments`.
- TASK and WORK_SESSION use **surrogate keys** (`task_id`, `session_id`) instead of the composite weak-entity
  keys. The weak-entity behaviour is kept through `ON DELETE CASCADE`.
- `invoice_items` and `project_members` were added: line items, and the M:N team relationship.
- `total_amount` / `tax_amount` are **computed** (in the view), not stored.

## Boundaries

- PostgreSQL is the source of truth for application records and workspace settings. Browser storage is used for UI preferences and the current timer draft.
- **No login or passwords.** The role switcher is a demo. The role checks only hide UI; a public deployment needs server-side authentication and authorization.
- **“Mark as sent” doesn't send email.** It only changes the invoice status. Notifications are generated
  from the data; no email or SMS is sent.
- **No payment gateway.** Payments are recorded manually.
- **PDF export** uses the browser's *Print → Save as PDF*.
- All companies, people, GSTINs, bank details and amounts are fictional.

## Look & feel

Deliberately plain: warm neutral greys, black primary buttons, one blue accent for links, focus rings and
chart lines, statuses as text with a small coloured dot, and summary figures in a single strip rather than
separate cards. Typeface: IBM Plex Sans from Google Fonts (falls back to the system font offline).

## Tech stack

React 19 + TypeScript, Tailwind CSS v4, Lucide icons (`react-icons/lu`), SVG charts built on `d3-scale` /
`d3-shape`, Zod form validation, and esbuild for bundling. Routing uses a small built-in hash router, so the
built file works from disk; state uses a small store on `useSyncExternalStore`.
