import { Router } from 'express';
import { databaseConfigured, query } from '../config/database.js';

const router = Router();

router.get('/stats', async (_req, res, next) => {
  try {
    if (!databaseConfigured()) {
      return res.status(503).json({ ok: false, error: 'PostgreSQL is not configured. Add your database variables to .env.' });
    }

    const [clients, projects, tasks, invoices, budget, revenue, outstanding] = await Promise.all([
      query('SELECT COUNT(*)::int AS count FROM clients'),
      query('SELECT COUNT(*)::int AS count FROM projects'),
      query('SELECT COUNT(*)::int AS count FROM tasks'),
      query('SELECT COUNT(*)::int AS count FROM invoices'),
      query('SELECT COALESCE(SUM(budget), 0)::numeric AS amount FROM projects'),
      query("SELECT COALESCE(SUM(amount), 0)::numeric AS amount FROM payments WHERE payment_status = 'Completed'"),
      query("SELECT COALESCE(SUM(balance_due), 0)::numeric AS amount FROM invoice_summary WHERE derived_status IN ('Sent', 'Partially Paid', 'Overdue')"),
    ]);

    const stats = {
      clients: clients.rows[0].count,
      projects: projects.rows[0].count,
      tasks: tasks.rows[0].count,
      invoices: invoices.rows[0].count,
      revenue: Number(revenue.rows[0].amount),
      outstanding: Number(outstanding.rows[0].amount),
      projectBudget: Number(budget.rows[0].amount),
    };

    return res.json({ ok: true, data: stats });
  } catch (error) {
    return next(error);
  }
});

export default router;
