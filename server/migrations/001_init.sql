BEGIN;

CREATE TABLE IF NOT EXISTS users (
  user_id VARCHAR(10) PRIMARY KEY,
  full_name VARCHAR(100) NOT NULL,
  email VARCHAR(120) NOT NULL UNIQUE,
  phone_number VARCHAR(20),
  account_type VARCHAR(20) NOT NULL CHECK (account_type IN ('Administrator', 'Project Manager', 'Employee', 'Client', 'Finance Staff')),
  department VARCHAR(60),
  status VARCHAR(10) NOT NULL DEFAULT 'Active' CHECK (status IN ('Active', 'Inactive')),
  joined_at DATE NOT NULL,
  client_id VARCHAR(10)
);

CREATE TABLE IF NOT EXISTS clients (
  client_id VARCHAR(10) PRIMARY KEY,
  company_name VARCHAR(120) NOT NULL UNIQUE,
  client_name VARCHAR(100) NOT NULL,
  email VARCHAR(120) NOT NULL,
  phone_number VARCHAR(20),
  street VARCHAR(150),
  city VARCHAR(60),
  state VARCHAR(60),
  pincode CHAR(6) CHECK (pincode IS NULL OR pincode ~ '^[0-9]{6}$'),
  country VARCHAR(60) DEFAULT 'India',
  gstin CHAR(15) CHECK (gstin IS NULL OR gstin ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$'),
  status VARCHAR(10) NOT NULL CHECK (status IN ('Active', 'Prospect', 'Inactive')),
  created_at DATE NOT NULL DEFAULT CURRENT_DATE,
  account_manager_id VARCHAR(10) NOT NULL
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_users_client') THEN
    ALTER TABLE users ADD CONSTRAINT fk_users_client
      FOREIGN KEY (client_id) REFERENCES clients(client_id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_client_login') THEN
    ALTER TABLE users ADD CONSTRAINT chk_client_login
      CHECK (account_type <> 'Client' OR client_id IS NOT NULL);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_clients_manager') THEN
    ALTER TABLE clients ADD CONSTRAINT fk_clients_manager
      FOREIGN KEY (account_manager_id) REFERENCES users(user_id) ON DELETE RESTRICT;
  END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS projects (
  project_id VARCHAR(10) PRIMARY KEY,
  project_name VARCHAR(120) NOT NULL,
  description TEXT,
  start_date DATE NOT NULL,
  deadline DATE NOT NULL,
  status VARCHAR(15) NOT NULL CHECK (status IN ('Planning', 'In Progress', 'On Hold', 'Completed', 'Cancelled')),
  priority VARCHAR(10) NOT NULL CHECK (priority IN ('Low', 'Medium', 'High', 'Urgent')),
  budget NUMERIC(12,2) NOT NULL CHECK (budget >= 0),
  billing_rate NUMERIC(10,2) NOT NULL CHECK (billing_rate >= 0),
  created_at DATE NOT NULL DEFAULT CURRENT_DATE,
  user_id VARCHAR(10) NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
  client_id VARCHAR(10) NOT NULL REFERENCES clients(client_id) ON DELETE RESTRICT,
  CONSTRAINT chk_project_dates CHECK (deadline >= start_date)
);

CREATE TABLE IF NOT EXISTS project_members (
  project_id VARCHAR(10) NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
  user_id VARCHAR(10) NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  PRIMARY KEY (project_id, user_id)
);

CREATE TABLE IF NOT EXISTS tasks (
  task_id VARCHAR(10) PRIMARY KEY,
  project_id VARCHAR(10) NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
  title VARCHAR(120) NOT NULL,
  description TEXT,
  assignee_id VARCHAR(10) REFERENCES users(user_id) ON DELETE RESTRICT,
  priority VARCHAR(10) NOT NULL CHECK (priority IN ('Low', 'Medium', 'High', 'Urgent')),
  status VARCHAR(15) NOT NULL CHECK (status IN ('To Do', 'In Progress', 'In Review', 'Completed')),
  start_date DATE NOT NULL,
  due_date DATE NOT NULL,
  estimated_hours NUMERIC(6,2) NOT NULL CHECK (estimated_hours >= 0),
  CONSTRAINT chk_task_dates CHECK (due_date >= start_date)
);

CREATE TABLE IF NOT EXISTS work_sessions (
  session_id VARCHAR(10) PRIMARY KEY,
  task_id VARCHAR(10) NOT NULL REFERENCES tasks(task_id) ON DELETE CASCADE,
  user_id VARCHAR(10) NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,
  duration NUMERIC GENERATED ALWAYS AS (ROUND(EXTRACT(EPOCH FROM (end_time - start_time)) / 3600, 2)) STORED,
  hourly_rate NUMERIC(10,2) NOT NULL CHECK (hourly_rate >= 0),
  billable_status BOOLEAN NOT NULL DEFAULT TRUE,
  notes TEXT,
  CONSTRAINT chk_session_time CHECK (end_time > start_time AND end_time - start_time <= INTERVAL '16 hours')
);

CREATE TABLE IF NOT EXISTS invoices (
  invoice_id VARCHAR(10) PRIMARY KEY,
  invoice_number VARCHAR(20) NOT NULL UNIQUE,
  invoice_date DATE NOT NULL,
  due_date DATE NOT NULL,
  discount_pct NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (discount_pct BETWEEN 0 AND 100),
  tax_rate NUMERIC(5,2) NOT NULL DEFAULT 18 CHECK (tax_rate IN (0, 5, 12, 18, 28)),
  invoice_status VARCHAR(12) NOT NULL CHECK (invoice_status IN ('Draft', 'Sent', 'Cancelled')),
  notes TEXT,
  client_id VARCHAR(10) NOT NULL REFERENCES clients(client_id) ON DELETE RESTRICT,
  project_id VARCHAR(10) NOT NULL REFERENCES projects(project_id) ON DELETE RESTRICT,
  CONSTRAINT chk_invoice_dates CHECK (due_date >= invoice_date)
);

CREATE TABLE IF NOT EXISTS invoice_items (
  item_id VARCHAR(40) PRIMARY KEY,
  invoice_id VARCHAR(10) NOT NULL REFERENCES invoices(invoice_id) ON DELETE CASCADE,
  description VARCHAR(200) NOT NULL,
  quantity NUMERIC(10,2) NOT NULL CHECK (quantity > 0),
  unit_price NUMERIC(12,2) NOT NULL CHECK (unit_price >= 0)
);

CREATE TABLE IF NOT EXISTS payments (
  payment_id VARCHAR(10) PRIMARY KEY,
  invoice_id VARCHAR(10) NOT NULL REFERENCES invoices(invoice_id) ON DELETE RESTRICT,
  payment_date DATE NOT NULL,
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  payment_method VARCHAR(20) NOT NULL CHECK (payment_method IN ('UPI', 'Bank Transfer', 'Credit/Debit Card', 'Cash', 'Cheque')),
  transaction_id VARCHAR(60),
  payment_status VARCHAR(12) NOT NULL CHECK (payment_status IN ('Completed', 'Pending', 'Failed', 'Refunded')),
  notes TEXT
);

CREATE TABLE IF NOT EXISTS workspace_settings (
  settings_id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (settings_id = 1),
  settings_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE VIEW invoice_summary AS
WITH t AS (
  SELECT i.invoice_id,
         ROUND(COALESCE(SUM(ii.quantity * ii.unit_price), 0), 2) AS subtotal,
         i.discount_pct, i.tax_rate, i.invoice_status, i.due_date
  FROM invoices i
  LEFT JOIN invoice_items ii ON ii.invoice_id = i.invoice_id
  GROUP BY i.invoice_id, i.discount_pct, i.tax_rate, i.invoice_status, i.due_date
),
m AS (
  SELECT t.*, ROUND(subtotal - ROUND(subtotal * discount_pct / 100, 2), 2) AS taxable
  FROM t
),
x AS (
  SELECT m.*, ROUND(taxable * tax_rate / 100, 2) AS tax_amount,
         ROUND(taxable + ROUND(taxable * tax_rate / 100, 2), 2) AS total_amount,
         COALESCE((SELECT SUM(amount) FROM payments p WHERE p.invoice_id = m.invoice_id AND p.payment_status = 'Completed'), 0)::NUMERIC(12,2) AS amount_paid
  FROM m
)
SELECT invoice_id, subtotal, taxable, tax_amount, total_amount, amount_paid,
       GREATEST(total_amount - amount_paid, 0) AS balance_due,
       CASE
         WHEN invoice_status IN ('Draft', 'Cancelled') THEN invoice_status
         WHEN total_amount - amount_paid <= 0.005 THEN 'Paid'
         WHEN due_date < CURRENT_DATE THEN 'Overdue'
         WHEN amount_paid > 0 THEN 'Partially Paid'
         ELSE 'Sent'
      END AS derived_status,
      COALESCE((SELECT SUM(amount) FROM payments p WHERE p.invoice_id = x.invoice_id AND p.payment_status IN ('Completed', 'Pending')), 0)::NUMERIC(12,2) AS amount_committed
FROM x;

CREATE OR REPLACE FUNCTION check_payment_limit() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  inv_total NUMERIC;
  committed NUMERIC;
BEGIN
  IF NEW.payment_status NOT IN ('Completed', 'Pending') THEN
    RETURN NEW;
  END IF;

  SELECT total_amount INTO inv_total FROM invoice_summary WHERE invoice_id = NEW.invoice_id;
  SELECT COALESCE(SUM(amount), 0) INTO committed FROM payments
  WHERE invoice_id = NEW.invoice_id
    AND payment_id <> NEW.payment_id
    AND payment_status IN ('Completed', 'Pending');

  IF committed + NEW.amount > inv_total + 0.005 THEN
    RAISE EXCEPTION 'Payment exceeds invoice balance';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_payment_limit ON payments;
CREATE TRIGGER trg_payment_limit
BEFORE INSERT OR UPDATE ON payments
FOR EACH ROW EXECUTE FUNCTION check_payment_limit();

COMMIT;
