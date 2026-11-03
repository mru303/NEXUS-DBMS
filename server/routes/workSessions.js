import { Router } from 'express';
import { z } from 'zod';
import { databaseConfigured, query } from '../config/database.js';
import { createId } from '../lib/ids.js';

const router = Router();

const sessionSchema = z.object({
  taskId: z.string().min(1),
  userId: z.string().min(1),
  start: z.string().min(1),
  end: z.string().min(1),
  hourlyRate: z.number().nonnegative(),
  billable: z.boolean().default(true),
  notes: z.string().optional().or(z.literal('')),
});

router.get('/', async (_req, res, next) => {
  try {
    if (!databaseConfigured()) return res.status(503).json({ ok: false, error: 'Database is not configured.' });
    const result = await query('SELECT * FROM work_sessions ORDER BY start_time DESC');
    return res.json({ ok: true, data: result.rows });
  } catch (error) { return next(error); }
});

router.post('/', async (req, res, next) => {
  try {
    const data = sessionSchema.parse(req.body);
    const id = createId('SES');
    const result = await query(
      `INSERT INTO work_sessions (session_id, task_id, user_id, start_time, end_time, hourly_rate, billable_status, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [id, data.taskId, data.userId, data.start, data.end, data.hourlyRate, data.billable, data.notes || ''],
    );
    return res.status(201).json({ ok: true, data: result.rows[0] });
  } catch (error) {
    if (error instanceof z.ZodError) return res.status(400).json({ ok: false, error: 'Validation failed', details: error.issues });
    return next(error);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const result = await query('SELECT * FROM work_sessions WHERE session_id = $1', [req.params.id]);
    if (!result.rows[0]) return res.status(404).json({ ok: false, error: 'Work session not found' });
    return res.json({ ok: true, data: result.rows[0] });
  } catch (error) { return next(error); }
});

router.patch('/:id', async (req, res, next) => {
  try {
    const data = sessionSchema.partial().parse(req.body);
    const fields = Object.entries(data).filter(([, value]) => value !== undefined);
    if (!fields.length) return res.status(400).json({ ok: false, error: 'No update fields provided' });
    const columns = { taskId: 'task_id', userId: 'user_id', start: 'start_time', end: 'end_time', hourlyRate: 'hourly_rate', billable: 'billable_status', notes: 'notes' };
    const setClauses = fields.map(([key], index) => `${columns[key]} = $${index + 1}`).join(', ');
    const values = fields.map(([, value]) => value);
    const result = await query(`UPDATE work_sessions SET ${setClauses} WHERE session_id = $${fields.length + 1} RETURNING *`, [...values, req.params.id]);
    if (!result.rows[0]) return res.status(404).json({ ok: false, error: 'Work session not found' });
    return res.json({ ok: true, data: result.rows[0] });
  } catch (error) {
    if (error instanceof z.ZodError) return res.status(400).json({ ok: false, error: 'Validation failed', details: error.issues });
    return next(error);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const result = await query('DELETE FROM work_sessions WHERE session_id = $1 RETURNING *', [req.params.id]);
    if (!result.rows[0]) return res.status(404).json({ ok: false, error: 'Work session not found' });
    return res.json({ ok: true, data: { deletedId: req.params.id } });
  } catch (error) { return next(error); }
});

export default router;
