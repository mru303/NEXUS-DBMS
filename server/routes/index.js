import { Router } from 'express';
import dashboardRoutes from './dashboard.js';
import userRoutes from './users.js';
import clientRoutes from './clients.js';
import projectRoutes from './projects.js';
import taskRoutes from './tasks.js';
import workSessionRoutes from './workSessions.js';
import invoiceRoutes from './invoices.js';
import paymentRoutes from './payments.js';
import reportRoutes from './reports.js';
import settingsRoutes from './settings.js';
import bootstrapRoutes from './bootstrap.js';

const router = Router();

router.get('/health', (_req, res) => {
  res.json({ ok: true, status: 'healthy', service: 'nexus-api' });
});

router.use('/dashboard', dashboardRoutes);
router.use('/bootstrap', bootstrapRoutes);
router.use('/users', userRoutes);
router.use('/clients', clientRoutes);
router.use('/projects', projectRoutes);
router.use('/tasks', taskRoutes);
router.use('/work-sessions', workSessionRoutes);
router.use('/invoices', invoiceRoutes);
router.use('/payments', paymentRoutes);
router.use('/reports', reportRoutes);
router.use('/settings', settingsRoutes);

export default router;
