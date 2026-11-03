import dotenv from 'dotenv';
import { pool } from '../config/database.js';

dotenv.config();

const seedData = async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const users = [
      ['USR-001', 'Alex Mehta', 'alex.mehta@nexus.com', '9999000001', 'Administrator', 'Management', 'Active', '2024-01-15', null],
      ['USR-002', 'Priya Nair', 'priya.nair@nexus.com', '9999000002', 'Project Manager', 'Delivery', 'Active', '2024-01-18', null],
      ['USR-003', 'Arjun Kulkarni', 'arjun.kulkarni@nexus.com', '9999000003', 'Project Manager', 'Delivery', 'Active', '2024-02-02', null],
      ['USR-004', 'Rohan Deshpande', 'rohan.deshpande@nexus.com', '9999000004', 'Employee', 'Frontend Engineering', 'Active', '2024-02-10', null],
      ['USR-005', 'Sneha Iyer', 'sneha.iyer@nexus.com', '9999000005', 'Employee', 'Backend Engineering', 'Active', '2024-02-12', null],
      ['USR-006', 'Kabir Shah', 'kabir.shah@nexus.com', '9999000006', 'Employee', 'Product Design', 'Active', '2024-02-20', null],
      ['USR-007', 'Ananya Rao', 'ananya.rao@nexus.com', '9999000007', 'Employee', 'Quality Assurance', 'Active', '2024-03-04', null],
      ['USR-008', 'Kavya Menon', 'kavya.menon@nexus.com', '9999000008', 'Finance Staff', 'Finance & Accounts', 'Active', '2024-01-20', null],
      ['USR-009', 'Vikram Joshi', 'vikram.joshi@nexus.com', '9999000009', 'Employee', 'Data Engineering', 'Inactive', '2024-03-18', null],
    ];

    for (const row of users) {
      await client.query(
        `INSERT INTO users (user_id, full_name, email, phone_number, account_type, department, status, joined_at, client_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (user_id) DO NOTHING`,
        row,
      );
    }

    const clients = [
      ['CLT-001', 'Saffron Leaf Organics', 'Neha Kapoor', 'neha@saffronleaf.com', '9820001001', '14 Orchard Lane', 'Mumbai', 'Maharashtra', '400001', 'India', '27ABCDE1234F1Z5', 'Active', '2024-01-05', 'USR-001'],
      ['CLT-002', 'Northstar Labs', 'Nitin Gokhale', 'nitin@northstarlabs.in', '9820001002', '82 Horizon Road', 'Pune', 'Maharashtra', '411001', 'India', '27ABCDE5678F1Z5', 'Active', '2024-01-08', 'USR-002'],
      ['CLT-003', 'Asteria Mobility', 'Mira Iyer', 'mira@asteriamobility.com', '9820001003', '5 Regal Avenue', 'Bengaluru', 'Karnataka', '560001', 'India', '29ABCDE2345F1Z5', 'Active', '2024-01-11', 'USR-003'],
    ];

    for (const row of clients) {
      await client.query(
        `INSERT INTO clients (client_id, company_name, client_name, email, phone_number, street, city, state, pincode, country, gstin, status, created_at, account_manager_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
         ON CONFLICT (client_id) DO NOTHING`,
        row,
      );
    }

    await client.query(
      `INSERT INTO users (user_id, full_name, email, phone_number, account_type, department, status, joined_at, client_id)
       VALUES ('USR-010', 'Neha Kapoor', 'neha.kapoor@nexus.com', '9999000010', 'Client', 'Client — Saffron Leaf Organics', 'Active', '2024-03-22', 'CLT-001')
       ON CONFLICT (user_id) DO NOTHING`,
    );

    const projects = [
      ['PRJ-001', 'Saffron Leaf Brand Refresh', 'Brand identity and packaging redesign project', '2024-01-02', '2024-09-15', 'Completed', 'Medium', 140000, 1500, '2024-01-15', 'USR-002', 'CLT-001'],
      ['PRJ-002', 'Northstar Reporting Suite', 'Executive dashboard and KPI reporting platform', '2024-02-12', '2024-11-28', 'In Progress', 'High', 240000, 2000, '2024-02-20', 'USR-003', 'CLT-002'],
      ['PRJ-003', 'Asteria Mobility Pilot', 'Mobile app pilot with analytics and support desk', '2024-03-01', '2024-08-22', 'Planning', 'High', 180000, 1800, '2024-03-10', 'USR-003', 'CLT-003'],
    ];

    for (const row of projects) {
      await client.query(
        `INSERT INTO projects (project_id, project_name, description, start_date, deadline, status, priority, budget, billing_rate, created_at, user_id, client_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
         ON CONFLICT (project_id) DO NOTHING`,
        row,
      );
    }

    await client.query(`INSERT INTO project_members (project_id, user_id) VALUES ('PRJ-001', 'USR-004') ON CONFLICT DO NOTHING`);
    await client.query(`INSERT INTO project_members (project_id, user_id) VALUES ('PRJ-001', 'USR-006') ON CONFLICT DO NOTHING`);
    await client.query(`INSERT INTO project_members (project_id, user_id) VALUES ('PRJ-002', 'USR-005') ON CONFLICT DO NOTHING`);
    await client.query(`INSERT INTO project_members (project_id, user_id) VALUES ('PRJ-002', 'USR-007') ON CONFLICT DO NOTHING`);
    await client.query(`INSERT INTO project_members (project_id, user_id) VALUES ('PRJ-003', 'USR-004') ON CONFLICT DO NOTHING`);

    const tasks = [
      ['TSK-001', 'PRJ-001', 'Brand strategy alignment', 'Finalize positioning and outreach notes', 'USR-006', 'High', 'Completed', '2024-01-07', '2024-01-12', 18],
      ['TSK-002', 'PRJ-001', 'Packaging mockups', 'Prepare print-ready packaging variations', 'USR-004', 'Medium', 'Completed', '2024-01-14', '2024-01-20', 20],
      ['TSK-003', 'PRJ-002', 'Data model audit', 'Audit KPI schemas and dashboard mapping', 'USR-005', 'High', 'In Progress', '2024-02-20', '2024-03-05', 26],
      ['TSK-004', 'PRJ-002', 'Executive summary views', 'Design clean summary cards for leadership', 'USR-004', 'Medium', 'To Do', '2024-02-26', '2024-03-09', 12],
      ['TSK-005', 'PRJ-003', 'Pilot onboarding', 'Set up beta launch checklist', 'USR-007', 'High', 'In Review', '2024-03-01', '2024-03-12', 15],
    ];

    for (const row of tasks) {
      await client.query(
        `INSERT INTO tasks (task_id, project_id, title, description, assignee_id, priority, status, start_date, due_date, estimated_hours)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         ON CONFLICT (task_id) DO NOTHING`,
        row,
      );
    }

    const sessions = [
      ['SES-001', 'TSK-001', 'USR-006', '2024-02-01T09:00:00Z', '2024-02-01T12:30:00Z', 1500, true, 'Strategy workshop'],
      ['SES-002', 'TSK-003', 'USR-005', '2024-03-02T10:00:00Z', '2024-03-02T13:00:00Z', 1500, true, 'Schema normalization work'],
      ['SES-003', 'TSK-004', 'USR-004', '2024-03-05T14:00:00Z', '2024-03-05T17:00:00Z', 1400, true, 'Dashboard polish'],
    ];

    for (const row of sessions) {
      await client.query(
        `INSERT INTO work_sessions (session_id, task_id, user_id, start_time, end_time, hourly_rate, billable_status, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (session_id) DO NOTHING`,
        row,
      );
    }

    const invoices = [
      ['INV-001', 'NX/24-25/0001', '2024-04-01', '2024-04-15', 5, 18, 'Sent', 'Brand refresh invoice', 'CLT-001', 'PRJ-001'],
      ['INV-002', 'NX/24-25/0002', '2024-04-10', '2024-04-30', 0, 18, 'Sent', 'Reporting suite milestone', 'CLT-002', 'PRJ-002'],
    ];

    for (const row of invoices) {
      await client.query(
        `INSERT INTO invoices (invoice_id, invoice_number, invoice_date, due_date, discount_pct, tax_rate, invoice_status, notes, client_id, project_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         ON CONFLICT (invoice_id) DO NOTHING`,
        row,
      );
    }

    const items = [
      ['INV-001-1', 'INV-001', 'Strategy sprint', 2, 25000],
      ['INV-001-2', 'INV-001', 'Packaging design', 3, 20000],
      ['INV-002-1', 'INV-002', 'Dashboard sprint', 5, 22000],
    ];

    for (const row of items) {
      await client.query(
        'INSERT INTO invoice_items (item_id, invoice_id, description, quantity, unit_price) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (item_id) DO NOTHING',
        row,
      );
    }

    const payments = [
      ['PMT-001', 'INV-001', '2024-04-20', 85000, 'Bank Transfer', 'TRX-INV-001', 'Completed', 'Initial milestone payment'],
      ['PMT-002', 'INV-002', '2024-04-27', 50000, 'UPI', 'TRX-INV-002', 'Pending', 'Awaiting final reconciliation'],
    ];

    for (const row of payments) {
      await client.query(
        'INSERT INTO payments (payment_id, invoice_id, payment_date, amount, payment_method, transaction_id, payment_status, notes) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) ON CONFLICT (payment_id) DO NOTHING',
        row,
      );
    }

    await client.query('COMMIT');
    console.log('Seed data loaded for NEXUS');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Seed failed:', error.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
};

seedData();
