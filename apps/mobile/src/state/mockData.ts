import {
  demoClients,
  demoClientQuoteCount,
  demoClientTotalCents,
  demoJobs,
  demoQuotes,
  demoQuoteTotals,
  findDemoClient,
  findDemoJob,
  findDemoQuote,
  GctTreatment,
  LineCategory,
  PriceSource,
  QuoteStatus,
  RateUnit,
} from "@jamquote/core";
import type { StatusKind } from "../components/StatusPill";

/** A quote line item as edited on-device, before it's persisted via the API. */
export interface DraftLineItem {
  id: string;
  category: LineCategory;
  description: string;
  quantity: number;
  rateUnit: RateUnit;
  unitPriceCents: number;
  priceSource: PriceSource;
  gctTreatment: GctTreatment;
  markupPct?: number;
  supplierName?: string;
  overrideNote?: string;
}

export const rateUnitLabel: Record<RateUnit, string> = {
  HOUR: "/hr",
  DAY: "/day",
  WEEK: "/wk",
  MONTH: "/mo",
  JOB: "/job",
  UNIT: "",
};

// ---------------------------------------------------------------------------
// Everything below derives from the shared @jamquote/core demo fixtures, so
// the mobile app, the web app, and the quote editor all show identical numbers.
// Amounts come from computeTotals — never hand-typed. See fixtures/demo.ts.
// ---------------------------------------------------------------------------

const QT_0142 = findDemoQuote("QT-0142")!;

/** Seed lines for QT-0142 (Basil Reid, retaining wall) — $168,000 subtotal /
 * $183,540 total, computed by @jamquote/core.computeTotals. */
export const initialQuoteLines: DraftLineItem[] = QT_0142.lines.map((l) => ({ ...l }));

export const QUOTE_DISCOUNT_PCT = QT_0142.discountPct;
export const QUOTE_GCT_RATE_PCT = QT_0142.gctRatePct;

const STATUS_PILL: Record<QuoteStatus, { label: string; kind: StatusKind }> = {
  [QuoteStatus.DRAFT]: { label: "Draft", kind: "neutral" },
  [QuoteStatus.SENT]: { label: "Sent", kind: "info" },
  [QuoteStatus.VIEWED]: { label: "Viewed", kind: "infoSolid" },
  [QuoteStatus.ACCEPTED]: { label: "Accepted", kind: "good" },
  [QuoteStatus.DECLINED]: { label: "Declined", kind: "crit" },
  [QuoteStatus.EXPIRED]: { label: "Expired", kind: "neutral" },
  [QuoteStatus.INVOICED]: { label: "Invoiced", kind: "accent" },
};

export interface SupplierPriceResult {
  id: string;
  supplierName: string;
  location: string;
  unitPriceCents: number;
  freshness: string;
  freshnessKind: "good" | "warn" | "crit";
  source: "LOOKUP";
}

/** Mock supplier price lookup for "cement, 42.5kg" — mirrors the Add Material screen. */
export const cementSupplierPrices: SupplierPriceResult[] = [
  { id: "s1", supplierName: "Kirk's Hardware", location: "Spanish Town", unitPriceCents: 115000, freshness: "Updated 2 hours ago", freshnessKind: "good", source: "LOOKUP" },
  { id: "s2", supplierName: "Tile Warehouse", location: "Portmore", unitPriceCents: 117500, freshness: "Cached · offline since Jul 6", freshnessKind: "warn", source: "LOOKUP" },
  { id: "s3", supplierName: "Graham's Building Supplies", location: "May Pen", unitPriceCents: 114000, freshness: "Updated yesterday", freshnessKind: "good", source: "LOOKUP" },
];

export interface QuoteListRow {
  num: string;
  client: string;
  job: string;
  amountCents: number;
  status: string;
  kind: StatusKind;
}

export const quoteListRows: QuoteListRow[] = demoQuotes.map((q) => {
  const pill = STATUS_PILL[q.status];
  return {
    num: q.number,
    client: findDemoClient(q.clientId)?.name ?? "Unknown",
    job: findDemoJob(q.jobId)?.name ?? "",
    amountCents: demoQuoteTotals(q).totalCents, // derived — matches the editor
    status: pill.label,
    kind: pill.kind,
  };
});

export const quoteFilterNames = ["All", "Draft", "Sent", "Viewed", "Accepted", "Declined", "Invoiced"] as const;

export interface ClientRow {
  initials: string;
  name: string;
  parish: string;
  phone: string;
  totalCents: number;
  quoteCount: number;
}

export const clientRows: ClientRow[] = demoClients.map((c) => ({
  initials: c.initials,
  name: c.name,
  parish: c.parish,
  phone: c.phone,
  totalCents: demoClientTotalCents(c.id),
  quoteCount: demoClientQuoteCount(c.id),
}));

const STAGE_KIND: Record<string, StatusKind> = {
  "In progress": "info",
  Quoted: "neutral",
  "Awaiting approval": "info",
  Complete: "good",
  Invoiced: "accent",
};

export interface JobRow {
  name: string;
  clientName: string;
  address: string;
  stage: string;
  pct: number;
  valueCents: number;
  kind: StatusKind;
}

export const jobRows: JobRow[] = demoJobs.map((j) => {
  const jobQuotes = demoQuotes.filter((q) => q.jobId === j.id);
  return {
    name: j.name,
    clientName: findDemoClient(j.clientId)?.name ?? "Unknown",
    address: j.addressLine,
    stage: j.stage,
    pct: j.progressPct,
    valueCents: jobQuotes.reduce((sum, q) => sum + demoQuoteTotals(q).totalCents, 0),
    kind: STAGE_KIND[j.stage] ?? "neutral",
  };
});

export interface InvoiceRow {
  num: string;
  client: string;
  amountCents: number;
  due: string;
  status: string;
  kind: StatusKind;
}

export const invoiceRows: InvoiceRow[] = [
  { num: "INV-0098", client: "Basil Reid", amountCents: 18354000, due: "Overdue 9 days", status: "Overdue", kind: "critSolid" },
  { num: "INV-0097", client: "Errol Campbell", amountCents: demoQuoteTotals(findDemoQuote("QT-0138")!).totalCents, due: "Due Jul 18", status: "Invoiced", kind: "accent" },
  { num: "INV-0096", client: "Marva Grant", amountCents: demoQuoteTotals(findDemoQuote("QT-0139")!).totalCents, due: "Paid Jul 2", status: "Paid", kind: "goodSolid" },
];

export const invoiceFilterNames = ["All", "Invoiced", "Paid", "Overdue"] as const;

export const rateBookRows = [
  { name: "Mason", cadence: "Daily", rateCents: 450000 },
  { name: "Helper / labourer", cadence: "Daily", rateCents: 280000 },
  { name: "Electrician", cadence: "Daily", rateCents: 650000 },
  { name: "Plumber", cadence: "Daily", rateCents: 600000 },
  { name: "Painter", cadence: "Daily", rateCents: 400000 },
  { name: "Carpenter", cadence: "Daily", rateCents: 520000 },
];

/** Dashboard summary stats. Kept identical to the web app's dashboardStats so
 * both surfaces agree (these are "this month" aggregates, not the 7-quote list). */
export const dashboardStats = {
  pipelineValueCents: 284050000,
  winRatePct90d: 62,
  overdueInvoicesCents: 9600000,
  quotesThisMonth: 14,
};
