/* ------------------------------------------------------------------
   Create / edit forms for every entity, rendered by <FormHost/> from the
   global UI store so any page (or the top bar) can open them.
------------------------------------------------------------------- */
import { useMemo, type FormEvent, type ReactNode } from 'react';
import { z } from 'zod';
import clsx from 'clsx';
import {
  CLIENT_STATUSES, PAYMENT_METHODS, PAYMENT_STATUSES, PRIORITIES, PROJECT_STATUSES, ROLES, TASK_STATUSES,
  type ID, type LineItem,
} from '../data/types';
import {
  createClientApi, createInvoiceApi, createPaymentApi, createProjectApi, createSessionApi, createTaskApi, createUserApi, getState,
  updateClientApi, updateInvoiceApi, updatePaymentApi, updateProjectApi, updateSessionApi, updateTaskApi, updateUserApi,
} from '../data/store';
import { closeForm, useUI, type FormRequest } from '../lib/ui';
import { useData } from '../lib/useData';
import { useZodForm } from '../lib/useForm';
import { addDays, fromLocalInput, hoursBetween, toLocalInput, today } from '../lib/dates';
import { duration, inr } from '../lib/format';
import { invoiceFinancials, invoiceTotals, isIntraState, payableBalance, round2 } from '../lib/selectors';
import { Modal, notify } from './ui/overlays';
import { Button, Field, SelectInput, TextArea, TextInput, Toggle } from './ui/primitives';
import { Icon } from './icons';
import { navigate } from '../lib/router';

export const INDIAN_STATES = [
  'Andhra Pradesh', 'Assam', 'Bihar', 'Chhattisgarh', 'Delhi', 'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jharkhand',
  'Karnataka', 'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Odisha', 'Punjab', 'Rajasthan', 'Tamil Nadu', 'Telangana',
  'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
];

const req = (msg: string) => z.string().trim().min(1, msg);
const money = (label: string) => z.coerce.number({ invalid_type_error: `${label} must be a number` }).min(0, `${label} can’t be negative`);

export function FormHost() {
  const form = useUI((s) => s.form);
  if (!form) return null;
  const key = `${form.kind}-${form.id ?? 'new'}`;
  switch (form.kind) {
    case 'project': return <ProjectForm key={key} req={form} />;
    case 'task': return <TaskForm key={key} req={form} />;
    case 'client': return <ClientForm key={key} req={form} />;
    case 'invoice': return <InvoiceForm key={key} req={form} />;
    case 'payment': return <PaymentForm key={key} req={form} />;
    case 'session': return <SessionForm key={key} req={form} />;
    case 'user': return <UserForm key={key} req={form} />;
  }
}

function FormGrid({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">{children}</div>;
}

function Footer({ onCancel, label, formId, extra }: { onCancel: () => void; label: string; formId: string; extra?: ReactNode }) {
  return (
    <>
      {extra}
      <Button onClick={onCancel}>Cancel</Button>
      <Button variant="primary" type="submit" form={formId}>{label}</Button>
    </>
  );
}

/* =============================== PROJECT =============================== */
const projectSchema = z.object({
  name: req('Give the project a name').max(80, 'Keep the name under 80 characters'),
  clientId: req('Choose a client'),
  description: z.string().max(500, 'Keep the description under 500 characters'),
  managerId: req('Choose a project manager'),
  memberIds: z.array(z.string()),
  startDate: req('Pick a start date'),
  deadline: req('Pick a deadline'),
  budget: money('Budget'),
  billingRate: money('Billing rate'),
  status: z.enum(PROJECT_STATUSES),
  priority: z.enum(PRIORITIES),
}).refine((v) => v.deadline >= v.startDate, { path: ['deadline'], message: 'Deadline must be on or after the start date' });

function ProjectForm({ req: r }: { req: FormRequest }) {
  const { fullDb } = useData();
  const existing = r.id ? fullDb.projects.find((p) => p.id === r.id) : undefined;
  const staff = fullDb.users.filter((u) => u.role !== 'Client' && (u.status === 'Active' || existing?.memberIds.includes(u.id)));
  const managers = fullDb.users.filter((u) => (u.role === 'Project Manager' || u.role === 'Administrator') && (u.status === 'Active' || u.id === existing?.managerId));
  const f = useZodForm(projectSchema, {
    name: existing?.name ?? '',
    clientId: existing?.clientId ?? (r.defaults?.clientId as string) ?? '',
    description: existing?.description ?? '',
    managerId: existing?.managerId ?? (getState().currentUserId && managers.some((m) => m.id === getState().currentUserId) ? getState().currentUserId : ''),
    memberIds: existing?.memberIds ?? [],
    startDate: existing?.startDate ?? today(),
    deadline: existing?.deadline ?? addDays(today(), 60),
    budget: (existing?.budget ?? '') as unknown as number,
    billingRate: (existing?.billingRate ?? 1800) as unknown as number,
    status: existing?.status ?? 'Planning',
    priority: existing?.priority ?? 'Medium',
  });
  const v = f.values;
  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const data = f.submit();
    if (!data) return;
    const res = existing ? await updateProjectApi(existing.id, data) : await createProjectApi(data);
    if (notify(res)) {
      closeForm();
      if (!existing && res.ok) navigate(`/projects/${res.value}`);
    }
  };
  const toggleMember = (id: ID) => f.set('memberIds', v.memberIds.includes(id) ? v.memberIds.filter((m) => m !== id) : [...v.memberIds, id]);
  return (
    <Modal open onClose={closeForm} size="lg" title={existing ? `Edit ${existing.name}` : 'New project'} description={existing ? existing.id : 'Projects belong to one client and are split into tasks.'}
      footer={<Footer onCancel={closeForm} formId="project-form" label={existing ? 'Save changes' : 'Create project'} />}>
      <form id="project-form" onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        <TextInput label="Project name" required value={v.name} onChange={(e) => f.set('name', e.target.value)} error={f.err('name')} placeholder="e.g. Customer portal redesign" />
        <FormGrid>
          <SelectInput label="Client" required value={v.clientId} onChange={(e) => f.set('clientId', e.target.value)} error={f.err('clientId')}>
            <option value="">Select a client…</option>
            {fullDb.clients.filter((c) => c.status !== 'Inactive' || c.id === v.clientId).map((c) => <option key={c.id} value={c.id}>{c.companyName}</option>)}
          </SelectInput>
          <SelectInput label="Project manager" required value={v.managerId} onChange={(e) => f.set('managerId', e.target.value)} error={f.err('managerId')}>
            <option value="">Select a manager…</option>
            {managers.map((u) => <option key={u.id} value={u.id}>{u.fullName}</option>)}
          </SelectInput>
        </FormGrid>
        <TextArea label="Description" value={v.description} onChange={(e) => f.set('description', e.target.value)} error={f.err('description')} placeholder="What will be delivered?" />
        <FormGrid>
          <TextInput label="Start date" type="date" required value={v.startDate} onChange={(e) => f.set('startDate', e.target.value)} error={f.err('startDate')} />
          <TextInput label="Deadline" type="date" required value={v.deadline} onChange={(e) => f.set('deadline', e.target.value)} error={f.err('deadline')} />
          <TextInput label="Budget (₹)" type="number" min={0} step={1000} inputMode="numeric" value={String(v.budget)} onChange={(e) => f.set('budget', e.target.value as unknown as number)} error={f.err('budget')} placeholder="5,00,000" />
          <TextInput label="Billing rate (₹ / hour)" type="number" min={0} step={50} inputMode="numeric" value={String(v.billingRate)} onChange={(e) => f.set('billingRate', e.target.value as unknown as number)} error={f.err('billingRate')} />
          <SelectInput label="Status" value={v.status} onChange={(e) => f.set('status', e.target.value as typeof v.status)}>
            {PROJECT_STATUSES.map((s) => <option key={s}>{s}</option>)}
          </SelectInput>
          <SelectInput label="Priority" value={v.priority} onChange={(e) => f.set('priority', e.target.value as typeof v.priority)}>
            {PRIORITIES.map((s) => <option key={s}>{s}</option>)}
          </SelectInput>
        </FormGrid>
        <Field label={`Team members (${v.memberIds.length})`} hint="People who can be assigned tasks on this project.">
          <div className="grid max-h-44 grid-cols-1 gap-1 overflow-y-auto rounded-lg border border-line bg-raised p-1.5 sm:grid-cols-2">
            {staff.map((u) => (
              <label key={u.id} className={clsx('flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-[13px] hover:bg-hover', v.memberIds.includes(u.id) ? 'text-ink' : 'text-ink-2')}>
                <input type="checkbox" className="accent-[var(--c-accent)]" checked={v.memberIds.includes(u.id)} onChange={() => toggleMember(u.id)} />
                <span className="truncate">{u.fullName}</span>
                <span className="ml-auto truncate text-xs text-ink-3">{u.department}</span>
              </label>
            ))}
          </div>
        </Field>
      </form>
    </Modal>
  );
}

/* =============================== TASK =============================== */
const taskSchema = z.object({
  title: req('Give the task a title').max(100, 'Keep the title under 100 characters'),
  projectId: req('Choose a project'),
  description: z.string().max(600),
  assigneeId: z.string(),
  priority: z.enum(PRIORITIES),
  status: z.enum(TASK_STATUSES),
  startDate: req('Pick a start date'),
  dueDate: req('Pick a due date'),
  estimatedHours: z.coerce.number({ invalid_type_error: 'Enter hours as a number' }).min(0, 'Hours can’t be negative').max(500, 'That’s more than 500 hours — split the task'),
}).refine((v) => v.dueDate >= v.startDate, { path: ['dueDate'], message: 'Due date must be on or after the start date' });

function TaskForm({ req: r }: { req: FormRequest }) {
  const { fullDb, db } = useData();
  const existing = r.id ? fullDb.tasks.find((t) => t.id === r.id) : undefined;
  const f = useZodForm(taskSchema, {
    title: existing?.title ?? '',
    projectId: existing?.projectId ?? (r.defaults?.projectId as string) ?? '',
    description: existing?.description ?? '',
    assigneeId: existing?.assigneeId ?? '',
    priority: existing?.priority ?? 'Medium',
    status: existing?.status ?? ((r.defaults?.status as typeof TASK_STATUSES[number]) || 'To Do'),
    startDate: existing?.startDate ?? today(),
    dueDate: existing?.dueDate ?? addDays(today(), 7),
    estimatedHours: (existing?.estimatedHours ?? 8) as number,
  });
  const v = f.values;
  const project = fullDb.projects.find((p) => p.id === v.projectId);
  const members = fullDb.users.filter((u) => u.role !== 'Client' && (u.status === 'Active' || u.id === v.assigneeId));
  const inTeam = members.filter((u) => project?.memberIds.includes(u.id) || project?.managerId === u.id);
  const others = members.filter((u) => !inTeam.includes(u));
  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const data = f.submit();
    if (!data) return;
    const payload = { ...data, assigneeId: data.assigneeId || null };
    if (notify(existing ? await updateTaskApi(existing.id, payload) : await createTaskApi(payload))) closeForm();
  };
  return (
    <Modal open onClose={closeForm} size="lg" title={existing ? 'Edit task' : 'New task'} description={existing?.id}
      footer={<Footer onCancel={closeForm} formId="task-form" label={existing ? 'Save changes' : 'Create task'} />}>
      <form id="task-form" onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        <TextInput label="Title" required value={v.title} onChange={(e) => f.set('title', e.target.value)} error={f.err('title')} placeholder="e.g. Build the checkout page" />
        <FormGrid>
          <SelectInput label="Project" required value={v.projectId} onChange={(e) => f.set('projectId', e.target.value)} error={f.err('projectId')}>
            <option value="">Select a project…</option>
            {db.projects.filter((p) => p.status !== 'Cancelled' || p.id === v.projectId).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </SelectInput>
          <SelectInput label="Assignee" value={v.assigneeId} onChange={(e) => f.set('assigneeId', e.target.value)}>
            <option value="">Unassigned</option>
            {inTeam.length > 0 && <optgroup label="Project team">{inTeam.map((u) => <option key={u.id} value={u.id}>{u.fullName}</option>)}</optgroup>}
            <optgroup label={inTeam.length ? 'Others' : 'People'}>{others.map((u) => <option key={u.id} value={u.id}>{u.fullName}</option>)}</optgroup>
          </SelectInput>
        </FormGrid>
        <TextArea label="Description" value={v.description} onChange={(e) => f.set('description', e.target.value)} placeholder="Acceptance criteria, links, notes…" />
        <FormGrid>
          <SelectInput label="Status" value={v.status} onChange={(e) => f.set('status', e.target.value as typeof v.status)}>
            {TASK_STATUSES.map((s) => <option key={s}>{s}</option>)}
          </SelectInput>
          <SelectInput label="Priority" value={v.priority} onChange={(e) => f.set('priority', e.target.value as typeof v.priority)}>
            {PRIORITIES.map((s) => <option key={s}>{s}</option>)}
          </SelectInput>
          <TextInput label="Start date" type="date" required value={v.startDate} onChange={(e) => f.set('startDate', e.target.value)} error={f.err('startDate')} />
          <TextInput label="Due date" type="date" required value={v.dueDate} onChange={(e) => f.set('dueDate', e.target.value)} error={f.err('dueDate')} />
          <TextInput label="Estimated hours" type="number" min={0} step={0.5} value={String(v.estimatedHours)} onChange={(e) => f.set('estimatedHours', e.target.value as unknown as number)} error={f.err('estimatedHours')} />
        </FormGrid>
      </form>
    </Modal>
  );
}

/* =============================== CLIENT =============================== */
const clientSchema = z.object({
  companyName: req('Enter the company name').max(100),
  contactPerson: req('Enter a contact person'),
  email: z.string().trim().email('Enter a valid email address'),
  phone: z.string().trim().regex(/^\+?[\d\s-]{10,16}$/, 'Enter a valid phone number, e.g. +91 98200 12345'),
  street: req('Enter the street address'),
  city: req('Enter the city'),
  state: req('Choose a state'),
  pincode: z.string().trim().regex(/^\d{6}$/, 'PIN code must be 6 digits'),
  country: req('Enter the country'),
  gstin: z.string().trim().toUpperCase().refine((s) => s === '' || /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(s), 'GSTIN should be 15 characters, e.g. 27AAKCS4821M1Z5'),
  status: z.enum(CLIENT_STATUSES),
  accountManagerId: req('Choose an account manager'),
});

function ClientForm({ req: r }: { req: FormRequest }) {
  const { fullDb, user } = useData();
  const existing = r.id ? fullDb.clients.find((c) => c.id === r.id) : undefined;
  const managers = fullDb.users.filter((u) => u.role !== 'Client' && u.role !== 'Employee' && (u.status === 'Active' || u.id === existing?.accountManagerId));
  const f = useZodForm(clientSchema, {
    companyName: existing?.companyName ?? '',
    contactPerson: existing?.contactPerson ?? '',
    email: existing?.email ?? '',
    phone: existing?.phone ?? '',
    street: existing?.street ?? '',
    city: existing?.city ?? '',
    state: existing?.state ?? 'Maharashtra',
    pincode: existing?.pincode ?? '',
    country: existing?.country ?? 'India',
    gstin: existing?.gstin ?? '',
    status: existing?.status ?? 'Active',
    accountManagerId: existing?.accountManagerId ?? (managers.some((m) => m.id === user.id) ? user.id : ''),
  });
  const v = f.values;
  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const data = f.submit();
    if (!data) return;
    const res = existing ? await updateClientApi(existing.id, data) : await createClientApi(data);
    if (notify(res)) {
      closeForm();
      if (!existing && res.ok) navigate(`/clients/${res.value}`);
    }
  };
  return (
    <Modal open onClose={closeForm} size="lg" title={existing ? `Edit ${existing.companyName}` : 'New client'} description={existing?.id ?? 'Billing details appear on every invoice.'}
      footer={<Footer onCancel={closeForm} formId="client-form" label={existing ? 'Save changes' : 'Add client'} />}>
      <form id="client-form" onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        <FormGrid>
          <TextInput label="Company name" required value={v.companyName} onChange={(e) => f.set('companyName', e.target.value)} error={f.err('companyName')} placeholder="e.g. Saffron Leaf Organics Pvt Ltd" />
          <TextInput label="Contact person" required value={v.contactPerson} onChange={(e) => f.set('contactPerson', e.target.value)} error={f.err('contactPerson')} />
          <TextInput label="Email" type="email" required value={v.email} onChange={(e) => f.set('email', e.target.value)} error={f.err('email')} placeholder="accounts@company.in" />
          <TextInput label="Phone" type="tel" required value={v.phone} onChange={(e) => f.set('phone', e.target.value)} error={f.err('phone')} placeholder="+91 98200 12345" />
        </FormGrid>
        <TextInput label="Billing address" required value={v.street} onChange={(e) => f.set('street', e.target.value)} error={f.err('street')} placeholder="Building, street, area" />
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <TextInput label="City" required value={v.city} onChange={(e) => f.set('city', e.target.value)} error={f.err('city')} />
          <SelectInput label="State" required value={v.state} onChange={(e) => f.set('state', e.target.value)} error={f.err('state')}>
            {INDIAN_STATES.map((s) => <option key={s}>{s}</option>)}
          </SelectInput>
          <TextInput label="PIN code" required inputMode="numeric" maxLength={6} value={v.pincode} onChange={(e) => f.set('pincode', e.target.value)} error={f.err('pincode')} />
          <TextInput label="Country" required value={v.country} onChange={(e) => f.set('country', e.target.value)} error={f.err('country')} />
        </div>
        <FormGrid>
          <TextInput label="GSTIN" value={v.gstin} onChange={(e) => f.set('gstin', e.target.value.toUpperCase())} error={f.err('gstin')} placeholder="27AAKCS4821M1Z5" hint="Optional for unregistered businesses." maxLength={15} />
          <SelectInput label="Status" value={v.status} onChange={(e) => f.set('status', e.target.value as typeof v.status)}>
            {CLIENT_STATUSES.map((s) => <option key={s}>{s}</option>)}
          </SelectInput>
          <SelectInput label="Account manager" required value={v.accountManagerId} onChange={(e) => f.set('accountManagerId', e.target.value)} error={f.err('accountManagerId')}>
            <option value="">Select…</option>
            {managers.map((u) => <option key={u.id} value={u.id}>{u.fullName} · {u.role}</option>)}
          </SelectInput>
        </FormGrid>
      </form>
    </Modal>
  );
}

/* =============================== INVOICE =============================== */
const lineSchema = z.object({
  id: z.string(),
  description: req('Describe the item'),
  quantity: z.coerce.number({ invalid_type_error: 'Number' }).gt(0, 'Must be > 0'),
  unitPrice: z.coerce.number({ invalid_type_error: 'Number' }).min(0, 'Can’t be negative'),
});
const invoiceSchema = z.object({
  clientId: req('Choose a client'),
  projectId: req('Choose a project'),
  issueDate: req('Pick an issue date'),
  dueDate: req('Pick a due date'),
  lineItems: z.array(lineSchema).min(1, 'Add at least one line item'),
  discountPct: z.coerce.number().min(0, 'Discount can’t be negative').max(100, 'Discount can’t exceed 100%'),
  taxRate: z.coerce.number().min(0).max(28),
  notes: z.string().max(400),
}).refine((v) => v.dueDate >= v.issueDate, { path: ['dueDate'], message: 'Due date must be on or after the issue date' });

let lineSeq = 1;
const newLine = (description = '', quantity = 1, unitPrice = 0): LineItem => ({ id: `new-${Date.now()}-${lineSeq++}`, description, quantity, unitPrice });

function InvoiceForm({ req: r }: { req: FormRequest }) {
  const { fullDb } = useData();
  const settings = getState().settings;
  const existing = r.id ? fullDb.invoices.find((i) => i.id === r.id) : undefined;
  const presetProject = fullDb.projects.find((p) => p.id === (r.defaults?.projectId as string));
  const f = useZodForm(invoiceSchema, {
    clientId: existing?.clientId ?? presetProject?.clientId ?? (r.defaults?.clientId as string) ?? '',
    projectId: existing?.projectId ?? presetProject?.id ?? '',
    issueDate: existing?.issueDate ?? today(),
    dueDate: existing?.dueDate ?? addDays(today(), settings.paymentTermsDays),
    lineItems: existing?.lineItems.map((l) => ({ ...l })) ?? [newLine('', 1, presetProject?.billingRate ?? 0)],
    discountPct: existing?.discountPct ?? 0,
    taxRate: existing?.taxRate ?? settings.defaultTaxRate,
    notes: existing?.notes ?? '',
  });
  const v = f.values;
  const projects = fullDb.projects.filter((p) => p.clientId === v.clientId);
  const project = fullDb.projects.find((p) => p.id === v.projectId);
  const client = fullDb.clients.find((c) => c.id === v.clientId);
  const totals = invoiceTotals({ lineItems: v.lineItems.map((l) => ({ ...l, quantity: Number(l.quantity), unitPrice: Number(l.unitPrice) })), discountPct: Number(v.discountPct), taxRate: Number(v.taxRate) });
  const intraState = isIntraState(client, settings.companyGstin);
  const fin = existing ? invoiceFinancials(existing, fullDb.payments) : null;

  const setLine = (i: number, p: Partial<LineItem>) => f.set('lineItems', v.lineItems.map((l, idx) => (idx === i ? { ...l, ...p } : l)));
  const removeLine = (i: number) => f.set('lineItems', v.lineItems.filter((_, idx) => idx !== i));

  // Suggest lines from billable hours logged per task on the project
  const suggestions = useMemo(() => {
    if (!project) return [];
    const tasks = fullDb.tasks.filter((t) => t.projectId === project.id);
    return tasks.map((t) => {
      const hrs = fullDb.sessions.filter((s) => s.taskId === t.id && s.billable).reduce((h, s) => h + hoursBetween(s.start, s.end), 0);
      return { task: t, hours: round2(hrs) };
    }).filter((s) => s.hours > 0);
  }, [project, fullDb]);

  const save = async (state: 'Draft' | 'Sent' | 'keep') => {
    const data = f.submit();
    if (!data) return;
    const payload = { ...data, state: state === 'keep' ? existing!.state : state };
    const res = existing ? await updateInvoiceApi(existing.id, payload) : await createInvoiceApi(payload);
    if (notify(res)) {
      closeForm();
      if (res.ok) navigate(`/invoices/${res.value}`);
    }
  };

  return (
    <Modal open onClose={closeForm} size="xl" title={existing ? `Edit invoice ${existing.number}` : 'Create invoice'} description={existing ? `${existing.id} · ${fin?.status}` : 'GST is calculated automatically. Nothing is emailed — “mark as sent” is a status change.'}
      footer={existing ? (
        <><Button onClick={closeForm}>Cancel</Button><Button variant="primary" onClick={() => save('keep')}>Save changes</Button></>
      ) : (
        <><Button onClick={closeForm}>Cancel</Button><Button onClick={() => save('Draft')}>Save as draft</Button><Button variant="primary" icon={<Icon.send size={15} />} onClick={() => save('Sent')}>Save &amp; mark as sent</Button></>
      )}>
      <form onSubmit={(e) => { e.preventDefault(); save(existing ? 'keep' : 'Draft'); }} noValidate className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_280px]">
        <div className="flex min-w-0 flex-col gap-4">
          <FormGrid>
            <SelectInput label="Client" required value={v.clientId} onChange={(e) => f.patch({ clientId: e.target.value, projectId: '' })} error={f.err('clientId')} disabled={!!fin && fin.paid > 0}>
              <option value="">Select a client…</option>
              {fullDb.clients.filter((c) => c.status !== 'Inactive' || c.id === v.clientId).map((c) => <option key={c.id} value={c.id}>{c.companyName}</option>)}
            </SelectInput>
            <SelectInput label="Project" required value={v.projectId} onChange={(e) => f.set('projectId', e.target.value)} error={f.err('projectId')} disabled={!v.clientId} hint={!v.clientId ? 'Pick a client first.' : projects.length === 0 ? 'This client has no projects yet.' : undefined}>
              <option value="">Select a project…</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </SelectInput>
            <TextInput label="Issue date" type="date" required value={v.issueDate} onChange={(e) => f.patch({ issueDate: e.target.value, ...(existing ? {} : { dueDate: addDays(e.target.value, settings.paymentTermsDays) }) })} error={f.err('issueDate')} />
            <TextInput label="Due date" type="date" required value={v.dueDate} onChange={(e) => f.set('dueDate', e.target.value)} error={f.err('dueDate')} hint={`Default terms: ${settings.paymentTermsDays} days`} />
          </FormGrid>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <p className="text-[13px] font-medium text-ink-2">Line items</p>
              <span className="text-xs text-ink-3">Quantity × unit price</span>
            </div>
            <div className="overflow-hidden rounded-lg border border-line">
              <div className="hidden grid-cols-[1fr_84px_120px_110px_36px] gap-2 border-b border-line bg-raised px-3 py-2 text-xs font-medium text-ink-3 sm:grid">
                <span>Description</span><span className="text-right">Qty</span><span className="text-right">Unit price (₹)</span><span className="text-right">Amount</span><span />
              </div>
              {v.lineItems.map((l, i) => (
                <div key={l.id} className="grid grid-cols-[1fr_1fr_36px] gap-2 border-b border-line px-3 py-2.5 last:border-0 sm:grid-cols-[1fr_84px_120px_110px_36px] sm:items-start">
                  <div className="col-span-3 sm:col-span-1">
                    <input aria-label={`Line ${i + 1} description`} className="field h-9!" value={l.description} onChange={(e) => setLine(i, { description: e.target.value })} placeholder="e.g. UI design — 24 hours" aria-invalid={!!f.err(`lineItems.${i}.description`)} />
                    {f.err(`lineItems.${i}.description`) && <p className="mt-1 text-xs text-danger">{f.err(`lineItems.${i}.description`)}</p>}
                  </div>
                  <input aria-label={`Line ${i + 1} quantity`} type="number" min={0} step="0.25" className="field num h-9! text-right" value={String(l.quantity)} onChange={(e) => setLine(i, { quantity: e.target.value as unknown as number })} aria-invalid={!!f.err(`lineItems.${i}.quantity`)} />
                  <input aria-label={`Line ${i + 1} unit price`} type="number" min={0} step="100" className="field num h-9! text-right" value={String(l.unitPrice)} onChange={(e) => setLine(i, { unitPrice: e.target.value as unknown as number })} aria-invalid={!!f.err(`lineItems.${i}.unitPrice`)} />
                  <p className="num hidden h-9 items-center justify-end text-[13.5px] font-medium text-ink sm:flex">{inr((Number(l.quantity) || 0) * (Number(l.unitPrice) || 0), true)}</p>
                  <button type="button" onClick={() => removeLine(i)} disabled={v.lineItems.length === 1} className="flex size-9 items-center justify-center rounded-lg text-ink-3 hover:bg-hover hover:text-danger disabled:opacity-30" aria-label={`Remove line ${i + 1}`}><Icon.trash size={15} /></button>
                </div>
              ))}
            </div>
            {f.err('lineItems') && <p className="mt-1 text-xs text-danger">{f.err('lineItems')}</p>}
            <div className="mt-2 flex flex-wrap gap-2">
              <Button size="sm" variant="ghost" icon={<Icon.plus size={15} />} onClick={() => f.set('lineItems', [...v.lineItems, newLine('', 1, project?.billingRate ?? 0)])}>Add line</Button>
              {suggestions.length > 0 && (
                <select
                  aria-label="Add logged hours from a task"
                  className="field h-8! w-auto! text-[13px]"
                  value=""
                  onChange={(e) => {
                    const s = suggestions.find((x) => x.task.id === e.target.value);
                    if (s && project) f.set('lineItems', [...v.lineItems.filter((l) => l.description || Number(l.unitPrice) > 0), newLine(`${s.task.title} (${s.hours} h logged)`, s.hours, project.billingRate)]);
                  }}
                >
                  <option value="">+ Add logged hours from a task…</option>
                  {suggestions.map((s) => <option key={s.task.id} value={s.task.id}>{s.task.title} — {s.hours} h</option>)}
                </select>
              )}
            </div>
          </div>
          <TextArea label="Notes on invoice" value={v.notes} onChange={(e) => f.set('notes', e.target.value)} placeholder="Shown to the client under the totals." />
        </div>

        <aside className="flex flex-col gap-4 rounded-lg border border-line bg-raised p-4 lg:self-start">
          <div className="grid grid-cols-2 gap-3">
            <TextInput label="Discount %" type="number" min={0} max={100} step={0.5} value={String(v.discountPct)} onChange={(e) => f.set('discountPct', e.target.value as unknown as number)} error={f.err('discountPct')} />
            <SelectInput label="GST rate" value={String(v.taxRate)} onChange={(e) => f.set('taxRate', Number(e.target.value))}>
              {[0, 5, 12, 18, 28].map((r) => <option key={r} value={r}>{r}%</option>)}
            </SelectInput>
          </div>
          <dl className="flex flex-col gap-2 border-t border-line pt-4 text-[13px]">
            <Row k="Subtotal" v={inr(totals.subtotal, true)} />
            {totals.discount > 0 && <Row k={`Discount (${v.discountPct}%)`} v={`− ${inr(totals.discount, true)}`} />}
            <Row k="Taxable value" v={inr(totals.taxable, true)} />
            {intraState ? (
              <>
                <Row k={`CGST ${Number(v.taxRate) / 2}%`} v={inr(totals.tax / 2, true)} />
                <Row k={`SGST ${Number(v.taxRate) / 2}%`} v={inr(totals.tax / 2, true)} />
              </>
            ) : <Row k={`IGST ${v.taxRate}%`} v={inr(totals.tax, true)} />}
            <div className="mt-1 flex items-baseline justify-between border-t border-line pt-3">
              <dt className="font-medium text-ink">Total</dt>
              <dd className="num text-lg font-semibold text-ink">{inr(totals.total, true)}</dd>
            </div>
            {fin && fin.paid > 0 && <Row k="Already paid" v={inr(fin.paid, true)} />}
          </dl>
          <p className="text-xs leading-relaxed text-ink-3">
            {client ? (intraState ? 'Same state as Nexus Studio (Maharashtra): GST is split into CGST + SGST.' : `Inter-state supply to ${client.state}: IGST applies.`) : 'Pick a client to see how GST is split.'}
          </p>
        </aside>
      </form>
    </Modal>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-ink-3">{k}</dt>
      <dd className="num text-ink-2">{v}</dd>
    </div>
  );
}

/* =============================== PAYMENT =============================== */
const paymentSchema = z.object({
  invoiceId: req('Choose an invoice'),
  date: req('Pick the payment date'),
  amount: z.coerce.number({ invalid_type_error: 'Enter an amount' }).gt(0, 'Amount must be greater than zero'),
  method: z.enum(PAYMENT_METHODS),
  reference: z.string().trim().max(60),
  status: z.enum(PAYMENT_STATUSES),
  notes: z.string().max(300),
}).refine((v) => v.method === 'Cash' || v.reference.length > 0, { path: ['reference'], message: 'Add the UTR / UPI reference / cheque number' })
  .refine((v) => v.date <= today(), { path: ['date'], message: 'Payment date can’t be in the future' });

function PaymentForm({ req: r }: { req: FormRequest }) {
  const { fullDb } = useData();
  const existing = r.id ? fullDb.payments.find((p) => p.id === r.id) : undefined;
  const payable = fullDb.invoices
    .filter((i) => i.state === 'Sent' && (payableBalance(i, fullDb.payments, existing?.id) > 0.004 || i.id === existing?.invoiceId))
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const presetInvoice = (r.defaults?.invoiceId as string) ?? '';
  const initialInvoice = existing?.invoiceId ?? presetInvoice;
  const initialInv = fullDb.invoices.find((i) => i.id === initialInvoice);
  const f = useZodForm(paymentSchema, {
    invoiceId: initialInvoice,
    date: existing?.date ?? today(),
    amount: (existing?.amount ?? (initialInv ? payableBalance(initialInv, fullDb.payments) : '')) as number,
    method: existing?.method ?? 'Bank Transfer',
    reference: existing?.reference ?? '',
    status: existing?.status ?? 'Completed',
    notes: existing?.notes ?? '',
  });
  const v = f.values;
  const inv = fullDb.invoices.find((i) => i.id === v.invoiceId);
  const fin = inv ? invoiceFinancials(inv, fullDb.payments.filter((p) => p.id !== existing?.id)) : null;
  const cap = inv ? payableBalance(inv, fullDb.payments, existing?.id) : 0;
  const amt = Number(v.amount) || 0;
  const over = inv && (v.status === 'Completed' || v.status === 'Pending') && amt > cap + 0.004;
  const after = fin ? round2(Math.max(0, fin.balance - (v.status === 'Completed' ? amt : 0))) : 0;
  const clientName = (id: ID) => fullDb.clients.find((c) => c.id === id)?.companyName ?? '';

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const data = f.submit();
    if (!data || over) return;
    if (notify(existing ? await updatePaymentApi(existing.id, data) : await createPaymentApi(data))) closeForm();
  };
  const refLabel = { UPI: 'UPI reference (RRN)', 'Bank Transfer': 'UTR / NEFT reference', 'Credit/Debit Card': 'Gateway transaction ID', Cash: 'Receipt number (optional)', Cheque: 'Cheque number' }[v.method];

  return (
    <Modal open onClose={closeForm} size="md" title={existing ? `Edit payment ${existing.id}` : 'Record payment'} description="The invoice’s amount paid, balance and status update automatically."
      footer={<Footer onCancel={closeForm} formId="payment-form" label={existing ? 'Save payment' : 'Record payment'} />}>
      <form id="payment-form" onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        <SelectInput label="Invoice" required value={v.invoiceId} onChange={(e) => {
          const i = fullDb.invoices.find((x) => x.id === e.target.value);
          f.patch({ invoiceId: e.target.value, amount: (i ? payableBalance(i, fullDb.payments, existing?.id) : '') as number });
        }} error={f.err('invoiceId')} hint={payable.length === 0 ? 'No sent invoices have a balance due.' : undefined}>
          <option value="">Select an invoice with a balance…</option>
          {payable.map((i) => <option key={i.id} value={i.id}>{i.number} · {clientName(i.clientId)} · {inr(payableBalance(i, fullDb.payments, existing?.id))} due</option>)}
        </SelectInput>
        {inv && fin && (
          <div className="grid grid-cols-3 gap-3 rounded-lg border border-line bg-raised p-3 text-[13px]">
            <div><p className="text-ink-3">Invoice total</p><p className="num font-medium text-ink">{inr(fin.total, true)}</p></div>
            <div><p className="text-ink-3">Paid so far</p><p className="num font-medium text-ink">{inr(fin.paid, true)}{fin.pending > 0 && <span className="block text-xs font-normal text-warning">+ {inr(fin.pending)} pending</span>}</p></div>
            <div><p className="text-ink-3">Balance after</p><p className={clsx('num font-medium', after <= 0.004 ? 'text-success' : 'text-ink')}>{inr(after, true)}</p></div>
          </div>
        )}
        <FormGrid>
          <TextInput label="Amount (₹)" type="number" min={0} step="0.01" required value={String(v.amount)} onChange={(e) => f.set('amount', e.target.value as unknown as number)}
            error={f.err('amount') ?? (over ? `Exceeds the remaining balance of ${inr(cap, true)}. Overpayments aren’t accepted.` : undefined)} />
          <TextInput label="Payment date" type="date" max={today()} required value={v.date} onChange={(e) => f.set('date', e.target.value)} error={f.err('date')} />
          <SelectInput label="Method" value={v.method} onChange={(e) => f.set('method', e.target.value as typeof v.method)}>
            {PAYMENT_METHODS.map((m) => <option key={m}>{m}</option>)}
          </SelectInput>
          <SelectInput label="Status" value={v.status} onChange={(e) => f.set('status', e.target.value as typeof v.status)} hint={v.status === 'Pending' ? 'Pending amounts reserve the balance but don’t count as paid yet.' : undefined}>
            {PAYMENT_STATUSES.map((m) => <option key={m}>{m}</option>)}
          </SelectInput>
        </FormGrid>
        <TextInput label={refLabel} required={v.method !== 'Cash'} value={v.reference} onChange={(e) => f.set('reference', e.target.value)} error={f.err('reference')} />
        <TextArea label="Notes" value={v.notes} onChange={(e) => f.set('notes', e.target.value)} rows={2} />
      </form>
    </Modal>
  );
}

/* =============================== WORK SESSION =============================== */
const sessionSchema = z.object({
  userId: req('Choose who did the work'),
  taskId: req('Choose a task'),
  start: req('Enter the start time'),
  end: req('Enter the end time'),
  hourlyRate: money('Rate'),
  billable: z.boolean(),
  notes: z.string().max(300),
}).refine((v) => v.end > v.start, { path: ['end'], message: 'End time must be after the start time' })
  .refine((v) => new Date(v.end).getTime() <= Date.now() + 60000, { path: ['end'], message: 'Sessions can’t end in the future' })
  .refine((v) => (new Date(v.end).getTime() - new Date(v.start).getTime()) / 3600000 <= 16, { path: ['end'], message: 'A session can’t be longer than 16 hours' });

function SessionForm({ req: r }: { req: FormRequest }) {
  const { fullDb, db, user, can } = useData();
  const existing = r.id ? fullDb.sessions.find((s) => s.id === r.id) : undefined;
  const anyone = can('write:sessions:any');
  const now = new Date();
  const defEnd = new Date(Math.floor(now.getTime() / 900000) * 900000);
  const defStart = new Date(defEnd.getTime() - 2 * 3600000);
  const presetTask = fullDb.tasks.find((t) => t.id === (r.defaults?.taskId as string));
  const f = useZodForm(sessionSchema, {
    userId: existing?.userId ?? user.id,
    taskId: existing?.taskId ?? presetTask?.id ?? '',
    start: existing ? toLocalInput(existing.start) : toLocalInput(defStart.toISOString()),
    end: existing ? toLocalInput(existing.end) : toLocalInput(defEnd.toISOString()),
    hourlyRate: (existing?.hourlyRate ?? fullDb.projects.find((p) => p.id === presetTask?.projectId)?.billingRate ?? 0) as number,
    billable: existing?.billable ?? true,
    notes: existing?.notes ?? '',
  });
  const v = f.values;
  const hrs = v.start && v.end ? Math.max(0, hoursBetween(fromLocalInput(v.start), fromLocalInput(v.end))) : 0;
  const people = fullDb.users.filter((u) => u.role !== 'Client' && (u.status === 'Active' || u.id === v.userId));
  const openProjects = db.projects.filter((p) => p.status !== 'Cancelled' || db.tasks.some((t) => t.id === v.taskId && t.projectId === p.id));
  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const data = f.submit();
    if (!data) return;
    const payload = { ...data, start: fromLocalInput(data.start), end: fromLocalInput(data.end), notes: data.notes.trim() };
    if (notify(existing ? await updateSessionApi(existing.id, payload) : await createSessionApi(payload))) closeForm();
  };
  return (
    <Modal open onClose={closeForm} size="md" title={existing ? `Edit session ${existing.id}` : 'Log time manually'} description="For work that wasn’t tracked with the timer."
      footer={<Footer onCancel={closeForm} formId="session-form" label={existing ? 'Save session' : 'Log time'} />}>
      <form id="session-form" onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        <SelectInput label="Task" required value={v.taskId} onChange={(e) => {
          const t = fullDb.tasks.find((x) => x.id === e.target.value);
          const p = fullDb.projects.find((x) => x.id === t?.projectId);
          f.patch({ taskId: e.target.value, ...(p ? { hourlyRate: p.billingRate } : {}) });
        }} error={f.err('taskId')}>
          <option value="">Select a task…</option>
          {openProjects.map((p) => (
            <optgroup key={p.id} label={p.name}>
              {db.tasks.filter((t) => t.projectId === p.id).map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
            </optgroup>
          ))}
        </SelectInput>
        <SelectInput label="Team member" value={v.userId} onChange={(e) => f.set('userId', e.target.value)} disabled={!anyone} hint={!anyone ? 'You can only log your own time.' : undefined}>
          {people.map((u) => <option key={u.id} value={u.id}>{u.fullName}</option>)}
        </SelectInput>
        <FormGrid>
          <TextInput label="Start" type="datetime-local" required value={v.start} onChange={(e) => f.set('start', e.target.value)} error={f.err('start')} />
          <TextInput label="End" type="datetime-local" required value={v.end} onChange={(e) => f.set('end', e.target.value)} error={f.err('end')} />
          <TextInput label="Hourly rate (₹)" type="number" min={0} step={50} value={String(v.hourlyRate)} onChange={(e) => f.set('hourlyRate', e.target.value as unknown as number)} error={f.err('hourlyRate')} />
          <Field label="Duration · amount">
            <p className="num flex h-9 items-center text-[13.5px] text-ink">{duration(hrs)} · {v.billable ? inr(hrs * (Number(v.hourlyRate) || 0)) : 'not billable'}</p>
          </Field>
        </FormGrid>
        <Toggle label="Billable" description="Billable time can be added to the client’s next invoice." checked={v.billable} onChange={(b) => f.set('billable', b)} />
        <TextArea label="Notes" rows={2} value={v.notes} onChange={(e) => f.set('notes', e.target.value)} placeholder="What did you work on?" />
      </form>
    </Modal>
  );
}

/* =============================== USER =============================== */
const userSchema = z.object({
  fullName: req('Enter a full name'),
  email: z.string().trim().email('Enter a valid email address'),
  phone: z.string().trim().regex(/^\+?[\d\s-]{10,16}$/, 'Enter a valid phone number'),
  role: z.enum(ROLES),
  department: req('Enter a department'),
  status: z.enum(['Active', 'Inactive']),
  joinedAt: req('Pick a joining date'),
  clientId: z.string(),
}).refine((v) => v.role !== 'Client' || v.clientId, { path: ['clientId'], message: 'Client users must be linked to a client company' });

function UserForm({ req: r }: { req: FormRequest }) {
  const { fullDb } = useData();
  const existing = r.id ? fullDb.users.find((u) => u.id === r.id) : undefined;
  const f = useZodForm(userSchema, {
    fullName: existing?.fullName ?? '',
    email: existing?.email ?? '',
    phone: existing?.phone ?? '',
    role: existing?.role ?? 'Employee',
    department: existing?.department ?? '',
    status: existing?.status ?? 'Active',
    joinedAt: existing?.joinedAt ?? today(),
    clientId: existing?.clientId ?? '',
  });
  const v = f.values;
  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const data = f.submit();
    if (!data) return;
    const payload = { ...data, clientId: data.role === 'Client' ? data.clientId : undefined };
    if (notify(existing ? await updateUserApi(existing.id, payload) : await createUserApi(payload))) closeForm();
  };
  return (
    <Modal open onClose={closeForm} size="md" title={existing ? `Edit ${existing.fullName}` : 'Add team member'} description={existing?.id ?? 'Demo only — no invitation email is sent and no password is stored.'}
      footer={<Footer onCancel={closeForm} formId="user-form" label={existing ? 'Save changes' : 'Add member'} />}>
      <form id="user-form" onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        <FormGrid>
          <TextInput label="Full name" required value={v.fullName} onChange={(e) => f.set('fullName', e.target.value)} error={f.err('fullName')} />
          <TextInput label="Email" type="email" required value={v.email} onChange={(e) => f.set('email', e.target.value)} error={f.err('email')} />
          <TextInput label="Phone" type="tel" required value={v.phone} onChange={(e) => f.set('phone', e.target.value)} error={f.err('phone')} />
          <TextInput label="Department" required value={v.department} onChange={(e) => f.set('department', e.target.value)} error={f.err('department')} />
          <SelectInput label="Role" value={v.role} onChange={(e) => f.set('role', e.target.value as typeof v.role)}>
            {ROLES.map((x) => <option key={x}>{x}</option>)}
          </SelectInput>
          <SelectInput label="Status" value={v.status} onChange={(e) => f.set('status', e.target.value as typeof v.status)}>
            <option>Active</option><option>Inactive</option>
          </SelectInput>
          <TextInput label="Date joined" type="date" required value={v.joinedAt} onChange={(e) => f.set('joinedAt', e.target.value)} error={f.err('joinedAt')} />
          {v.role === 'Client' && (
            <SelectInput label="Client company" required value={v.clientId} onChange={(e) => f.set('clientId', e.target.value)} error={f.err('clientId')}>
              <option value="">Select…</option>
              {fullDb.clients.map((c) => <option key={c.id} value={c.id}>{c.companyName}</option>)}
            </SelectInput>
          )}
        </FormGrid>
      </form>
    </Modal>
  );
}
