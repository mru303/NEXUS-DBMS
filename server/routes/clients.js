import { Router } from 'express';
import { z } from 'zod';
import { databaseConfigured, query } from '../config/database.js';
import { clientSchema } from '../lib/validators.js';
import { createId } from '../lib/ids.js';

const router = Router();

router.get('/', async (_req, res, next) => {
  try {
    if (!databaseConfigured()) {
      return res.status(503).json({ ok: false, error: 'Database is not configured.' });
    }
    const result = await query('SELECT * FROM clients ORDER BY created_at DESC');
    return res.json({ ok: true, data: result.rows });
  } catch (error) {
    return next(error);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const data = clientSchema.parse(req.body);
    const result = await query(
      `INSERT INTO clients (
        client_id, company_name, client_name, email, phone_number, street, city, state, pincode, country, gstin, status, created_at, account_manager_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) RETURNING *`,
      [
        createId('CLT'),
        data.companyName,
        data.contactPerson,
        data.email,
        data.phone || null,
        data.street || null,
        data.city || null,
        data.state || null,
        data.pincode || null,
        data.country || 'India',
        data.gstin || null,
        data.status,
        new Date().toISOString().slice(0, 10),
        data.accountManagerId,
      ],
    );
    return res.status(201).json({ ok: true, data: result.rows[0] });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ ok: false, error: 'Validation failed', details: error.issues });
    }
    return next(error);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const result = await query('SELECT * FROM clients WHERE client_id = $1', [req.params.id]);
    if (!result.rows[0]) return res.status(404).json({ ok: false, error: 'Client not found' });
    return res.json({ ok: true, data: result.rows[0] });
  } catch (error) {
    return next(error);
  }
});

router.patch('/:id', async (req, res, next) => {
  try {
    const data = clientSchema.partial().parse(req.body);
    const columnNames = {
      companyName: 'company_name', contactPerson: 'client_name', email: 'email', phone: 'phone_number',
      street: 'street', city: 'city', state: 'state', pincode: 'pincode', country: 'country', gstin: 'gstin',
      status: 'status', accountManagerId: 'account_manager_id',
    };
    const fields = Object.entries(data).filter(([, value]) => value !== undefined);
    if (!fields.length) {
      return res.status(400).json({ ok: false, error: 'No update fields provided' });
    }
    const setClauses = fields.map(([key], index) => `${columnNames[key]} = $${index + 1}`).join(', ');
    const values = fields.map(([, value]) => value);
    const result = await query(`UPDATE clients SET ${setClauses} WHERE client_id = $${fields.length + 1} RETURNING *`, [...values, req.params.id]);
    if (!result.rows[0]) return res.status(404).json({ ok: false, error: 'Client not found' });
    return res.json({ ok: true, data: result.rows[0] });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ ok: false, error: 'Validation failed', details: error.issues });
    }
    return next(error);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const result = await query('DELETE FROM clients WHERE client_id = $1 RETURNING *', [req.params.id]);
    if (!result.rows[0]) return res.status(404).json({ ok: false, error: 'Client not found' });
    return res.json({ ok: true, data: { deletedId: req.params.id } });
  } catch (error) {
    return next(error);
  }
});

export default router;
