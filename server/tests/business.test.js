import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateDurationHours, computeInvoiceSummary, validatePayment } from '../lib/business.js';

test('calculateDurationHours returns positive hours for valid timestamps', () => {
  const hours = calculateDurationHours('2024-01-01T08:00:00Z', '2024-01-01T12:30:00Z');
  assert.equal(hours, 4.5);
});

test('computeInvoiceSummary calculates subtotal, tax and balance', () => {
  const invoice = {
    state: 'Sent',
    dueDate: '2024-08-31',
    discountPct: 5,
    taxRate: 18,
    lineItems: [
      { quantity: 2, unitPrice: 100 },
      { quantity: 1, unitPrice: 50 },
    ],
  };

  const summary = computeInvoiceSummary(invoice, [{ amount: 120, status: 'Completed' }]);

  assert.equal(summary.subtotal, 250);
  assert.equal(summary.taxAmount, 42.75);
  assert.equal(summary.total, 280.25);
  assert.equal(summary.balance, 160.25);
  assert.equal(summary.status, 'Overdue');
});

test('validatePayment rejects overpayments', () => {
  const invoice = {
    state: 'Sent',
    dueDate: '2024-08-31',
    discountPct: 0,
    taxRate: 0,
    lineItems: [{ quantity: 1, unitPrice: 100 }],
    payments: [{ amount: 50, status: 'Completed' }],
  };

  const result = validatePayment(invoice, 80);
  assert.equal(result.ok, false);
  assert.match(result.error, /exceeds/i);
});
