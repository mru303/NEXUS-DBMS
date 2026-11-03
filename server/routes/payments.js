import { Router } from 'express';
import { z } from 'zod';
import { databaseConfigured, query, withTransaction } from '../config/database.js';
import { paymentSchema } from '../lib/validators.js';
import { createId } from '../lib/ids.js';

const router = Router();

router.get('/', async (_req, res, next) => {
  try {
    if (!databaseConfigured()) {
      return res.status(503).json({ ok: false, error: 'Database is not configured.' });
    }
    const result = await query('SELECT * FROM payments ORDER BY payment_date DESC');
    return res.json({ ok: true, data: result.rows });
  } catch (error) {
    return next(error);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const data = paymentSchema.parse(req.body);
    const paymentId = createId('PMT');
    const payment = await withTransaction(async (client) => {
      const invoice = await client.query('SELECT invoice_status FROM invoices WHERE invoice_id = $1 FOR UPDATE', [data.invoiceId]);
      if (!invoice.rows[0]) return { notFound: true };
      if (invoice.rows[0].invoice_status !== 'Sent') return { invalidState: true };
      const balance = await client.query(
        "SELECT COALESCE(s.total_amount, 0) - COALESCE(SUM(CASE WHEN p.payment_status IN ('Completed', 'Pending') THEN p.amount ELSE 0 END), 0) AS balance FROM invoice_summary s LEFT JOIN payments p ON p.invoice_id = s.invoice_id WHERE s.invoice_id = $1 GROUP BY s.total_amount",
        [data.invoiceId],
      );
      if (['Completed', 'Pending'].includes(data.status) && data.amount > Number(balance.rows[0]?.balance ?? 0) + 0.005) return { overpayment: true };
      const result = await client.query(
        'INSERT INTO payments (payment_id, invoice_id, payment_date, amount, payment_method, transaction_id, payment_status, notes) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *',
        [paymentId, data.invoiceId, data.date, data.amount, data.method, data.reference || paymentId, data.status, data.notes || ''],
      );
      return { data: result.rows[0] };
    });
    if (payment.notFound) return res.status(404).json({ ok: false, error: 'Invoice not found' });
    if (payment.invalidState) return res.status(400).json({ ok: false, error: 'Payments can only be recorded against sent invoices.' });
    if (payment.overpayment) return res.status(400).json({ ok: false, error: 'Payment exceeds the remaining invoice balance.' });
    return res.status(201).json({ ok: true, data: payment.data });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ ok: false, error: 'Validation failed', details: error.issues });
    }
    return next(error);
  }
});

router.patch('/:id', async (req, res, next) => {
  try {
    const data = paymentSchema.partial().parse(req.body);
    const fields = Object.entries(data).filter(([, value]) => value !== undefined);
    if (!fields.length) return res.status(400).json({ ok: false, error: 'No update fields provided' });
    const columns = { invoiceId: 'invoice_id', date: 'payment_date', amount: 'amount', method: 'payment_method', reference: 'transaction_id', status: 'payment_status', notes: 'notes' };
    const outcome = await withTransaction(async (client) => {
      const current = await client.query('SELECT * FROM payments WHERE payment_id = $1 FOR UPDATE', [req.params.id]);
      if (!current.rows[0]) return { notFound: true };
      const next = { ...current.rows[0] };
      for (const [key, value] of fields) next[columns[key]] = value;
      const invoice = await client.query('SELECT invoice_status FROM invoices WHERE invoice_id = $1 FOR UPDATE', [next.invoice_id]);
      if (!invoice.rows[0]) return { invoiceNotFound: true };
      if (invoice.rows[0].invoice_status !== 'Sent') return { invalidState: true };
      const balance = await client.query(
        "SELECT COALESCE(s.total_amount, 0) - COALESCE(SUM(CASE WHEN p.payment_status IN ('Completed', 'Pending') AND p.payment_id <> $2 THEN p.amount ELSE 0 END), 0) AS balance FROM invoice_summary s LEFT JOIN payments p ON p.invoice_id = s.invoice_id WHERE s.invoice_id = $1 GROUP BY s.total_amount",
        [next.invoice_id, req.params.id],
      );
      if (['Completed', 'Pending'].includes(next.payment_status) && Number(next.amount) > Number(balance.rows[0]?.balance ?? 0) + 0.005) return { overpayment: true };
      const setClauses = fields.map(([key], index) => `${columns[key]} = $${index + 1}`).join(', ');
      const updated = await client.query(`UPDATE payments SET ${setClauses} WHERE payment_id = $${fields.length + 1} RETURNING *`, [...fields.map(([, value]) => value), req.params.id]);
      return { data: updated.rows[0] };
    });
    if (outcome.notFound) return res.status(404).json({ ok: false, error: 'Payment not found' });
    if (outcome.invoiceNotFound) return res.status(404).json({ ok: false, error: 'Invoice not found' });
    if (outcome.invalidState) return res.status(400).json({ ok: false, error: 'Payments can only be recorded against sent invoices.' });
    if (outcome.overpayment) return res.status(400).json({ ok: false, error: 'Payment exceeds the remaining invoice balance.' });
    return res.json({ ok: true, data: outcome.data });
  } catch (error) {
    if (error instanceof z.ZodError) return res.status(400).json({ ok: false, error: 'Validation failed', details: error.issues });
    return next(error);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const result = await query('DELETE FROM payments WHERE payment_id = $1 RETURNING payment_id', [req.params.id]);
    if (!result.rows[0]) return res.status(404).json({ ok: false, error: 'Payment not found' });
    return res.json({ ok: true, data: { deletedId: req.params.id } });
  } catch (error) { return next(error); }
});

export default router;
