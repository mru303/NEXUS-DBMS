import assert from 'node:assert/strict';
import test from 'node:test';

const createLocalStorage = () => {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
    setItem: (key: string, value: string) => store.set(key, value),
    removeItem: (key: string) => store.delete(key),
    clear: () => store.clear(),
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    get length() { return store.size; },
  };
};

Object.defineProperty(globalThis, 'localStorage', {
  value: createLocalStorage(),
  configurable: true,
  writable: true,
});

const sampleClient = {
  client_id: 'CLT-001',
  company_name: 'Acme Labs',
  client_name: 'Ada Morgan',
  email: 'ada@acmelabs.in',
  phone_number: '+91 98200 12345',
  street: '12 Market Street',
  city: 'Pune',
  state: 'Maharashtra',
  pincode: '411045',
  country: 'India',
  gstin: '27AAKCS4821M1Z5',
  status: 'Active',
  created_at: '2026-01-01',
  account_manager_id: 'USR-002',
};

const { apiGet } = await import('../../src/lib/api.ts');
const { createClientApi, deleteClientApi, getState, refreshClientsFromApi, updateClientApi } = await import('../../src/data/store.ts');

test('client API helpers use the expected backend route contracts and keep store state in sync', async () => {
  const calls: Array<{ url: string; method: string; body?: unknown }> = [];
  const remoteClients = [sampleClient];
  const frontendClient = (row: typeof sampleClient) => ({
    id: row.client_id, companyName: row.company_name, contactPerson: row.client_name, email: row.email,
    phone: row.phone_number, street: row.street, city: row.city, state: row.state, pincode: row.pincode,
    country: row.country, gstin: row.gstin, status: row.status, createdAt: row.created_at,
    accountManagerId: row.account_manager_id,
  });

  globalThis.fetch = async (input, init = {}) => {
    const target = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    const method = String((init.method ?? 'GET')).toUpperCase();
    const body = init.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ url: target, method, body });

    if (target === 'http://localhost:3001/api/clients' && method === 'GET') {
      return new Response(JSON.stringify({ ok: true, data: remoteClients }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    if (target === 'http://localhost:3001/api/bootstrap' && method === 'GET') {
      return new Response(JSON.stringify({ ok: true, data: { db: {
        users: [], clients: remoteClients.map(frontendClient), projects: [], tasks: [], sessions: [], invoices: [], payments: [],
      } } }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    if (target === 'http://localhost:3001/api/clients' && method === 'POST') {
      const created = { ...sampleClient, client_id: 'CLT-002', company_name: body.companyName, client_name: body.contactPerson, email: body.email, account_manager_id: body.accountManagerId };
      remoteClients.push(created);
      return new Response(JSON.stringify({ ok: true, data: created }), { status: 201, headers: { 'Content-Type': 'application/json' } });
    }

    if (target === 'http://localhost:3001/api/clients/CLT-001' && method === 'PATCH') {
      remoteClients[0] = { ...remoteClients[0], company_name: body.companyName };
      return new Response(JSON.stringify({ ok: true, data: remoteClients[0] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    if (target === 'http://localhost:3001/api/clients/CLT-001' && method === 'DELETE') {
      remoteClients.splice(0, 1);
      return new Response(JSON.stringify({ ok: true, data: { deletedId: 'CLT-001' } }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({ ok: false, error: 'Unexpected request' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  };

  const list = await apiGet('/clients');
  assert.equal(list.ok, true);
  assert.equal(calls[0]?.url, 'http://localhost:3001/api/clients');
  assert.equal(calls[0]?.method, 'GET');

  await refreshClientsFromApi();
  assert.equal(getState().db.clients.length, 1);
  assert.equal(getState().db.clients[0].companyName, 'Acme Labs');

  const created = await createClientApi({
    companyName: 'Northwind Systems',
    contactPerson: 'Asha Shah',
    email: 'asha@northwind.co',
    phone: '+91 98765 43210',
    street: '9 Lake View',
    city: 'Bengaluru',
    state: 'Karnataka',
    pincode: '560001',
    country: 'India',
    gstin: '29ABCD1234F1Z9',
    status: 'Active',
    accountManagerId: 'USR-002',
  });
  assert.equal(created.ok, true);
  assert.equal(getState().db.clients.length, 2);

  const updated = await updateClientApi('CLT-001', { companyName: 'Acme Labs Pvt Ltd' });
  assert.equal(updated.ok, true);
  assert.equal(getState().db.clients.some((client) => client.id === 'CLT-001' && client.companyName === 'Acme Labs Pvt Ltd'), true);

  const deleted = await deleteClientApi('CLT-001');
  assert.equal(deleted.ok, true);
  assert.equal(getState().db.clients.some((client) => client.id === 'CLT-001'), false);

  assert.ok(calls.some((call) => call.url === 'http://localhost:3001/api/clients' && call.method === 'POST'));
  assert.ok(calls.some((call) => call.url === 'http://localhost:3001/api/clients/CLT-001' && call.method === 'PATCH'));
  assert.ok(calls.some((call) => call.url === 'http://localhost:3001/api/clients/CLT-001' && call.method === 'DELETE'));
});

test('failed client requests surface errors instead of reporting success', async () => {
  globalThis.fetch = async () => {
    return new Response(JSON.stringify({ ok: false, error: 'database unavailable' }), { status: 503, headers: { 'Content-Type': 'application/json' } });
  };

  const result = await createClientApi({
    companyName: 'Nope Studio',
    contactPerson: 'Nina Moore',
    email: 'nina@nope.studio',
    phone: '+91 98989 12345',
    street: '25 Hill Road',
    city: 'Mumbai',
    state: 'Maharashtra',
    pincode: '400001',
    country: 'India',
    gstin: '27AAKCS4821M1Z5',
    status: 'Active',
    accountManagerId: 'USR-002',
  });

  assert.equal(result.ok, false);
  assert.match(result.error, /database unavailable|Could not create client/i);
});
