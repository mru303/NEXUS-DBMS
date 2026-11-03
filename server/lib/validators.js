import { z } from 'zod';

export const clientSchema = z.object({
  companyName: z.string().min(1),
  contactPerson: z.string().min(1),
  email: z.string().email(),
  phone: z.string().min(5).optional().or(z.literal('')),
  street: z.string().optional().or(z.literal('')),
  city: z.string().optional().or(z.literal('')),
  state: z.string().optional().or(z.literal('')),
  pincode: z.string().optional().or(z.literal('')),
  country: z.string().optional().or(z.literal('India')),
  gstin: z.string().optional().or(z.literal('')),
  status: z.enum(['Active', 'Prospect', 'Inactive']).default('Active'),
  accountManagerId: z.string().min(1),
});

export const projectSchema = z.object({
  name: z.string().min(1),
  clientId: z.string().min(1),
  description: z.string().optional().or(z.literal('')),
  managerId: z.string().min(1),
  memberIds: z.array(z.string()).default([]),
  startDate: z.string().min(1),
  deadline: z.string().min(1),
  budget: z.number().nonnegative(),
  billingRate: z.number().nonnegative(),
  status: z.enum(['Planning', 'In Progress', 'On Hold', 'Completed', 'Cancelled']).default('Planning'),
  priority: z.enum(['Low', 'Medium', 'High', 'Urgent']).default('Medium'),
});

export const taskSchema = z.object({
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

export const invoiceItemSchema = z.object({
  description: z.string().min(1),
  quantity: z.number().positive(),
  unitPrice: z.number().nonnegative(),
});

export const invoiceSchema = z.object({
  clientId: z.string().min(1),
  projectId: z.string().min(1),
  issueDate: z.string().min(1),
  dueDate: z.string().min(1),
  discountPct: z.number().min(0).max(100).default(0),
  taxRate: z.number().min(0).max(100).default(18),
  state: z.enum(['Draft', 'Sent', 'Cancelled']).default('Draft'),
  notes: z.string().optional().or(z.literal('')),
  lineItems: z.array(invoiceItemSchema).min(1),
});

export const paymentSchema = z.object({
  invoiceId: z.string().min(1),
  date: z.string().min(1),
  amount: z.number().positive(),
  method: z.enum(['UPI', 'Bank Transfer', 'Credit/Debit Card', 'Cash', 'Cheque']),
  reference: z.string().optional().or(z.literal('')),
  status: z.enum(['Completed', 'Pending', 'Failed', 'Refunded']).default('Completed'),
  notes: z.string().optional().or(z.literal('')),
});
