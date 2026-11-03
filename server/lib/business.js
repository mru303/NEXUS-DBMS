export function calculateDurationHours(start, end) {
  if (!start || !end) return 0;
  const ms = new Date(end).getTime() - new Date(start).getTime();
  if (Number.isNaN(ms) || ms <= 0) return 0;
  return Number((ms / 3600000).toFixed(2));
}

export function computeInvoiceSummary(invoice, payments = []) {
  const subtotal = (invoice.lineItems || []).reduce((sum, item) => {
    const quantity = Number(item.quantity || 0);
    const unitPrice = Number(item.unitPrice || 0);
    return sum + quantity * unitPrice;
  }, 0);

  const discountPct = Number(invoice.discountPct || 0);
  const taxRate = Number(invoice.taxRate || 0);
  const taxable = subtotal - (subtotal * discountPct) / 100;
  const taxAmount = taxable * taxRate / 100;
  const total = taxable + taxAmount;
  const paid = (payments || []).reduce((sum, payment) => {
    if (payment.status === 'Completed' || payment.status === 'Pending') {
      return sum + Number(payment.amount || 0);
    }
    return sum;
  }, 0);
  const balance = Math.max(total - paid, 0);

  let status = 'Sent';
  if (invoice.state === 'Draft' || invoice.state === 'Cancelled') {
    status = invoice.state;
  } else if (balance <= 0.005) {
    status = 'Paid';
  } else if (new Date(invoice.dueDate) < new Date()) {
    status = 'Overdue';
  } else if (paid > 0) {
    status = 'Partially Paid';
  }

  return {
    subtotal: Number(subtotal.toFixed(2)),
    discountPct: Number(discountPct.toFixed(2)),
    taxable: Number(taxable.toFixed(2)),
    taxAmount: Number(taxAmount.toFixed(2)),
    total: Number(total.toFixed(2)),
    paid: Number(paid.toFixed(2)),
    balance: Number(balance.toFixed(2)),
    status,
  };
}

export function validatePayment(invoice, amount) {
  const summary = computeInvoiceSummary(invoice, (invoice.payments || []));
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, error: 'Payment amount must be greater than zero.' };
  }
  if (amount > summary.balance + 0.005) {
    return { ok: false, error: 'Payment exceeds the remaining invoice balance.' };
  }
  return { ok: true, remaining: Number((summary.balance - amount).toFixed(2)) };
}

export function buildDashboardStats({ clients = [], projects = [], tasks = [], invoices = [], payments = [] }) {
  const outstanding = invoices.reduce((sum, invoice) => {
    const summary = computeInvoiceSummary(invoice, payments.filter((payment) => payment.invoiceId === invoice.id));
    return sum + summary.balance;
  }, 0);

  const collected = payments.filter((p) => p.status === 'Completed').reduce((sum, p) => sum + Number(p.amount || 0), 0);
  const budget = projects.reduce((sum, project) => sum + Number(project.budget || 0), 0);

  return {
    clients: clients.length,
    projects: projects.length,
    tasks: tasks.length,
    invoices: invoices.length,
    revenue: Number(collected.toFixed(2)),
    outstanding: Number(outstanding.toFixed(2)),
    projectBudget: Number(budget.toFixed(2)),
  };
}
