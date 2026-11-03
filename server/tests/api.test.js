import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import app from '../app.js';
import { pingDatabase, pool } from '../config/database.js';

after(() => pool.end());

test('GET /api/health returns healthy status', async () => {
  const response = await request(app).get('/api/health');
  assert.equal(response.status, 200);
  assert.equal(response.body.ok, true);
  assert.equal(response.body.status, 'healthy');
});

test('GET /api/dashboard/stats reflects database availability and live data', async () => {
  const response = await request(app).get('/api/dashboard/stats');
  if (await pingDatabase()) {
    assert.equal(response.status, 200);
    assert.equal(typeof response.body.data.clients, 'number');
    assert.equal(typeof response.body.data.outstanding, 'number');
  } else {
    assert.equal(response.status, 503);
    assert.match(response.body.error, /configured|database/i);
  }
});
