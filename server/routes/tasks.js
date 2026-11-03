import { Router } from 'express';
import { z } from 'zod';
import { databaseConfigured, query } from '../config/database.js';
import { createId } from '../lib/ids.js';

const router = Router();

const taskSchema = z.object({
  projectId: z.string().min(1),
  title: z.string().min(1),
  description: z.string().optional().or(z.literal('')),
  assigneeId: z.string().nullable().optional(),
  priority: z.enum(['Low', 'Medium', 'High', 'Urgent']).default('Medium'),
  status: z.enum(['To Do', 'In Progress', 'In Review', 'Completed']).default('To Do'),
  startDate: z.string().min(1),
  dueDate: z.string().min(1),
  estimatedHours: z.number().nonnegative(),
});

router.get('/', async (_req, res, next) => {
  try {
    if (!databaseConfigured()) return res.status(503).json({ ok: false, error: 'Database is not configured.' });
    const result = await query('SELECT * FROM tasks ORDER BY due_date ASC');
    return res.json({ ok: true, data: result.rows });
  } catch (error) { return next(error); }
});

router.post('/', async (req, res, next) => {
  try {
    const data = taskSchema.parse(req.body);
    const id = createId('TSK');
    const result = await query(
      `INSERT INTO tasks (task_id, project_id, title, description, assignee_id, priority, status, start_date, due_date, estimated_hours)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
      [id, data.projectId, data.title, data.description || '', data.assigneeId || null, data.priority, data.status, data.startDate, data.dueDate, data.estimatedHours],
    );
    return res.status(201).json({ ok: true, data: result.rows[0] });
  } catch (error) {
    if (error instanceof z.ZodError) return res.status(400).json({ ok: false, error: 'Validation failed', details: error.issues });
    return next(error);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const result = await query('SELECT * FROM tasks WHERE task_id = $1', [req.params.id]);
    if (!result.rows[0]) return res.status(404).json({ ok: false, error: 'Task not found' });
    return res.json({ ok: true, data: result.rows[0] });
  } catch (error) { return next(error); }
});

router.patch('/:id', async (req, res, next) => {
  try {
    const data = taskSchema.partial().parse(req.body);
    const fields = Object.entries(data).filter(([, value]) => value !== undefined);
    if (!fields.length) return res.status(400).json({ ok: false, error: 'No update fields provided' });
    const columns = { projectId: 'project_id', title: 'title', description: 'description', assigneeId: 'assignee_id', priority: 'priority', status: 'status', startDate: 'start_date', dueDate: 'due_date', estimatedHours: 'estimated_hours' };
    const setClauses = fields.map(([key], index) => `${columns[key]} = $${index + 1}`).join(', ');
    const values = fields.map(([, value]) => value);
    const result = await query(`UPDATE tasks SET ${setClauses} WHERE task_id = $${fields.length + 1} RETURNING *`, [...values, req.params.id]);
    if (!result.rows[0]) return res.status(404).json({ ok: false, error: 'Task not found' });
    return res.json({ ok: true, data: result.rows[0] });
  } catch (error) {
    if (error instanceof z.ZodError) return res.status(400).json({ ok: false, error: 'Validation failed', details: error.issues });
    return next(error);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const result = await query('DELETE FROM tasks WHERE task_id = $1 RETURNING *', [req.params.id]);
    if (!result.rows[0]) return res.status(404).json({ ok: false, error: 'Task not found' });
    return res.json({ ok: true, data: { deletedId: req.params.id } });
  } catch (error) { return next(error); }
});

export default router;
