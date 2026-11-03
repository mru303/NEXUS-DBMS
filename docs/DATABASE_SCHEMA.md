# Database Schema

The database is implemented in [server/migrations/001_init.sql](../server/migrations/001_init.sql) and is designed to match the NEXUS domain model.

## Tables

### users
- user_id: VARCHAR(10) PK
- full_name: VARCHAR(100) NOT NULL
- email: VARCHAR(120) NOT NULL UNIQUE
- phone_number: VARCHAR(20)
- account_type: VARCHAR(20) CHECK IN ('Administrator', 'Project Manager', 'Employee', 'Client', 'Finance Staff')
- department: VARCHAR(60)
- status: VARCHAR(10) CHECK IN ('Active', 'Inactive')
- joined_at: DATE NOT NULL
- client_id: VARCHAR(10) FK -> clients(client_id)

### clients
- client_id: VARCHAR(10) PK
- company_name: VARCHAR(120) NOT NULL UNIQUE
- client_name: VARCHAR(100) NOT NULL
- email: VARCHAR(120) NOT NULL
- phone_number: VARCHAR(20)
- street: VARCHAR(150)
- city: VARCHAR(60)
- state: VARCHAR(60)
- pincode: CHAR(6)
- country: VARCHAR(60) DEFAULT 'India'
- gstin: CHAR(15)
- status: VARCHAR(10) CHECK IN ('Active', 'Prospect', 'Inactive')
- created_at: DATE NOT NULL
- account_manager_id: VARCHAR(10) FK -> users(user_id)

### projects
- project_id: VARCHAR(10) PK
- project_name: VARCHAR(120) NOT NULL
- description: TEXT
- start_date: DATE NOT NULL
- deadline: DATE NOT NULL
- status: VARCHAR(15)
- priority: VARCHAR(10)
- budget: NUMERIC(12,2)
- billing_rate: NUMERIC(10,2)
- created_at: DATE NOT NULL
- user_id: VARCHAR(10) FK -> users(user_id)
- client_id: VARCHAR(10) FK -> clients(client_id)

### project_members
- project_id: VARCHAR(10) FK -> projects(project_id)
- user_id: VARCHAR(10) FK -> users(user_id)
- Primary key: (project_id, user_id)

### tasks
- task_id: VARCHAR(10) PK
- project_id: VARCHAR(10) FK -> projects(project_id)
- title: VARCHAR(120) NOT NULL
- description: TEXT
- assignee_id: VARCHAR(10) FK -> users(user_id)
- priority: VARCHAR(10)
- status: VARCHAR(15)
- start_date: DATE NOT NULL
- due_date: DATE NOT NULL
- estimated_hours: NUMERIC(6,2)

### work_sessions
- session_id: VARCHAR(10) PK
- task_id: VARCHAR(10) FK -> tasks(task_id)
- user_id: VARCHAR(10) FK -> users(user_id)
- start_time: TIMESTAMPTZ NOT NULL
- end_time: TIMESTAMPTZ NOT NULL
- duration: NUMERIC GENERATED ALWAYS AS (...) STORED
- hourly_rate: NUMERIC(10,2)
- billable_status: BOOLEAN
- notes: TEXT

### invoices
- invoice_id: VARCHAR(10) PK
- invoice_number: VARCHAR(20) NOT NULL UNIQUE
- invoice_date: DATE NOT NULL
- due_date: DATE NOT NULL
- discount_pct: NUMERIC(5,2)
- tax_rate: NUMERIC(5,2)
- invoice_status: VARCHAR(12) CHECK IN ('Draft', 'Sent', 'Cancelled')
- notes: TEXT
- client_id: VARCHAR(10) FK -> clients(client_id)
- project_id: VARCHAR(10) FK -> projects(project_id)

### invoice_items
- item_id: VARCHAR(40) PK
- invoice_id: VARCHAR(10) FK -> invoices(invoice_id)
- description: VARCHAR(200) NOT NULL
- quantity: NUMERIC(10,2)
- unit_price: NUMERIC(12,2)

### payments
- payment_id: VARCHAR(10) PK
- invoice_id: VARCHAR(10) FK -> invoices(invoice_id)
- payment_date: DATE NOT NULL
- amount: NUMERIC(12,2)
- payment_method: VARCHAR(20)
- transaction_id: VARCHAR(60)
- payment_status: VARCHAR(12)
- notes: TEXT

## Key constraints and indexes

- Primary keys on every table.
- Foreign keys enforce referential integrity.
- CHECK constraints prevent negative budgets, invalid invoice values, and impossible task/project dates.
- The schema includes `invoice_summary` and a trigger `trg_payment_limit` to prevent overpayment.
- Frequently used foreign keys and unique values are indexed by PostgreSQL automatically for PK/UNIQUE constraints.
