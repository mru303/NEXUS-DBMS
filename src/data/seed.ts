/* ------------------------------------------------------------------
   Seed data — fictional Indian businesses and people.
   Every date is generated RELATIVE TO THE DAY THE APP IS FIRST OPENED,
   so "this month", "overdue" and "due soon" always look realistic during
   a demo. A fixed random seed keeps the data identical on every reset.
   Payments are computed from invoice totals so balances always reconcile.
------------------------------------------------------------------- */
import type {
  ActivityEntry, Client, Database, Invoice, LineItem, Payment, PaymentMethod, PaymentStatus, Priority,
  Project, Settings, Task, TaskStatus, User, WorkSession,
} from './types';
import { addDays, parseDate, today as todayFn } from '../lib/dates';
import { invoiceTotals, round2 } from '../lib/selectors';

function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pad = (n: number) => String(n).padStart(3, '0');

export const DEFAULT_SETTINGS: Settings = {
  workspaceName: 'Nexus Studio',
  companyName: 'Nexus Studio Pvt Ltd',
  companyAddress: 'Unit 402, Orbit Tech Park, Saki Vihar Road, Andheri East, Mumbai, Maharashtra 400072',
  companyEmail: 'accounts@nexusstudio.in',
  companyPhone: '+91 22 4012 7788',
  companyGstin: '27AAJCN5521K1Z8',
  companyPan: 'AAJCN5521K',
  bankName: 'HDFC Bank, Powai Branch',
  bankAccount: '50200071234567',
  bankIfsc: 'HDFC0000486',
  upiId: 'nexusstudio@hdfcbank',
  currency: 'INR',
  defaultTaxRate: 18,
  invoicePrefix: 'NX',
  paymentTermsDays: 15,
  invoiceFooter: 'Thank you for your business. Payments are due within the stated terms; interest at 1.5% per month may apply to overdue balances.',
  notifyOverdueInvoices: true,
  notifyTaskDeadlines: true,
  notifyPayments: true,
  theme: 'light',
  density: 'comfortable',
  uiV2: true,
};

export interface SeedResult {
  db: Database;
  activity: ActivityEntry[];
}

export function createSeed(now: string = todayFn()): SeedResult {
  const rand = mulberry32(20261022);
  const d = (offset: number) => addDays(now, offset);

  /* ------------------------------ users ------------------------------ */
  const userRows: [string, string, User['role'], string, User['status'], number, string?][] = [
    ['Alex Mehta', 'alex.mehta', 'Administrator', 'Management', 'Active', -900],
    ['Priya Nair', 'priya.nair', 'Project Manager', 'Delivery', 'Active', -760],
    ['Arjun Kulkarni', 'arjun.kulkarni', 'Project Manager', 'Delivery', 'Active', -540],
    ['Rohan Deshpande', 'rohan.deshpande', 'Employee', 'Frontend Engineering', 'Active', -480],
    ['Sneha Iyer', 'sneha.iyer', 'Employee', 'Backend Engineering', 'Active', -430],
    ['Kabir Shah', 'kabir.shah', 'Employee', 'Product Design', 'Active', -400],
    ['Ananya Rao', 'ananya.rao', 'Employee', 'Quality Assurance', 'Active', -300],
    ['Kavya Menon', 'kavya.menon', 'Finance Staff', 'Finance & Accounts', 'Active', -620],
    ['Vikram Joshi', 'vikram.joshi', 'Employee', 'Data Engineering', 'Inactive', -700],
    ['Neha Kapoor', 'neha.kapoor', 'Client', 'Client — Saffron Leaf Organics', 'Active', -200, 'CLT-001'],
    ['Ishaan Verma', 'ishaan.verma', 'Employee', 'Mobile Engineering', 'Active', -150],
  ];
  const users: User[] = userRows.map(([fullName, handle, role, department, status, joined, clientId], i) => ({
    id: `USR-${pad(i + 1)}`,
    fullName,
    email: role === 'Client' ? `${handle}@saffronleaf.in` : `${handle}@nexusstudio.in`,
    phone: `+91 9${String(8200000000 + i * 73917531).slice(0, 4)} ${String(10000 + ((i * 48271) % 89999))}`,
    role,
    department,
    status,
    joinedAt: d(joined),
    ...(clientId ? { clientId } : {}),
  }));

  /* ------------------------------ clients ------------------------------ */
  const clientRows: [string, string, string, string, string, string, string, string, Client['status'], number, string][] = [
    ['Saffron Leaf Organics Pvt Ltd', 'Neha Kapoor', 'saffronleaf.in', 'Office 3, Pancard Clubs Road, Baner', 'Pune', 'Maharashtra', '411045', '27AAKCS4821M1Z5', 'Active', -240, 'USR-002'],
    ['Brightwater Logistics LLP', 'Farhan Qureshi', 'brightwaterlogistics.in', 'Plot 18, Sector 19D, Vashi', 'Navi Mumbai', 'Maharashtra', '400703', '27AAQFB7713R1ZK', 'Active', -95, 'USR-003'],
    ['Kestrel Fintech Solutions Pvt Ltd', 'Meera Pillai', 'kestrelfin.in', '4th Floor, 80 Feet Road, Koramangala', 'Bengaluru', 'Karnataka', '560034', '29AAHCK2290P1Z3', 'Active', -70, 'USR-002'],
    ['Monsoon Media House', 'Aditya Bose', 'monsoonmedia.in', '12 Veera Desai Road, Andheri West', 'Mumbai', 'Maharashtra', '400053', '27ABMFM5512C1Z9', 'Active', -215, 'USR-003'],
    ['Arogya Diagnostics Pvt Ltd', 'Dr. Lakshmi Reddy', 'arogyadx.in', 'Road No. 2, Banjara Hills', 'Hyderabad', 'Telangana', '500034', '36AAJCA6604D1ZQ', 'Active', -55, 'USR-002'],
    ['Tarang Edtech Pvt Ltd', 'Harsh Patel', 'tarang.education', 'C G Road, Navrangpura', 'Ahmedabad', 'Gujarat', '380009', '24AAGCT3318H1Z2', 'Active', -20, 'USR-003'],
    ['Northfield Realty', 'Simran Malhotra', 'northfieldrealty.in', 'Tower B, Sector 44', 'Gurugram', 'Haryana', '122003', '06AAPFN9021L1ZT', 'Active', -110, 'USR-002'],
    ['Indigo Loom Textiles', 'Rajat Agarwal', 'indigoloom.in', 'Ashok Marg, C-Scheme', 'Jaipur', 'Rajasthan', '302001', '08AACFI4457K1Z6', 'Active', -45, 'USR-003'],
    ['Copperleaf Hospitality Pvt Ltd', "Joanna D'Souza", 'copperleafstays.in', 'Dayanand Bandodkar Marg, Panjim', 'Panaji', 'Goa', '403001', '30AAFCC8823N1ZB', 'Active', -185, 'USR-002'],
    ['Vayu Mobility Pvt Ltd', 'Karthik Subramanian', 'vayumobility.in', 'SIDCO Industrial Estate, Guindy', 'Chennai', 'Tamil Nadu', '600032', '33AADCV1176F1Z8', 'Active', -35, 'USR-003'],
    ['Sahyadri Agro Exports', 'Ganesh Shinde', 'sahyadriagro.in', 'Trimbak Road, Satpur MIDC', 'Nashik', 'Maharashtra', '422007', '27ABAFS6230J1Z4', 'Prospect', -12, 'USR-001'],
    ['Bluepeak Analytics', 'Anjali Menon', 'bluepeak.co.in', 'Infopark Phase 2, Kakkanad', 'Kochi', 'Kerala', '682042', '32AAICB5539E1Z7', 'Inactive', -320, 'USR-002'],
  ];
  const clients: Client[] = clientRows.map(([companyName, contactPerson, domain, street, city, state, pincode, gstin, status, created, mgr], i) => ({
    id: `CLT-${pad(i + 1)}`,
    companyName,
    contactPerson,
    email: `${contactPerson.replace(/^Dr\.\s*/, '').split(' ')[0].toLowerCase().replace(/[^a-z]/g, '')}@${domain}`,
    phone: `+91 ${['98201', '99302', '97405', '98190', '90004', '98250', '99100', '94140', '98221', '98410', '94220', '94470'][i]} ${String(30000 + i * 4111).slice(0, 5)}`,
    street,
    city,
    state,
    pincode,
    country: 'India',
    gstin,
    status,
    createdAt: d(created),
    accountManagerId: mgr,
  }));

  /* ------------------------------ projects ------------------------------ */
  type PRow = [string, string, string, string, string[], number, number, number, number, Project['status'], Priority];
  const projectRows: PRow[] = [
    ['Saffron Leaf D2C Storefront', 'CLT-001', 'Headless storefront with monthly subscription boxes, UPI checkout and warehouse inventory sync.', 'USR-002', ['USR-004', 'USR-005', 'USR-006', 'USR-007'], -75, 28, 640000, 1800, 'In Progress', 'High'],
    ['Fleet Tracking Dashboard', 'CLT-002', 'Live map of 180 trucks with trip replay, geofences and driver scorecards for the operations team.', 'USR-003', ['USR-004', 'USR-005', 'USR-011'], -60, 45, 520000, 1700, 'In Progress', 'Medium'],
    ['KYC Onboarding Revamp', 'CLT-003', 'Video KYC, document OCR and a reviewer console to cut onboarding time from 3 days to under 1 hour.', 'USR-002', ['USR-004', 'USR-005', 'USR-006', 'USR-007'], -50, 12, 780000, 2200, 'In Progress', 'Urgent'],
    ['Podcast Network Website', 'CLT-004', 'Marketing site and episode library for 14 shows with an embedded player and feed sync.', 'USR-003', ['USR-004', 'USR-006'], -200, -120, 260000, 1500, 'Completed', 'Medium'],
    ['Lab Report Portal', 'CLT-005', 'Patient portal to download reports, book home sample collection and pay online.', 'USR-002', ['USR-004', 'USR-005', 'USR-007'], -40, 35, 450000, 1800, 'In Progress', 'High'],
    ['Learning App MVP', 'CLT-006', 'Mobile-first lesson player with streaks and offline downloads for Class 9–10 students.', 'USR-003', ['USR-006', 'USR-011'], 5, 110, 600000, 1900, 'Planning', 'Medium'],
    ['Property Listing CRM', 'CLT-007', 'Lead pipeline and site-visit scheduling for the sales team. Paused while the client restructures.', 'USR-002', ['USR-004', 'USR-005'], -90, 30, 380000, 1700, 'On Hold', 'Low'],
    ['Wholesale Ordering Portal', 'CLT-008', 'B2B ordering for 400+ distributors with tiered pricing, credit limits and GST e-invoice export.', 'USR-003', ['USR-004', 'USR-005', 'USR-007'], -35, 40, 420000, 1700, 'In Progress', 'Medium'],
    ['Guest Booking Engine', 'CLT-009', 'Direct booking engine for 6 boutique properties with live room inventory and payment gateway.', 'USR-002', ['USR-004', 'USR-005', 'USR-006'], -170, -80, 390000, 1800, 'Completed', 'High'],
    ['EV Charging Locator App', 'CLT-010', 'Android and iOS app showing nearby chargers, live availability and slot booking.', 'USR-003', ['USR-011', 'USR-006', 'USR-007', 'USR-005'], -25, 55, 560000, 2000, 'In Progress', 'High'],
    ['Saffron Leaf Brand Refresh', 'CLT-001', 'New logo, packaging system and brand guidelines ahead of the D2C launch.', 'USR-002', ['USR-006'], -230, -170, 140000, 1500, 'Completed', 'Low'],
    ['Payments Reconciliation Tool', 'CLT-003', 'Matches bank statement lines with gateway settlements and flags mismatches for the finance team.', 'USR-003', ['USR-005'], 10, 100, 480000, 2200, 'Planning', 'Medium'],
    ['Analytics Data Warehouse', 'CLT-012', 'Central PostgreSQL warehouse with nightly ETL and BI dashboards for client reporting.', 'USR-002', ['USR-009', 'USR-005'], -300, -210, 320000, 2000, 'Completed', 'Medium'],
    ['OTT Pilot App', 'CLT-004', 'Subscription video pilot. Cancelled by the client after the technical spike.', 'USR-003', ['USR-011'], -110, -20, 300000, 1800, 'Cancelled', 'Low'],
  ];
  const projects: Project[] = projectRows.map(([name, clientId, description, managerId, memberIds, s, e, budget, rate, status, priority], i) => ({
    id: `PRJ-${pad(i + 1)}`,
    name, clientId, description, managerId, memberIds,
    startDate: d(s), deadline: d(e), budget, billingRate: rate, status, priority,
    createdAt: d(Math.min(s, 0) - 7),
  }));

  /* ------------------------------ tasks ------------------------------ */
  type TRow = [string, string, Priority, TaskStatus, number, number, number, string];
  const taskRows: Record<string, TRow[]> = {
    'PRJ-001': [
      ['Wireframes & design system', 'USR-006', 'High', 'Completed', -75, -58, 32, 'Low-fidelity flows, then a token-based component library in Figma.'],
      ['Product catalogue & CMS setup', 'USR-005', 'High', 'Completed', -60, -40, 40, 'Headless CMS models for products, bundles and subscription plans.'],
      ['Subscription box checkout', 'USR-004', 'Urgent', 'In Progress', -38, 4, 48, 'Plan picker, delivery slots and recurring mandate set-up.'],
      ['UPI & card payment integration', 'USR-005', 'High', 'In Review', -30, -2, 24, 'Gateway integration with UPI intent, cards and webhooks.'],
      ['Inventory sync with warehouse', 'USR-005', 'Medium', 'To Do', -5, 14, 30, 'Two-way stock sync with the warehouse management API every 10 minutes.'],
      ['Cross-browser QA pass', 'USR-007', 'Medium', 'To Do', 5, 22, 20, 'Regression suite on Chrome, Safari, and low-end Android devices.'],
    ],
    'PRJ-002': [
      ['Live map with vehicle clusters', 'USR-004', 'High', 'Completed', -58, -35, 36, 'Clustered map markers updating every 15 seconds.'],
      ['GPS ingestion service', 'USR-005', 'Urgent', 'Completed', -55, -30, 44, 'Queue-based ingestion for 180 trackers with deduplication.'],
      ['Trip history & replay', 'USR-011', 'Medium', 'In Progress', -28, 9, 32, 'Timeline scrubber that replays a trip with stops highlighted.'],
      ['Driver scorecard reports', 'USR-005', 'Medium', 'In Progress', -20, 18, 28, 'Harsh braking, idling and over-speed scoring per driver per week.'],
      ['Geofence alerts', 'USR-004', 'Low', 'To Do', 2, 30, 18, 'Entry/exit alerts for depots and customer sites.'],
    ],
    'PRJ-003': [
      ['Document OCR pipeline', 'USR-005', 'High', 'Completed', -48, -20, 40, 'Extract PAN and Aadhaar fields with confidence scores.'],
      ['Video KYC session flow', 'USR-005', 'Urgent', 'In Progress', -40, -3, 52, 'Agent-assisted video call with liveness check and geo-tagging.'],
      ['Reviewer console UI', 'USR-006', 'High', 'In Review', -25, 2, 30, 'Queue, side-by-side document viewer and approve/reject actions.'],
      ['Audit trail & consent logs', 'USR-004', 'High', 'In Progress', -15, 6, 24, 'Immutable log of every consent and reviewer decision.'],
      ['Penetration test fixes', 'USR-007', 'Urgent', 'To Do', -2, 10, 16, 'Fix findings from the third-party security audit.'],
    ],
    'PRJ-004': [
      ['Visual identity & templates', 'USR-006', 'Medium', 'Completed', -200, -180, 24, 'Show artwork templates and site visual language.'],
      ['Episode pages & player', 'USR-004', 'Medium', 'Completed', -195, -165, 40, 'Episode library with persistent mini-player.'],
      ['RSS & Spotify feed sync', 'USR-004', 'Low', 'Completed', -165, -135, 16, 'Nightly feed import for all shows.'],
    ],
    'PRJ-005': [
      ['Report download & sharing', 'USR-004', 'High', 'Completed', -38, -15, 30, 'Secure PDF download and share-with-doctor links.'],
      ['Home collection booking', 'USR-005', 'High', 'In Progress', -18, 7, 36, 'Slot booking by pincode with phlebotomist assignment.'],
      ['Online payments & receipts', 'USR-005', 'Medium', 'To Do', 1, 20, 24, 'UPI and card payments with GST receipts.'],
      ['Accessibility & QA', 'USR-007', 'Medium', 'To Do', 10, 30, 18, 'WCAG AA audit and fixes for elderly patients.'],
    ],
    'PRJ-006': [
      ['Discovery workshop', 'USR-006', 'Medium', 'To Do', 5, 12, 12, 'Two-day workshop with teachers and students.'],
      ['Lesson player prototype', 'USR-011', 'Medium', 'To Do', 12, 35, 28, 'Clickable prototype of the lesson player and streaks.'],
    ],
    'PRJ-007': [
      ['Lead pipeline board', 'USR-004', 'Low', 'Completed', -85, -60, 26, 'Kanban board for leads with source tracking.'],
      ['Site visit scheduler', 'USR-005', 'Low', 'In Progress', -55, 25, 22, 'Calendar booking for site visits with SMS reminders.'],
    ],
    'PRJ-008': [
      ['Distributor accounts & credit limits', 'USR-005', 'High', 'Completed', -33, -12, 28, 'Account hierarchy and credit limit checks at checkout.'],
      ['Bulk order cart & price tiers', 'USR-004', 'High', 'In Progress', -30, 5, 34, 'Quick-add by SKU, CSV upload and slab pricing.'],
      ['Order tracking emails', 'USR-007', 'Low', 'In Review', -10, -1, 10, 'Transactional emails for dispatch and delivery.'],
      ['GST e-invoice export', 'USR-005', 'Medium', 'To Do', 3, 25, 20, 'IRN-ready JSON export for every order.'],
    ],
    'PRJ-009': [
      ['Room inventory & rates', 'USR-005', 'High', 'Completed', -168, -140, 40, 'Seasonal rates and room-type inventory.'],
      ['Brand-matched booking UI', 'USR-006', 'Medium', 'Completed', -160, -130, 20, 'Booking flow styled per property.'],
      ['Booking widget', 'USR-004', 'High', 'Completed', -150, -110, 36, 'Embeddable widget with date picker and offers.'],
      ['Payment gateway & invoices', 'USR-005', 'Medium', 'Completed', -120, -95, 24, 'Gateway integration and GST invoices for guests.'],
    ],
    'PRJ-010': [
      ['App UI kit', 'USR-006', 'Medium', 'Completed', -25, -8, 24, 'Component kit for Android and iOS.'],
      ['Charger map & filters', 'USR-011', 'High', 'In Progress', -22, 8, 40, 'Map with connector-type and speed filters.'],
      ['Station availability API', 'USR-005', 'High', 'To Do', -3, 20, 32, 'Aggregate live availability from three charging networks.'],
      ['Beta test with drivers', 'USR-007', 'Medium', 'To Do', 20, 45, 16, 'Closed beta with 50 fleet drivers.'],
    ],
    'PRJ-011': [
      ['Logo & packaging refresh', 'USR-006', 'Low', 'Completed', -228, -200, 36, 'New mark and packaging for 22 SKUs.'],
      ['Brand guidelines booklet', 'USR-006', 'Low', 'Completed', -200, -175, 18, '40-page guideline document.'],
    ],
    'PRJ-012': [
      ['Requirements & bank file formats', 'USR-005', 'Medium', 'To Do', 10, 20, 16, 'Collect statement formats from four banks.'],
    ],
    'PRJ-013': [
      ['Warehouse schema & ETL', 'USR-009', 'High', 'Completed', -298, -250, 60, 'Star schema and nightly ETL jobs.'],
      ['BI dashboards', 'USR-005', 'Medium', 'Completed', -250, -215, 30, 'Executive and operations dashboards.'],
    ],
    'PRJ-014': [
      ['Video streaming spike', 'USR-011', 'Low', 'Completed', -105, -80, 20, 'Proof of concept for adaptive streaming.'],
      ['Subscription paywall', 'USR-011', 'Low', 'To Do', -70, -30, 24, 'Not started — project cancelled.'],
    ],
  };
  const tasks: Task[] = [];
  for (const p of projects) {
    for (const [title, assigneeId, priority, status, s, e, est, description] of taskRows[p.id] ?? []) {
      tasks.push({
        id: `TSK-${pad(tasks.length + 1)}`,
        projectId: p.id, title, description, assigneeId, priority, status,
        startDate: d(s), dueDate: d(e), estimatedHours: est,
      });
    }
  }

  /* ------------------------------ work sessions ------------------------------ */
  const sessions: WorkSession[] = [];
  const nowMs = Date.now();
  const projectById = new Map(projects.map((p) => [p.id, p]));
  for (const t of tasks) {
    if (t.status === 'To Do') continue;
    const p = projectById.get(t.projectId)!;
    const share = t.status === 'Completed' ? 0.9 + rand() * 0.2 : t.status === 'In Review' ? 0.75 + rand() * 0.15 : 0.35 + rand() * 0.3;
    let remaining = t.estimatedHours * share;
    const lastDay = t.status === 'Completed' ? (t.dueDate < now ? t.dueDate : now) : now;
    const days: string[] = [];
    for (let day = t.startDate; day <= lastDay; day = addDays(day, 1)) {
      const dow = parseDate(day).getDay();
      if (dow !== 0 && dow !== 6) days.push(day);
    }
    if (!days.length) continue;
    // Spread sessions across the window, favouring recent days for active tasks
    let guard = 0;
    while (remaining > 0.5 && guard++ < 60) {
      const bias = t.status === 'Completed' ? rand() : Math.sqrt(rand());
      const day = days[Math.min(days.length - 1, Math.floor(bias * days.length))];
      const len = Math.min(remaining, 1.5 + Math.round(rand() * 10) * 0.25); // 1.5h – 4h
      const startHour = 9.5 + Math.round(rand() * 20) * 0.25; // 09:30 – 14:30
      const start = parseDate(day);
      start.setHours(Math.floor(startHour), Math.round((startHour % 1) * 60), 0, 0);
      const end = new Date(start.getTime() + len * 3600000);
      if (end.getTime() > nowMs) { remaining -= len; continue; }
      const billable = !/workshop|spike/i.test(t.title) && rand() > 0.1;
      sessions.push({
        id: '',
        taskId: t.id,
        userId: rand() > 0.88 ? p.managerId : t.assigneeId!,
        start: start.toISOString(),
        end: end.toISOString(),
        hourlyRate: p.billingRate,
        billable,
        notes: billable ? pickNote(t.title, rand) : 'Internal — not billable',
      });
      remaining -= len;
    }
  }
  sessions.sort((a, b) => a.start.localeCompare(b.start));
  sessions.forEach((s, i) => (s.id = `WS-${String(i + 1).padStart(4, '0')}`));

  /* ------------------------------ invoices & payments ------------------------------ */
  type PayPlan = [number, number | 'rest', PaymentMethod, PaymentStatus?];
  type IRow = [string, number, number, [string, number, number][], number, Invoice['state'], PayPlan[], string?];
  const invoiceRows: IRow[] = [
    ['PRJ-013', -245, 30, [['Data warehouse design & ETL build', 60, 2000]], 0, 'Sent', [[20, 'rest', 'Bank Transfer']]],
    ['PRJ-011', -172, 15, [['Logo & packaging refresh', 36, 1500], ['Brand guidelines booklet', 18, 1500]], 0, 'Sent', [[9, 'rest', 'Bank Transfer']]],
    ['PRJ-013', -210, 30, [['BI dashboard development', 30, 2000], ['Handover & team training (fixed fee)', 1, 15000]], 0, 'Sent', [[25, 0.5, 'Cheque'], [40, 'rest', 'Bank Transfer']]],
    ['PRJ-004', -165, 15, [['Website design & build — milestone 1', 1, 110000]], 0, 'Sent', [[12, 'rest', 'UPI']]],
    ['PRJ-009', -140, 21, [['Room inventory & rates module', 40, 1800], ['Brand-matched booking UI', 20, 1800]], 0, 'Sent', [[15, 'rest', 'Credit/Debit Card']]],
    ['PRJ-004', -118, 15, [['Website build — milestone 2', 1, 95000], ['RSS & Spotify feed sync', 16, 1500]], 0, 'Sent', [[10, 'rest', 'Bank Transfer']]],
    ['PRJ-009', -85, 21, [['Booking widget', 36, 1800], ['Payment gateway & guest invoices', 24, 1800]], 5, 'Sent', [[18, 'rest', 'Bank Transfer']], 'Includes 5% loyalty discount.'],
    ['PRJ-014', -60, 15, [['Video streaming spike', 20, 1800]], 0, 'Cancelled', [], 'Cancelled — spike written off as goodwill after project cancellation.'],
    ['PRJ-007', -58, 15, [['Lead pipeline board', 26, 1700]], 0, 'Sent', [[30, 0.5, 'UPI']]],
    ['PRJ-001', -55, 15, [['UX wireframes & design system', 32, 1800]], 0, 'Sent', [[8, 'rest', 'UPI']]],
    ['PRJ-003', -40, 15, [['Mobilisation advance (30% of fixed fee)', 1, 234000]], 0, 'Sent', [[3, 'rest', 'Bank Transfer']]],
    ['PRJ-001', -35, 15, [['Product catalogue & CMS setup', 40, 1800], ['Cloud hosting set-up (one-time)', 1, 12000]], 0, 'Sent', [[14, 0.6, 'Bank Transfer'], [30, 'rest', 'Bank Transfer']]],
    ['PRJ-002', -32, 15, [['Live map with vehicle clusters', 36, 1700], ['GPS ingestion service', 44, 1700]], 0, 'Sent', [[10, 0.5, 'Bank Transfer'], [28, 'rest', 'Bank Transfer']]],
    ['PRJ-003', -18, 15, [['Document OCR pipeline', 40, 2200]], 0, 'Sent', [[10, 0.5, 'Credit/Debit Card', 'Failed']], 'Card payment attempt declined by issuing bank.'],
    ['PRJ-005', -14, 20, [['Report download & sharing', 30, 1800]], 0, 'Sent', [[6, 0.4, 'UPI'], [12, 0.3, 'Cheque', 'Pending']]],
    ['PRJ-008', -11, 15, [['Distributor accounts & credit limits', 28, 1700], ['Bulk order cart — advance', 1, 30000]], 0, 'Sent', [[4, 0.5, 'Bank Transfer']]],
    ['PRJ-010', -7, 15, [['App UI kit', 24, 2000], ['Project kick-off & discovery', 1, 20000]], 0, 'Sent', [[5, 'rest', 'UPI']]],
    ['PRJ-001', -4, 15, [['Subscription box checkout — sprint 1', 24, 1800]], 0, 'Sent', []],
    ['PRJ-006', -1, 7, [['Discovery workshop (advance)', 1, 40000]], 0, 'Sent', []],
    ['PRJ-002', -2, 15, [['Trip history & replay — sprint 1', 16, 1700]], 0, 'Draft', []],
  ];
  invoiceRows.sort((a, b) => a[1] - b[1]);

  const invoices: Invoice[] = [];
  const payments: Payment[] = [];
  const fySeq = new Map<string, number>();
  for (const [projectId, issue, terms, items, discountPct, state, plans, notes] of invoiceRows) {
    const p = projectById.get(projectId)!;
    const issueDate = d(issue);
    const [y, m] = issueDate.split('-').map(Number);
    const fy = m >= 4 ? y : y - 1;
    const tag = `${String(fy).slice(2)}-${String(fy + 1).slice(2)}`;
    const seq = (fySeq.get(tag) ?? (tag === '25-26' ? 41 : 0)) + 1;
    fySeq.set(tag, seq);
    const id = `INV-${pad(invoices.length + 1)}`;
    const lineItems: LineItem[] = items.map(([description, quantity, unitPrice], i) => ({ id: `${id}-L${i + 1}`, description, quantity, unitPrice }));
    const inv: Invoice = {
      id,
      number: `NX/${tag}/${String(seq).padStart(4, '0')}`,
      clientId: p.clientId,
      projectId,
      issueDate,
      dueDate: d(issue + terms),
      lineItems,
      discountPct,
      taxRate: 18,
      state,
      notes: notes ?? '',
      ...(state !== 'Draft' ? { sentAt: issueDate } : {}),
    };
    invoices.push(inv);
    const { total } = invoiceTotals(inv);
    let committed = 0;
    for (const [after, frac, method, status = 'Completed'] of plans) {
      const amount = frac === 'rest' ? round2(total - committed) : Math.round(total * frac);
      if (status === 'Completed' || status === 'Pending') committed = round2(committed + amount);
      payments.push({
        id: '',
        invoiceId: id,
        date: d(issue + after),
        amount,
        method,
        reference: reference(method, rand),
        status,
        notes: status === 'Pending' ? 'Cheque deposited — awaiting clearance.' : status === 'Failed' ? 'Declined by issuing bank (insufficient limit).' : '',
      });
    }
  }
  payments.sort((a, b) => a.date.localeCompare(b.date));
  payments.forEach((p, i) => (p.id = `PAY-${pad(i + 1)}`));

  const db: Database = { users, clients, projects, tasks, sessions, invoices, payments };
  return { db, activity: seedActivity(db, now) };
}

const NOTES: Record<string, string[]> = {
  default: ['Implementation and unit tests', 'Code review fixes', 'Pairing with client team', 'Bug fixes from QA round', 'Refactor and documentation', 'Sprint demo prep'],
  design: ['Explored layout options', 'Feedback round with client', 'Updated components', 'Prototype for usability test'],
  qa: ['Regression run', 'Wrote test cases', 'Device lab testing', 'Verified fixes'],
};
function pickNote(title: string, rand: () => number) {
  const list = /design|ui|identity|brand|wireframe|logo|visual/i.test(title) ? NOTES.design : /qa|test/i.test(title) ? NOTES.qa : NOTES.default;
  return list[Math.floor(rand() * list.length)];
}

function reference(method: PaymentMethod, rand: () => number) {
  const digits = (n: number) => Array.from({ length: n }, () => Math.floor(rand() * 10)).join('');
  switch (method) {
    case 'UPI': return `UPI/${digits(12)}`;
    case 'Bank Transfer': return `NEFT/HDFCN${digits(11)}`;
    case 'Credit/Debit Card': return `pay_${Math.floor(rand() * 36 ** 8).toString(36).toUpperCase().padStart(8, '0')}${digits(4)}`;
    case 'Cheque': return `CHQ ${digits(6)}`;
    case 'Cash': return `RCPT-${digits(5)}`;
  }
}

/** Builds a believable activity history from the seeded rows. */
function seedActivity(db: Database, now: string): ActivityEntry[] {
  const out: Omit<ActivityEntry, 'id'>[] = [];
  const at = (date: string, h: number) => {
    const x = parseDate(date);
    x.setHours(h, (h * 7) % 60);
    return x.toISOString();
  };
  const proj = new Map(db.projects.map((p) => [p.id, p]));
  const inv = new Map(db.invoices.map((i) => [i.id, i]));
  const cl = new Map(db.clients.map((c) => [c.id, c]));
  for (const p of db.projects) {
    out.push({ at: at(p.createdAt, 10), actorId: p.managerId, entity: 'project', entityId: p.id, projectId: p.id, clientId: p.clientId, action: 'created', message: `created project ${p.name}` });
  }
  for (const t of db.tasks) {
    if (t.status === 'Completed') {
      const when = t.dueDate < now ? t.dueDate : now;
      out.push({ at: at(when, 17), actorId: t.assigneeId, entity: 'task', entityId: t.id, projectId: t.projectId, clientId: proj.get(t.projectId)?.clientId, action: 'completed', message: `completed ${t.title}` });
    } else if (t.status === 'In Review') {
      out.push({ at: at(addDays(now, -1), 16), actorId: t.assigneeId, entity: 'task', entityId: t.id, projectId: t.projectId, clientId: proj.get(t.projectId)?.clientId, action: 'status', message: `moved ${t.title} to In Review` });
    }
  }
  for (const i of db.invoices) {
    if (i.state !== 'Draft') out.push({ at: at(i.issueDate, 11), actorId: 'USR-008', entity: 'invoice', entityId: i.id, projectId: i.projectId, clientId: i.clientId, action: 'sent', message: `issued invoice ${i.number} to ${cl.get(i.clientId)?.companyName}` });
    else out.push({ at: at(i.issueDate, 12), actorId: 'USR-008', entity: 'invoice', entityId: i.id, projectId: i.projectId, clientId: i.clientId, action: 'created', message: `drafted invoice ${i.number}` });
  }
  for (const p of db.payments) {
    const i = inv.get(p.invoiceId)!;
    const verb = p.status === 'Failed' ? 'recorded a failed payment of' : p.status === 'Pending' ? 'recorded a pending payment of' : 'recorded a payment of';
    out.push({ at: at(p.date, 15), actorId: 'USR-008', entity: 'payment', entityId: p.id, projectId: i.projectId, clientId: i.clientId, action: 'payment', message: `${verb} ${new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(p.amount)} on ${i.number}` });
  }
  const nowMs = Date.now();
  return out
    .filter((a) => new Date(a.at).getTime() <= nowMs)
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 150)
    .map((a, idx) => ({ ...a, id: `ACT-${String(idx + 1).padStart(4, '0')}` }));
}
