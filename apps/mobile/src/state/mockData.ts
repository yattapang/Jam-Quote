import {
  GctTreatment,
  LineCategory,
  PriceSource,
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

/** Seed lines for QT-0142 (Basil Reid, retaining wall) — reproduces the
 * $168,000 subtotal / $183,540 total shown in extracted/JamQuote.dc.html. */
export const initialQuoteLines: DraftLineItem[] = [
  {
    id: "l1",
    category: LineCategory.MATERIAL,
    description: "Cement, 42.5kg bag",
    quantity: 40,
    rateUnit: RateUnit.UNIT,
    unitPriceCents: 115000,
    priceSource: PriceSource.LOOKUP,
    gctTreatment: GctTreatment.STANDARD,
    supplierName: "Kirk's Hardware",
  },
  {
    id: "l2",
    category: LineCategory.MATERIAL,
    description: 'Rebar 3/8" x 20ft',
    quantity: 60,
    rateUnit: RateUnit.UNIT,
    unitPriceCents: 65000,
    priceSource: PriceSource.LOOKUP,
    gctTreatment: GctTreatment.STANDARD,
    supplierName: "Kirk's Hardware",
  },
  {
    id: "l3",
    category: LineCategory.MATERIAL,
    description: "River sand, per load",
    quantity: 2,
    rateUnit: RateUnit.UNIT,
    unitPriceCents: 550000,
    priceSource: PriceSource.MANUAL,
    gctTreatment: GctTreatment.STANDARD,
  },
  {
    id: "l4",
    category: LineCategory.LABOUR,
    description: "Mason · 2 workers",
    quantity: 12,
    rateUnit: RateUnit.DAY,
    unitPriceCents: 450000,
    priceSource: PriceSource.MANUAL,
    gctTreatment: GctTreatment.STANDARD,
  },
  {
    id: "l5",
    category: LineCategory.EQUIPMENT,
    description: "Concrete mixer rental",
    quantity: 3,
    rateUnit: RateUnit.DAY,
    unitPriceCents: 600000,
    priceSource: PriceSource.MANUAL,
    gctTreatment: GctTreatment.STANDARD,
  },
];

export const QUOTE_DISCOUNT_PCT = 5;
export const QUOTE_GCT_RATE_PCT = 15;

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
  {
    id: "s1",
    supplierName: "Kirk's Hardware",
    location: "Spanish Town",
    unitPriceCents: 115000,
    freshness: "Updated 2 hours ago",
    freshnessKind: "good",
    source: "LOOKUP",
  },
  {
    id: "s2",
    supplierName: "Tile Warehouse",
    location: "Portmore",
    unitPriceCents: 117500,
    freshness: "Cached · offline since Jul 6",
    freshnessKind: "warn",
    source: "LOOKUP",
  },
  {
    id: "s3",
    supplierName: "Graham's Building Supplies",
    location: "May Pen",
    unitPriceCents: 114000,
    freshness: "Updated yesterday",
    freshnessKind: "good",
    source: "LOOKUP",
  },
];

export interface QuoteListRow {
  num: string;
  client: string;
  job: string;
  amountCents: number;
  status: string;
  kind: StatusKind;
}

export const quoteListRows: QuoteListRow[] = [
  { num: "QT-0142", client: "Basil Reid", job: "Retaining wall, Spanish Town", amountCents: 31860000, status: "Accepted", kind: "good" },
  { num: "QT-0141", client: "Paulette Wright", job: "Bathroom remodel, Portmore", amountCents: 74200000, status: "Draft", kind: "neutral" },
  { num: "QT-0140", client: "Devon Facey", job: "Fence & gate, St. Catherine", amountCents: 18640000, status: "Sent", kind: "info" },
  { num: "QT-0139", client: "Marva Grant", job: "Kitchen tiling, Kingston 6", amountCents: 42190000, status: "Viewed", kind: "infoSolid" },
  { num: "QT-0138", client: "Errol Campbell", job: "Carport extension, Mandeville", amountCents: 25500000, status: "Invoiced", kind: "accent" },
  { num: "QT-0137", client: "Shauna Bailey", job: "Perimeter block wall, Old Harbour", amountCents: 59830000, status: "Declined", kind: "crit" },
  { num: "QT-0136", client: "Trevor Dixon", job: "Roof repair, Linstead", amountCents: 9450000, status: "Expired", kind: "neutral" },
];

export const quoteFilterNames = ["All", "Draft", "Sent", "Viewed", "Accepted", "Declined", "Invoiced"] as const;

export interface ClientRow {
  initials: string;
  name: string;
  parish: string;
  phone: string;
  totalCents: number;
}

export const clientRows: ClientRow[] = [
  { initials: "BR", name: "Basil Reid", parish: "St. Catherine", phone: "876 402 8811", totalCents: 31860000 },
  { initials: "PW", name: "Paulette Wright", parish: "St. Catherine", phone: "876 771 2290", totalCents: 74200000 },
  { initials: "DF", name: "Devon Facey", parish: "St. Andrew", phone: "876 555 0142", totalCents: 18640000 },
  { initials: "MG", name: "Marva Grant", parish: "Kingston", phone: "876 833 4471", totalCents: 42190000 },
  { initials: "EC", name: "Errol Campbell", parish: "Manchester", phone: "876 924 1187", totalCents: 25500000 },
  { initials: "SB", name: "Shauna Bailey", parish: "St. Catherine", phone: "876 662 9034", totalCents: 59830000 },
];

export interface JobRow {
  name: string;
  address: string;
  stage: string;
  pct: number;
  kind: StatusKind;
}

export const jobRows: JobRow[] = [
  { name: "Reid residence — retaining wall", address: "Lot 14 Bloxburgh Dr, Spanish Town", stage: "In progress", pct: 62, kind: "info" },
  { name: "Wright residence — bathroom", address: "22 Passage Fort Dr, Portmore", stage: "Quoted", pct: 20, kind: "neutral" },
  { name: "Facey property — fence & gate", address: "8 Angels, St. Catherine", stage: "Awaiting approval", pct: 40, kind: "info" },
  { name: "Grant residence — kitchen", address: "14 Hope Rd, Kingston 6", stage: "Complete", pct: 100, kind: "good" },
  { name: "Campbell carport", address: "Mandeville, Manchester", stage: "Invoiced", pct: 90, kind: "accent" },
];

export interface InvoiceRow {
  num: string;
  client: string;
  amountCents: number;
  due: string;
  status: string;
  kind: StatusKind;
}

export const invoiceRows: InvoiceRow[] = [
  { num: "INV-0098", client: "Basil Reid", amountCents: 18354080, due: "Overdue 9 days", status: "Overdue", kind: "critSolid" },
  { num: "INV-0097", client: "Errol Campbell", amountCents: 25500000, due: "Due Jul 18", status: "Invoiced", kind: "accent" },
  { num: "INV-0096", client: "Marva Grant", amountCents: 42190000, due: "Paid Jul 2", status: "Paid", kind: "goodSolid" },
  { num: "INV-0095", client: "Paulette Wright", amountCents: 74200000, due: "Due Jul 24", status: "Invoiced", kind: "accent" },
  { num: "INV-0094", client: "Trevor Dixon", amountCents: 9450000, due: "Paid Jun 28", status: "Paid", kind: "goodSolid" },
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
