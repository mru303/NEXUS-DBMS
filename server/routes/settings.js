import { Router } from 'express';
import { z } from 'zod';
import { databaseConfigured, query } from '../config/database.js';

const router = Router();
const settingsSchema = z.object({
  workspaceName: z.string().trim().min(1).max(100),
  companyName: z.string().trim().min(1).max(120),
  companyAddress: z.string().max(300),
  companyEmail: z.string().email(),
  companyPhone: z.string().max(30),
  companyGstin: z.string().regex(/^$|^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/),
  companyPan: z.string().max(20),
  bankName: z.string().max(120),
  bankAccount: z.string().max(40),
  bankIfsc: z.string().max(20),
  upiId: z.string().max(100),
  currency: z.literal('INR'),
  defaultTaxRate: z.union([z.literal(0), z.literal(5), z.literal(12), z.literal(18), z.literal(28)]),
  invoicePrefix: z.string().regex(/^[A-Z0-9]{1,6}$/),
  paymentTermsDays: z.number().int().min(0).max(180),
  invoiceFooter: z.string().max(500),
  notifyOverdueInvoices: z.boolean(),
  notifyTaskDeadlines: z.boolean(),
  notifyPayments: z.boolean(),
  theme: z.enum(['dark', 'light', 'system']),
  density: z.enum(['comfortable', 'compact']),
}).partial().strict();

router.get('/', async (_req, res, next) => {
  try {
    if (!databaseConfigured()) return res.status(503).json({ ok: false, error: 'Database is not configured.' });
    const result = await query('SELECT settings_json, updated_at FROM workspace_settings WHERE settings_id = 1');
    return res.json({ ok: true, data: { settings: result.rows[0]?.settings_json ?? {}, updatedAt: result.rows[0]?.updated_at ?? null } });
  } catch (error) { return next(error); }
});

router.put('/', async (req, res, next) => {
  try {
    if (!databaseConfigured()) return res.status(503).json({ ok: false, error: 'Database is not configured.' });
    const patch = settingsSchema.parse(req.body);
    if (!Object.keys(patch).length) return res.status(400).json({ ok: false, error: 'No settings provided.' });
    const result = await query(
      `INSERT INTO workspace_settings (settings_id, settings_json) VALUES (1, $1::jsonb)
       ON CONFLICT (settings_id) DO UPDATE SET settings_json = workspace_settings.settings_json || EXCLUDED.settings_json, updated_at = NOW()
       RETURNING settings_json, updated_at`,
      [JSON.stringify(patch)],
    );
    return res.json({ ok: true, data: { settings: result.rows[0].settings_json, updatedAt: result.rows[0].updated_at } });
  } catch (error) {
    if (error instanceof z.ZodError) return res.status(400).json({ ok: false, error: 'Validation failed', details: error.issues });
    return next(error);
  }
});

router.get('/db-overview', async (_req, res, next) => {
  try {
    if (!databaseConfigured()) return res.status(503).json({ ok: false, error: 'Database is not configured.' });
    const tables = await query(`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name`);
    return res.json({ ok: true, data: { tables: tables.rows.map((row) => row.table_name) } });
  } catch (error) { return next(error); }
});

export default router;
