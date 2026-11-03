import { Router } from 'express';
import { databaseConfigured, query } from '../config/database.js';

const router = Router();

router.get('/overview', async (_req, res, next) => {
  try {
    if (!databaseConfigured()) {
      return res.status(503).json({ ok: false, error: 'Database is not configured.' });
    }

    const [revenue, payments, overdue] = await Promise.all([
      query(`SELECT COALESCE(SUM(CASE WHEN payment_status = 'Completed' THEN amount ELSE 0 END), 0)::numeric AS collected FROM payments`),
      query(`SELECT COALESCE(SUM(amount), 0)::numeric AS total, payment_method FROM payments WHERE payment_status = 'Completed' GROUP BY payment_method ORDER BY total DESC`),
      query(`SELECT COUNT(*)::int AS overdue FROM invoice_summary WHERE derived_status = 'Overdue'`),
    ]);

    return res.json({
      ok: true,
      data: {
        collected: Number(revenue.rows[0].collected || 0),
        paymentBreakdown: payments.rows,
        overdueInvoices: Number(overdue.rows[0].overdue || 0),
      },
    });
  } catch (error) {
    return next(error);
  }
});

export default router;
