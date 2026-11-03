import { Router } from 'express';
import { z } from 'zod';
import { databaseConfigured, query, withTransaction } from '../config/database.js';
import { projectSchema } from '../lib/validators.js';
import { createId } from '../lib/ids.js';

const router = Router();
const projectSelect = `SELECT p.*, COALESCE(array_agg(pm.user_id) FILTER (WHERE pm.user_id IS NOT NULL), ARRAY[]::varchar[]) AS member_ids
  FROM projects p LEFT JOIN project_members pm ON pm.project_id = p.project_id`;

router.get('/', async (_req, res, next) => {
  try {
    if (!databaseConfigured()) {
      return res.status(503).json({ ok: false, error: 'Database is not configured.' });
    }
    const result = await query(`${projectSelect} GROUP BY p.project_id ORDER BY p.created_at DESC`);
    return res.json({ ok: true, data: result.rows });
  } catch (error) {
    return next(error);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const data = projectSchema.parse(req.body);
    const result = await withTransaction(async (client) => {
      const result = await client.query(
      `INSERT INTO projects (
        project_id, project_name, description, start_date, deadline, status, priority, budget, billing_rate, created_at, user_id, client_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING *`,
      [
        createId('PRJ'),
        data.name,
        data.description || '',
        data.startDate,
        data.deadline,
        data.status,
        data.priority,
        data.budget,
        data.billingRate,
        new Date().toISOString().slice(0, 10),
        data.managerId,
        data.clientId,
      ],
      );

      for (const memberId of data.memberIds || []) {
        await client.query('INSERT INTO project_members (project_id, user_id) VALUES ($1, $2)', [result.rows[0].project_id, memberId]);
      }
      return result.rows[0];
    });

    return res.status(201).json({ ok: true, data: result });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ ok: false, error: 'Validation failed', details: error.issues });
    }
    return next(error);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const result = await query(`${projectSelect} WHERE p.project_id = $1 GROUP BY p.project_id`, [req.params.id]);
    if (!result.rows[0]) return res.status(404).json({ ok: false, error: 'Project not found' });
    return res.json({ ok: true, data: result.rows[0] });
  } catch (error) {
    return next(error);
  }
});

router.patch('/:id', async (req, res, next) => {
  try {
    const data = projectSchema.partial().parse(req.body);
    const { memberIds, ...patch } = data;
    const columns = { name: 'project_name', clientId: 'client_id', description: 'description', managerId: 'user_id', startDate: 'start_date', deadline: 'deadline', budget: 'budget', billingRate: 'billing_rate', status: 'status', priority: 'priority' };
    const fields = Object.entries(patch).filter(([, value]) => value !== undefined);
    if (!fields.length && memberIds === undefined) {
      return res.status(400).json({ ok: false, error: 'No update fields provided' });
    }
    const result = await withTransaction(async (client) => {
      let project;
      if (fields.length) {
        const setClauses = fields.map(([key], index) => `${columns[key]} = $${index + 1}`).join(', ');
        const values = fields.map(([, value]) => value);
        const updated = await client.query(`UPDATE projects SET ${setClauses} WHERE project_id = $${fields.length + 1} RETURNING *`, [...values, req.params.id]);
        project = updated.rows[0];
      } else {
        const current = await client.query('SELECT * FROM projects WHERE project_id = $1', [req.params.id]);
        project = current.rows[0];
      }
      if (!project) return null;
      if (memberIds !== undefined) {
        await client.query('DELETE FROM project_members WHERE project_id = $1', [req.params.id]);
        for (const memberId of memberIds) await client.query('INSERT INTO project_members (project_id, user_id) VALUES ($1, $2)', [req.params.id, memberId]);
      }
      const members = await client.query('SELECT user_id FROM project_members WHERE project_id = $1 ORDER BY user_id', [req.params.id]);
      return { ...project, member_ids: members.rows.map((row) => row.user_id) };
    });
    if (!result) return res.status(404).json({ ok: false, error: 'Project not found' });
    return res.json({ ok: true, data: result });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ ok: false, error: 'Validation failed', details: error.issues });
    }
    return next(error);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const result = await query('DELETE FROM projects WHERE project_id = $1 RETURNING *', [req.params.id]);
    if (!result.rows[0]) return res.status(404).json({ ok: false, error: 'Project not found' });
    return res.json({ ok: true, data: { deletedId: req.params.id } });
  } catch (error) {
    return next(error);
  }
});

export default router;
