import { Router } from 'express';
import { z } from 'zod';
import { databaseConfigured, query, withTransaction } from '../config/database.js';
import { invoiceSchema } from '../lib/validators.js';
import { createId } from '../lib/ids.js';

const router = Router();
const columns = {
  clientId: 'client_id', projectId: 'project_id', issueDate: 'invoice_date', dueDate: 'due_date',
  discountPct: 'discount_pct', taxRate: 'tax_rate', state: 'invoice_status', notes: 'notes',
};

async function invoiceData(db, id) {
  const invoice = await db.query('SELECT * FROM invoices WHERE invoice_id = $1', [id]);
  if (!invoice.rows[0]) return null;
  const items = await db.query('SELECT * FROM invoice_items WHERE invoice_id = $1 ORDER BY item_id', [id]);
  const payments = await db.query('SELECT * FROM payments WHERE invoice_id = $1 ORDER BY payment_date, payment_id', [id]);
  const summary = await db.query('SELECT * FROM invoice_summary WHERE invoice_id = $1', [id]);
  return {
    ...invoice.rows[0],
    lineItems: items.rows.map((row) => ({ id: row.item_id, description: row.description, quantity: Number(row.quantity), unitPrice: Number(row.unit_price) })),
    payments: payments.rows,
    summary: summary.rows[0],
  };
}

async function replaceItems(db, invoiceId, items) {
  await db.query('DELETE FROM invoice_items WHERE invoice_id = $1', [invoiceId]);
  for (const [index, item] of items.entries()) {
    await db.query(
      'INSERT INTO invoice_items (item_id, invoice_id, description, quantity, unit_price) VALUES ($1, $2, $3, $4, $5)',
      [`${invoiceId}-${String(index + 1).padStart(3, '0')}`, invoiceId, item.description, item.quantity, item.unitPrice],
    );
  }
}

router.get('/', async (_req, res, next) => {
  try {
    if (!databaseConfigured()) {
      return res.status(503).json({ ok: false, error: 'Database is not configured.' });
    }
    const result = await query('SELECT invoice_id FROM invoices ORDER BY invoice_date DESC, invoice_id');
    const data = await Promise.all(result.rows.map((row) => invoiceData({ query }, row.invoice_id)));
    return res.json({ ok: true, data });
  } catch (error) {
    return next(error);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const data = invoiceSchema.parse(req.body);


    const id = createId('INV');
    const year = new Date(`${data.issueDate}T00:00:00`).getFullYear();
    const number = `NX/${String(year).slice(-2)}-${String(year + 1).slice(-2)}/${id.slice(-6)}`;
    const record = await withTransaction(async (db) => {
      const project = await db.query('SELECT client_id FROM projects WHERE project_id = $1', [data.projectId]);
      if (!project.rows[0] || project.rows[0].client_id !== data.clientId) {
        const error = new Error('Choose a project belonging to the selected client.');
        error.statusCode = 400;
        throw error;
      }
      await db.query(
        `INSERT INTO invoices (invoice_id, invoice_number, invoice_date, due_date, discount_pct, tax_rate, invoice_status, notes, client_id, project_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [id, number, data.issueDate, data.dueDate, data.discountPct, data.taxRate, data.state, data.notes || '', data.clientId, data.projectId],
      );
      await replaceItems(db, id, data.lineItems);
      return invoiceData(db, id);
    });
    return res.status(201).json({ ok: true, data: record });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ ok: false, error: 'Validation failed', details: error.issues });
    }
    return next(error);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const data = await invoiceData({ query }, req.params.id);
    if (!data) return res.status(404).json({ ok: false, error: 'Invoice not found' });
    return res.json({ ok: true, data });
  } catch (error) {
    return next(error);
  }
});

router.patch('/:id', async (req, res, next) => {
  try {
    const data = invoiceSchema.partial().parse(req.body);
    const { lineItems, ...patch } = data;
    const fields = Object.entries(patch).filter(([, value]) => value !== undefined);
    if (!fields.length && lineItems === undefined) return res.status(400).json({ ok: false, error: 'No update fields provided' });
    const record = await withTransaction(async (db) => {
      const currentResult = await db.query('SELECT * FROM invoices WHERE invoice_id = $1 FOR UPDATE', [req.params.id]);
      const current = currentResult.rows[0];
      if (!current) return null;
      const paidResult = await db.query("SELECT COALESCE(SUM(amount), 0) AS amount FROM payments WHERE invoice_id = $1 AND payment_status IN ('Completed', 'Pending')", [req.params.id]);
      const committed = Number(paidResult.rows[0].amount);
      if (committed > 0 && patch.clientId && patch.clientId !== current.client_id) {
        const error = new Error('This invoice has payments, so its client can’t be changed.');
        error.statusCode = 400;
        throw error;
      }
      const nextClient = patch.clientId ?? current.client_id;
      const nextProject = patch.projectId ?? current.project_id;
      const project = await db.query('SELECT client_id FROM projects WHERE project_id = $1', [nextProject]);
      if (!project.rows[0] || project.rows[0].client_id !== nextClient) {
        const error = new Error('Choose a project belonging to the selected client.');
        error.statusCode = 400;
        throw error;
      }
      if (committed > 0 && patch.state === 'Draft') {
        const error = new Error('An invoice with payments can’t go back to Draft.');
        error.statusCode = 400;
        throw error;
      }
      if (committed > 0 && patch.state === 'Cancelled') {
        const error = new Error('An invoice with payments can’t be cancelled.');
        error.statusCode = 400;
        throw error;
      }
      if (fields.length) {
        const setClauses = fields.map(([key], index) => `${columns[key]} = $${index + 1}`).join(', ');
        await db.query(`UPDATE invoices SET ${setClauses} WHERE invoice_id = $${fields.length + 1}`, [...fields.map(([, value]) => value), req.params.id]);
      }
      if (lineItems !== undefined) await replaceItems(db, req.params.id, lineItems);
      const summary = await db.query('SELECT total_amount FROM invoice_summary WHERE invoice_id = $1', [req.params.id]);
      if (Number(summary.rows[0].total_amount) + 0.005 < committed) {
        const error = new Error('Invoice total cannot be less than payments already recorded.');
        error.statusCode = 400;
        throw error;
      }
      return invoiceData(db, req.params.id);
    });
    if (!record) return res.status(404).json({ ok: false, error: 'Invoice not found' });
    return res.json({ ok: true, data: record });
  } catch (error) {
    if (error instanceof z.ZodError) return res.status(400).json({ ok: false, error: 'Validation failed', details: error.issues });
    return next(error);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const result = await query('DELETE FROM invoices WHERE invoice_id = $1 RETURNING invoice_id', [req.params.id]);
    if (!result.rows[0]) return res.status(404).json({ ok: false, error: 'Invoice not found' });
    return res.json({ ok: true, data: { deletedId: req.params.id } });
  } catch (error) { return next(error); }
});

export default router;
