import { Router } from 'express';
import { z } from 'zod';
import { databaseConfigured, query } from '../config/database.js';
import { createId } from '../lib/ids.js';

const router = Router();

const userSchema = z.object({
  fullName: z.string().min(1),
  email: z.string().email(),
  phone: z.string().optional().or(z.literal('')),
  role: z.enum(['Administrator', 'Project Manager', 'Employee', 'Client', 'Finance Staff']),
  department: z.string().optional().or(z.literal('')),
  status: z.enum(['Active', 'Inactive']).default('Active'),
  joinedAt: z.string().min(1),
  clientId: z.string().optional().nullable(),
});

router.get('/', async (_req, res, next) => {
  try {
    if (!databaseConfigured()) return res.status(503).json({ ok: false, error: 'Database is not configured.' });
    const result = await query('SELECT * FROM users ORDER BY joined_at DESC');
    return res.json({ ok: true, data: result.rows });
  } catch (error) {
    return next(error);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const data = userSchema.parse(req.body);
    const id = createId('USR');
    const result = await query(
      `INSERT INTO users (user_id, full_name, email, phone_number, account_type, department, status, joined_at, client_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [id, data.fullName, data.email, data.phone || null, data.role, data.department || null, data.status, data.joinedAt, data.clientId || null],
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
    const result = await query('SELECT * FROM users WHERE user_id = $1', [req.params.id]);
    if (!result.rows[0]) return res.status(404).json({ ok: false, error: 'User not found' });
    return res.json({ ok: true, data: result.rows[0] });
  } catch (error) { return next(error); }
});

router.patch('/:id', async (req, res, next) => {
  try {
    const data = userSchema.partial().parse(req.body);
    const fields = Object.entries(data).filter(([, value]) => value !== undefined);
    if (!fields.length) return res.status(400).json({ ok: false, error: 'No update fields provided' });
    const columns = { fullName: 'full_name', email: 'email', phone: 'phone_number', role: 'account_type', department: 'department', status: 'status', joinedAt: 'joined_at', clientId: 'client_id' };
    const setClauses = fields.map(([key], index) => `${columns[key]} = $${index + 1}`).join(', ');
    const values = fields.map(([, value]) => value);
    const result = await query(`UPDATE users SET ${setClauses} WHERE user_id = $${fields.length + 1} RETURNING *`, [...values, req.params.id]);
    if (!result.rows[0]) return res.status(404).json({ ok: false, error: 'User not found' });
    return res.json({ ok: true, data: result.rows[0] });
  } catch (error) {
    if (error instanceof z.ZodError) return res.status(400).json({ ok: false, error: 'Validation failed', details: error.issues });
    return next(error);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const result = await query('DELETE FROM users WHERE user_id = $1 RETURNING *', [req.params.id]);
    if (!result.rows[0]) return res.status(404).json({ ok: false, error: 'User not found' });
    return res.json({ ok: true, data: { deletedId: req.params.id } });
  } catch (error) { return next(error); }
});

export default router;
