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
  demoJobs,
  demoQuotes,
  demoQuoteTotals,
  findDemoClient,
  findDemoJob,
  InvoiceStatus,
  PaymentMethod,
} from "@jamquote/core";
import type { BusinessProfile, Client, Invoice, Quote, RegulatoryAlert } from "./types";

export const businessProfile: BusinessProfile = {
  name: "Blackwood Construction & Masonry",
  ownerFirstName: "Owen",
  trn: "102-458-963",
  parish: "St. Catherine",
  tradeType: "General contractor & masonry",
  defaultGctRatePct: 15,
  phone: "876 555 0142",
  email: "owen@blackwoodconstruction.jm",
  whatsapp: { connected: true, label: "Connected · 876 555 0142" },
  emailChannel: { connected: false, label: "Not connected" },
  plan: {
    name: "Pro plan",
    priceCents: 180000,
    renewsLabel: "Renews Aug 4, 2026",
    features: "Unlimited quotes, WhatsApp sending, supplier price sync",
  },
};

// --- Derived from shared fixtures (single source of truth) -----------------

export const clients: Client[] = demoClients.map((c) => ({
  id: c.id,
  name: c.name,
  initials: c.initials,
  parish: c.parish as Client["parish"],
  phone: c.phone,
  address: c.addressLine,
}));

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
  jobId: q.jobId,
  jobLabel: findDemoJob(q.jobId)?.name ?? "",
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
  createdLabel: q.createdLabel,
  validUntilLabel: q.validUntilLabel,
}));

export function findQuote(id: string): Quote | undefined {
  return quotes.find((q) => q.id === id);
}

export interface JobSummary {
  id: string;
  name: string;
  clientName: string;
  addressLine: string;
  parish: string;
  stage: string;
  progressPct: number;
  quoteCount: number;
  valueCents: number;
}

/** Jobs list — one canonical name/address per job, shared with mobile. */
export const jobs: JobSummary[] = demoJobs.map((j) => {
  const jobQuotes = demoQuotes.filter((q) => q.jobId === j.id);
  return {
    id: j.id,
    name: j.name,
    clientName: findDemoClient(j.clientId)?.name ?? "Unknown",
    addressLine: j.addressLine,
    parish: j.parish,
    stage: j.stage,
    progressPct: j.progressPct,
    quoteCount: jobQuotes.length,
    valueCents: jobQuotes.reduce((sum, q) => sum + demoQuoteTotals(q).totalCents, 0),
  };
});

// --- Invoices / regulatory / dashboard (not quote-derived) -----------------

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

export const regulatoryAlerts: RegulatoryAlert[] = [
  { id: "reg-gct-threshold", title: "GCT threshold update takes effect Aug 1, 2026", detail: "The standard GCT rate and registration threshold change Aug 1, 2026 — review your default pricing and quote templates before then.", effectiveLabel: "Effective Aug 1, 2026", severity: "warn" },
  { id: "reg-trn-verification", title: "New TRN verification requirement for invoices over $500,000", detail: "Invoices billing more than $500,000 JMD must display a verified TRN match for both business and client starting this date.", effectiveLabel: "Effective Sep 1, 2026", severity: "info" },
];

export const dashboardStats = {
  pipelineValueCents: 284050000,
  winRatePct90d: 62,
  overdueInvoicesCents: 9600000,
  quotesThisMonth: 14,
};

export const followUps = [
  { id: "fu-1", clientName: "Devon Facey", jobLabel: "Fence & gate", note: "Sent 6 days ago · no reply" },
  { id: "fu-2", clientName: "Marva Grant", jobLabel: "Kitchen tiling", note: "Viewed yesterday · follow up" },
];
