/**
 * Local mock data for the web app. Clients, quotes and jobs derive from the
 * shared @jamquote/core demo fixtures, so the web app, the mobile app, and the
 * quote editor all show identical, computeTotals-derived numbers. Swap for
 * apiClient reads once apps/api is live.
 */
import {
  demoClients,
  demoClientQuoteCount,
  demoClientTotalCents,
  demoProjects,
  demoQuotes,
  demoQuoteTotals,
  findDemoClient,
  findDemoProject,
  InvoiceStatus,
  PaymentMethod,
} from "@jamquote/core";
import type { ProjectStage } from "@jamquote/core";
import type { Business, BusinessProfile, Client, Invoice, Quote } from "./types";

// Demo identity, module-local: it only seeds `fixtureBusiness` below. It used
// to carry a WhatsApp/email "Connected" status and a subscription plan that
// the settings page rendered as though they were the tenant's own — both were
// invented. Billing is now read live (GET /billing/status); channel
// connections have no writer at all, so settings states that plainly instead.
const businessProfile: BusinessProfile = {
  name: "Blackwood Construction & Masonry",
  ownerFirstName: "Owen",
  trn: "102-458-963",
  parish: "St. Catherine",
  tradeType: "General contractor & masonry",
  defaultGctRatePct: 15,
  phone: "876 555 0142",
  email: "owen@blackwoodconstruction.jm",
};

/** api-client's getBusiness() fallback when the API is unreachable — same
 * shape/id convention as the seeded business (`seed-business-blackwood`),
 * mirroring how fixtureClients/fixtureQuotes back the other getX() fallbacks. */
export const fixtureBusiness: Business = {
  id: "seed-business-blackwood",
  name: businessProfile.name,
  billingContactName: "",
  billingContactEmail: "",
  trn: businessProfile.trn,
  town: "",
  parish: businessProfile.parish,
  tradeType: businessProfile.tradeType,
  addressLine: "12 Barbican Road, Kingston 8",
  defaultGctRatePct: businessProfile.defaultGctRatePct,
  countryCode: "JM",
  currency: "JMD",
};

// --- Derived from shared fixtures (single source of truth) -----------------

// demoClients (the shared @jamquote/core fixture) still carries a single
// `name` field; split it the same way the API's legacy-name normalizer does
// (first token -> firstName, remainder -> lastName) so the view Client type
// can carry both without diverging from the fixture.
function splitName(fullName: string): { firstName: string; lastName: string } {
  const [firstName, ...rest] = fullName.trim().split(/\s+/);
  return { firstName: firstName ?? "", lastName: rest.join(" ") };
}

export const clients: Client[] = demoClients.map((c) => {
  const { firstName, lastName } = splitName(c.name);
  return {
    id: c.id,
    firstName,
    lastName,
    name: c.name,
    initials: c.initials,
    // Demo fixtures predate the town field; blank rather than invented, so the
    // fallback never shows an address the contractor did not enter.
    town: "",
    parish: c.parish as Client["parish"],
    phone: c.phone,
    address: c.addressLine,
  };
});

export function findClient(id: string): Client | undefined {
  return clients.find((c) => c.id === id);
}

/** Quote count + total value per client — same metrics the mobile app shows. */
export function clientQuoteCount(id: string): number {
  return demoClientQuoteCount(id);
}
export function clientTotalCents(id: string): number {
  return demoClientTotalCents(id);
}

export const quotes: Quote[] = demoQuotes.map((q) => ({
  id: q.id,
  num: q.number,
  clientId: q.clientId,
  projectId: q.projectId,
  projectLabel: findDemoProject(q.projectId)?.name ?? "",
  status: q.status,
  lines: q.lines.map((l) => ({
    id: l.id,
    category: l.category,
    description: l.description,
    quantity: l.quantity,
    rateUnit: l.rateUnit,
    unitPriceCents: l.unitPriceCents,
    priceSource: l.priceSource,
    gctTreatment: l.gctTreatment,
    markupPct: l.markupPct,
  })),
  gctRatePct: q.gctRatePct,
  discountPct: q.discountPct,
  depositCents: q.depositCents,
  createdAt: q.createdAt,
  createdLabel: q.createdLabel,
  validUntilLabel: q.validUntilLabel,
}));

export function findQuote(id: string): Quote | undefined {
  return quotes.find((q) => q.id === id);
}

export interface ProjectSummary {
  id: string;
  name: string;
  clientName: string;
  addressLine: string;
  parish: string;
  stage: ProjectStage;
  progressPct: number;
  quoteCount: number;
  valueCents: number;
}

/** Jobs list — one canonical name/address per job, shared with mobile. */
export const projects: ProjectSummary[] = demoProjects.map((j) => {
  const projectQuotes = demoQuotes.filter((q) => q.projectId === j.id);
  return {
    id: j.id,
    name: j.name,
    clientName: findDemoClient(j.clientId)?.name ?? "Unknown",
    addressLine: j.addressLine,
    parish: j.parish,
    stage: j.stage,
    progressPct: j.progressPct,
    quoteCount: projectQuotes.length,
    valueCents: projectQuotes.reduce((sum, q) => sum + demoQuoteTotals(q).totalCents, 0),
  };
});

export interface ProjectDetail {
  id: string;
  name: string;
  clientId: string;
  clientName: string;
  addressLine: string;
  town: string;
  parish: string;
  stage: ProjectStage;
  progressPct: number;
}

/** Single-job detail fixture — same fields as `projects`, plus `clientId` for
 * the edit form's client select (list rows don't need it). */
export function findProjectDetail(id: string): ProjectDetail | undefined {
  const j = findDemoProject(id);
  if (!j) return undefined;
  return {
    id: j.id,
    name: j.name,
    clientId: j.clientId,
    clientName: findDemoClient(j.clientId)?.name ?? "Unknown",
    addressLine: j.addressLine,
    // Demo fixtures predate the town field; blank rather than invented.
    town: "",
    parish: j.parish,
    stage: j.stage,
    progressPct: j.progressPct,
  };
}

// --- Invoices (not quote-derived) ------------------------------------------

export const invoices: Invoice[] = [
  { id: "inv-0098", num: "INV-0098", quoteId: "qt-0142", clientId: "cl-basil-reid", status: InvoiceStatus.OVERDUE, dueLabel: "Overdue 9 days", dueDate: "2026-06-30", overdueDays: 9, payments: [] },
  { id: "inv-0097", num: "INV-0097", quoteId: "qt-0138", clientId: "cl-errol-campbell", status: InvoiceStatus.INVOICED, dueLabel: "Due Jul 18", dueDate: "2026-07-18", payments: [] },
  { id: "inv-0096", num: "INV-0096", quoteId: "qt-0139", clientId: "cl-marva-grant", status: InvoiceStatus.PAID, dueLabel: "Paid Jul 2", dueDate: "2026-07-02", payments: [{ id: "pay-1", amountCents: demoQuoteTotals(demoQuotes.find((q) => q.number === "QT-0139")!).totalCents, method: PaymentMethod.BANK_TRANSFER, dateLabel: "Jul 2, 2026" }] },
  { id: "inv-0095", num: "INV-0095", quoteId: "qt-0141", clientId: "cl-paulette-wright", status: InvoiceStatus.INVOICED, dueLabel: "Due Jul 24", dueDate: "2026-07-24", payments: [] },
  { id: "inv-0094", num: "INV-0094", quoteId: "qt-0136", clientId: "cl-trevor-dixon", status: InvoiceStatus.PAID, dueLabel: "Paid Jun 28", dueDate: "2026-06-28", payments: [{ id: "pay-2", amountCents: demoQuoteTotals(demoQuotes.find((q) => q.number === "QT-0136")!).totalCents, method: PaymentMethod.CASH, dateLabel: "Jun 28, 2026" }] },
];

export function findInvoice(id: string): Invoice | undefined {
  return invoices.find((i) => i.id === id);
}

// Regulatory alerts are no longer hardcoded here either — the dashboard reads
// the real DB-backed feed via getRegulatoryUpdates() (GET /regulatory) and
// derives each label/severity in lib/regulatory.ts.

// Dashboard stats and "needs follow-up" are no longer hardcoded here — the
// dashboard page derives them from real quotes via
// @jamquote/core's computeDashboardStats (see packages/core/src/dashboard/stats.ts).
