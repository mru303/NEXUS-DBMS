import { Router } from 'express';
import { databaseConfigured, query } from '../config/database.js';

const router = Router();

router.get('/', async (_req, res, next) => {
  try {
    if (!databaseConfigured()) return res.status(503).json({ ok: false, error: 'Database is not configured.' });

    const [users, clients, projects, members, tasks, sessions, invoices, items, payments, settings] = await Promise.all([
      query('SELECT * FROM users ORDER BY joined_at, user_id'),
      query('SELECT * FROM clients ORDER BY created_at DESC, client_id'),
      query('SELECT * FROM projects ORDER BY created_at DESC, project_id'),
      query('SELECT project_id, user_id FROM project_members ORDER BY project_id, user_id'),
      query('SELECT * FROM tasks ORDER BY due_date, task_id'),
      query('SELECT * FROM work_sessions ORDER BY start_time DESC, session_id'),
      query('SELECT * FROM invoices ORDER BY invoice_date DESC, invoice_id'),
      query('SELECT * FROM invoice_items ORDER BY invoice_id, item_id'),
      query('SELECT * FROM payments ORDER BY payment_date DESC, payment_id'),
      query('SELECT settings_json FROM workspace_settings WHERE settings_id = 1'),
    ]);

    const memberIds = new Map();
    for (const row of members.rows) {
      const current = memberIds.get(row.project_id) || [];
      current.push(row.user_id);
      memberIds.set(row.project_id, current);
    }

    const itemsByInvoice = new Map();
    for (const row of items.rows) {
      const current = itemsByInvoice.get(row.invoice_id) || [];
      current.push({ id: row.item_id, description: row.description, quantity: Number(row.quantity), unitPrice: Number(row.unit_price) });
      itemsByInvoice.set(row.invoice_id, current);
    }

    const db = {
      users: users.rows.map((row) => ({
        id: row.user_id, fullName: row.full_name, email: row.email, phone: row.phone_number || '',
        role: row.account_type, department: row.department || '', status: row.status,
        joinedAt: String(row.joined_at).slice(0, 10), ...(row.client_id ? { clientId: row.client_id } : {}),
      })),
      clients: clients.rows.map((row) => ({
        id: row.client_id, companyName: row.company_name, contactPerson: row.client_name, email: row.email,
        phone: row.phone_number || '', street: row.street || '', city: row.city || '', state: row.state || '',
        pincode: (row.pincode || '').trim(), country: row.country || 'India', gstin: (row.gstin || '').trim(),
        status: row.status, createdAt: String(row.created_at).slice(0, 10), accountManagerId: row.account_manager_id,
      })),
      projects: projects.rows.map((row) => ({
        id: row.project_id, name: row.project_name, clientId: row.client_id, description: row.description || '',
        managerId: row.user_id, memberIds: memberIds.get(row.project_id) || [],
        startDate: String(row.start_date).slice(0, 10), deadline: String(row.deadline).slice(0, 10),
        budget: Number(row.budget), billingRate: Number(row.billing_rate), status: row.status,
        priority: row.priority, createdAt: String(row.created_at).slice(0, 10),
      })),
      tasks: tasks.rows.map((row) => ({
        id: row.task_id, projectId: row.project_id, title: row.title, description: row.description || '',
        assigneeId: row.assignee_id, priority: row.priority, status: row.status,
        startDate: String(row.start_date).slice(0, 10), dueDate: String(row.due_date).slice(0, 10),
        estimatedHours: Number(row.estimated_hours),
      })),
      sessions: sessions.rows.map((row) => ({
        id: row.session_id, taskId: row.task_id, userId: row.user_id,
        start: new Date(row.start_time).toISOString(), end: new Date(row.end_time).toISOString(),
        hourlyRate: Number(row.hourly_rate), billable: row.billable_status, notes: row.notes || '',
      })),
      invoices: invoices.rows.map((row) => ({
        id: row.invoice_id, number: row.invoice_number, clientId: row.client_id, projectId: row.project_id,
        issueDate: String(row.invoice_date).slice(0, 10), dueDate: String(row.due_date).slice(0, 10),
        lineItems: itemsByInvoice.get(row.invoice_id) || [], discountPct: Number(row.discount_pct),
        taxRate: Number(row.tax_rate), state: row.invoice_status, notes: row.notes || '',
      })),
      payments: payments.rows.map((row) => ({
        id: row.payment_id, invoiceId: row.invoice_id, date: String(row.payment_date).slice(0, 10),
        amount: Number(row.amount), method: row.payment_method, reference: row.transaction_id || '',
        status: row.payment_status, notes: row.notes || '',
      })),
    };

    return res.json({ ok: true, data: { db, settings: settings.rows[0]?.settings_json ?? {} } });
  } catch (error) {
    return next(error);
  }
});

export default router;