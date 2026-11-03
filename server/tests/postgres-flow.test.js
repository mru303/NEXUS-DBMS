import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import app from '../app.js';
import { pingDatabase, pool, query } from '../config/database.js';

after(() => pool.end());

const databaseReady = await pingDatabase();
const seedReady = databaseReady && (await query("SELECT 1 FROM users WHERE user_id = 'USR-002'")).rowCount > 0;

const day = (offset = 0) => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);

test('PostgreSQL CRUD workflow persists client, project, task, session, invoice, and partial payment', { skip: !seedReady }, async () => {
  const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`.toUpperCase();
  let clientId;
  let projectId;
  let taskId;
  let sessionId;
  let invoiceId;
  let paymentId;

  try {
    const clientResponse = await request(app).post('/api/clients').send({
      companyName: `NEXUS Test ${suffix}`,
      contactPerson: 'Test Contact',
      email: `test-${suffix.toLowerCase()}@example.test`,
      phone: '+91 98200 12345',
      street: '1 Test Lane',
      city: 'Pune',
      state: 'Maharashtra',
      pincode: '411045',
      country: 'India',
      gstin: '',
      status: 'Active',
      accountManagerId: 'USR-002',
    });
    assert.equal(clientResponse.status, 201, JSON.stringify(clientResponse.body));
    clientId = clientResponse.body.data.client_id;
    assert.ok(clientId);
    const clientRead = await request(app).get(`/api/clients/${clientId}`);
    assert.equal(clientRead.body.data.company_name, `NEXUS Test ${suffix}`);

    const projectResponse = await request(app).post('/api/projects').send({
      name: `Test Project ${suffix}`,
      clientId,
      description: 'PostgreSQL integration workflow',
      managerId: 'USR-002',
      memberIds: ['USR-004'],
      startDate: day(-1),
      deadline: day(30),
      budget: 10000,
      billingRate: 1800,
      status: 'In Progress',
      priority: 'Medium',
    });
    assert.equal(projectResponse.status, 201, JSON.stringify(projectResponse.body));
    projectId = projectResponse.body.data.project_id;
    const projectRead = await request(app).get(`/api/projects/${projectId}`);
    assert.deepEqual(projectRead.body.data.member_ids, ['USR-004']);

    const projectUpdate = await request(app).patch(`/api/projects/${projectId}`).send({ name: `Updated Project ${suffix}`, memberIds: [] });
    assert.equal(projectUpdate.status, 200, JSON.stringify(projectUpdate.body));
    assert.equal(projectUpdate.body.data.project_name, `Updated Project ${suffix}`);

    const taskResponse = await request(app).post('/api/tasks').send({
      projectId,
      title: `Test Task ${suffix}`,
      description: 'Task CRUD check',
      assigneeId: 'USR-004',
      priority: 'High',
      status: 'To Do',
      startDate: day(-1),
      dueDate: day(7),
      estimatedHours: 4,
    });
    assert.equal(taskResponse.status, 201, JSON.stringify(taskResponse.body));
    taskId = taskResponse.body.data.task_id;
    const taskUpdate = await request(app).patch(`/api/tasks/${taskId}`).send({ status: 'In Progress' });
    assert.equal(taskUpdate.status, 200, JSON.stringify(taskUpdate.body));
    assert.equal(taskUpdate.body.data.status, 'In Progress');

    const started = new Date(Date.now() - 2 * 3600000).toISOString();
    const ended = new Date(Date.now() - 3600000).toISOString();
    const sessionResponse = await request(app).post('/api/work-sessions').send({
      taskId, userId: 'USR-004', start: started, end: ended, hourlyRate: 1800, billable: true, notes: 'Test session',
    });
    assert.equal(sessionResponse.status, 201, JSON.stringify(sessionResponse.body));
    sessionId = sessionResponse.body.data.session_id;
    const sessionUpdate = await request(app).patch(`/api/work-sessions/${sessionId}`).send({ notes: 'Updated test session' });
    assert.equal(sessionUpdate.status, 200, JSON.stringify(sessionUpdate.body));
    assert.equal(sessionUpdate.body.data.notes, 'Updated test session');

    const invoiceResponse = await request(app).post('/api/invoices').send({
      clientId,
      projectId,
      issueDate: day(),
      dueDate: day(30),
      discountPct: 0,
      taxRate: 18,
      state: 'Sent',
      notes: 'Test invoice',
      lineItems: [{ description: 'Integration work', quantity: 1, unitPrice: 1000 }],
    });
    assert.equal(invoiceResponse.status, 201, JSON.stringify(invoiceResponse.body));
    invoiceId = invoiceResponse.body.data.invoice_id;
    assert.equal(Number(invoiceResponse.body.data.summary.total_amount), 1180);

    const paymentResponse = await request(app).post('/api/payments').send({
      invoiceId,
      date: day(),
      amount: 500,
      method: 'Bank Transfer',
      reference: `TEST-${suffix}`,
      status: 'Completed',
      notes: 'First partial payment',
    });
    assert.equal(paymentResponse.status, 201, JSON.stringify(paymentResponse.body));
    paymentId = paymentResponse.body.data.payment_id;

    const invoiceRead = await request(app).get(`/api/invoices/${invoiceId}`);
    assert.equal(invoiceRead.status, 200);
    assert.equal(Number(invoiceRead.body.data.summary.amount_paid), 500);
    assert.equal(Number(invoiceRead.body.data.summary.balance_due), 680);
    assert.equal(invoiceRead.body.data.summary.derived_status, 'Partially Paid');

    const rejectedPayment = await request(app).post('/api/payments').send({
      invoiceId,
      date: day(),
      amount: 681,
      method: 'Bank Transfer',
      reference: `OVER-${suffix}`,
      status: 'Completed',
    });
    assert.equal(rejectedPayment.status, 400);
    assert.match(rejectedPayment.body.error, /balance|exceed/i);
  } finally {
    if (paymentId) await request(app).delete(`/api/payments/${paymentId}`);
    if (invoiceId) await request(app).delete(`/api/invoices/${invoiceId}`);
    if (sessionId) await request(app).delete(`/api/work-sessions/${sessionId}`);
    if (taskId) await request(app).delete(`/api/tasks/${taskId}`);
    if (projectId) await request(app).delete(`/api/projects/${projectId}`);
    if (clientId) await request(app).delete(`/api/clients/${clientId}`);
  }
});
