/**
 * Shared demo/preview fixtures — the SINGLE source of truth for the mock data
 * rendered by apps/web and apps/mobile until the real API is wired in. Both
 * surfaces derive every displayed amount from these quotes via `computeTotals`
 * (never hand-type a total), so web and mobile always agree and the numbers
 * always match the quote editor. Data-validation tests guard this.
 *
 * NOT production data. Framework-free so both Next and Metro can import it.
 */
import { computeTotals, type QuoteTotals } from "../quote/totals.js";
import type { Cents } from "../tax/money.js";
import {
  GctTreatment,
  LineCategory,
  PriceSource,
  QuoteStatus,
  RateUnit,
} from "../types/enums.js";

export interface DemoLine {
  id: string;
  category: LineCategory;
  description: string;
  quantity: number;
  rateUnit: RateUnit;
  unitPriceCents: Cents;
  priceSource: PriceSource;
  gctTreatment: GctTreatment;
  markupPct?: number;
  supplierName?: string;
}

export interface DemoClient {
  id: string;
  name: string;
  initials: string;
  parish: string;
  phone: string;
  addressLine: string;
}

export interface DemoJob {
  id: string;
  clientId: string;
  name: string; // one canonical label rendered by BOTH surfaces
  addressLine: string;
  parish: string;
  stage: string;
  progressPct: number;
}

export interface DemoQuote {
  id: string;
  number: string; // e.g. "QT-0142"
  clientId: string;
  jobId: string;
  status: QuoteStatus;
  createdLabel: string;
  validUntilLabel: string;
  gctRatePct: number;
  discountPct: number;
  depositCents: Cents;
  lines: DemoLine[];
}

const M = LineCategory.MATERIAL;
const L = LineCategory.LABOUR;
const E = LineCategory.EQUIPMENT;
const STD = GctTreatment.STANDARD;

export const demoClients: DemoClient[] = [
  { id: "cl-basil-reid", name: "Basil Reid", initials: "BR", parish: "St. Catherine", phone: "876 402 8811", addressLine: "Lot 14 Bloxburgh Dr, Spanish Town" },
  { id: "cl-paulette-wright", name: "Paulette Wright", initials: "PW", parish: "St. Catherine", phone: "876 771 2290", addressLine: "22 Passage Fort Dr, Portmore" },
  { id: "cl-devon-facey", name: "Devon Facey", initials: "DF", parish: "St. Andrew", phone: "876 555 0142", addressLine: "8 Angels, St. Andrew" },
  { id: "cl-marva-grant", name: "Marva Grant", initials: "MG", parish: "Kingston", phone: "876 833 4471", addressLine: "14 Hope Rd, Kingston 6" },
  { id: "cl-errol-campbell", name: "Errol Campbell", initials: "EC", parish: "Manchester", phone: "876 924 1187", addressLine: "Mandeville, Manchester" },
  { id: "cl-shauna-bailey", name: "Shauna Bailey", initials: "SB", parish: "St. Catherine", phone: "876 662 9034", addressLine: "Old Harbour, St. Catherine" },
  { id: "cl-trevor-dixon", name: "Trevor Dixon", initials: "TD", parish: "St. Catherine", phone: "876 771 5523", addressLine: "Linstead, St. Catherine" },
];

export const demoJobs: DemoJob[] = [
  { id: "job-0142", clientId: "cl-basil-reid", name: "Retaining wall, Spanish Town", addressLine: "Lot 14 Bloxburgh Dr, Spanish Town", parish: "St. Catherine", stage: "In progress", progressPct: 62 },
  { id: "job-0141", clientId: "cl-paulette-wright", name: "Bathroom remodel, Portmore", addressLine: "22 Passage Fort Dr, Portmore", parish: "St. Catherine", stage: "Quoted", progressPct: 20 },
  { id: "job-0140", clientId: "cl-devon-facey", name: "Fence & gate, St. Catherine", addressLine: "8 Angels, St. Andrew", parish: "St. Andrew", stage: "Awaiting approval", progressPct: 40 },
  { id: "job-0139", clientId: "cl-marva-grant", name: "Kitchen tiling, Kingston 6", addressLine: "14 Hope Rd, Kingston 6", parish: "Kingston", stage: "Complete", progressPct: 100 },
  { id: "job-0138", clientId: "cl-errol-campbell", name: "Carport extension, Mandeville", addressLine: "Mandeville, Manchester", parish: "Manchester", stage: "Invoiced", progressPct: 90 },
  { id: "job-0137", clientId: "cl-shauna-bailey", name: "Perimeter block wall, Old Harbour", addressLine: "Old Harbour, St. Catherine", parish: "St. Catherine", stage: "Quoted", progressPct: 15 },
  { id: "job-0136", clientId: "cl-trevor-dixon", name: "Roof repair, Linstead", addressLine: "Linstead, St. Catherine", parish: "St. Catherine", stage: "Complete", progressPct: 100 },
];

export const demoQuotes: DemoQuote[] = [
  {
    id: "qt-0142", number: "QT-0142", clientId: "cl-basil-reid", jobId: "job-0142",
    status: QuoteStatus.ACCEPTED, createdLabel: "Sent Jul 9", validUntilLabel: "Valid until Aug 8, 2026",
    gctRatePct: 15, discountPct: 5, depositCents: 5_000_000,
    lines: [
      { id: "l1", category: M, description: "Cement, 42.5kg bag", quantity: 40, rateUnit: RateUnit.UNIT, unitPriceCents: 115_000, priceSource: PriceSource.LOOKUP, gctTreatment: STD, supplierName: "Kirk's Hardware" },
      { id: "l2", category: M, description: 'Rebar 3/8" x 20ft', quantity: 60, rateUnit: RateUnit.UNIT, unitPriceCents: 65_000, priceSource: PriceSource.LOOKUP, gctTreatment: STD, supplierName: "Kirk's Hardware" },
      { id: "l3", category: M, description: "River sand, per load", quantity: 2, rateUnit: RateUnit.UNIT, unitPriceCents: 550_000, priceSource: PriceSource.MANUAL, gctTreatment: STD },
      { id: "l4", category: L, description: "Mason · 2 workers", quantity: 12, rateUnit: RateUnit.DAY, unitPriceCents: 450_000, priceSource: PriceSource.MANUAL, gctTreatment: STD },
      { id: "l5", category: E, description: "Concrete mixer rental", quantity: 3, rateUnit: RateUnit.DAY, unitPriceCents: 600_000, priceSource: PriceSource.MANUAL, gctTreatment: STD },
    ],
  },
  {
    id: "qt-0141", number: "QT-0141", clientId: "cl-paulette-wright", jobId: "job-0141",
    status: QuoteStatus.DRAFT, createdLabel: "Draft · not sent", validUntilLabel: "Valid until Aug 20, 2026",
    gctRatePct: 15, discountPct: 0, depositCents: 0,
    lines: [
      { id: "l1", category: M, description: "Porcelain floor tile, per box", quantity: 48, rateUnit: RateUnit.UNIT, unitPriceCents: 285_000, priceSource: PriceSource.LOOKUP, gctTreatment: STD },
      { id: "l2", category: L, description: "Tile setter · 2 workers", quantity: 10, rateUnit: RateUnit.DAY, unitPriceCents: 500_000, priceSource: PriceSource.MANUAL, gctTreatment: STD },
    ],
  },
  {
    id: "qt-0140", number: "QT-0140", clientId: "cl-devon-facey", jobId: "job-0140",
    status: QuoteStatus.SENT, createdLabel: "Sent Jul 7", validUntilLabel: "Valid until Aug 6, 2026",
    gctRatePct: 15, discountPct: 0, depositCents: 0,
    lines: [
      { id: "l1", category: M, description: "Galvanized chain-link fencing, per roll", quantity: 6, rateUnit: RateUnit.UNIT, unitPriceCents: 1_800_000, priceSource: PriceSource.LOOKUP, gctTreatment: STD },
      { id: "l2", category: L, description: "General labourer · 1 worker", quantity: 4, rateUnit: RateUnit.DAY, unitPriceCents: 280_000, priceSource: PriceSource.MANUAL, gctTreatment: STD },
    ],
  },
  {
    id: "qt-0139", number: "QT-0139", clientId: "cl-marva-grant", jobId: "job-0139",
    status: QuoteStatus.VIEWED, createdLabel: "Sent Jul 5", validUntilLabel: "Valid until Aug 4, 2026",
    gctRatePct: 15, discountPct: 0, depositCents: 0,
    lines: [
      { id: "l1", category: M, description: "Ceramic floor tile, per box", quantity: 30, rateUnit: RateUnit.UNIT, unitPriceCents: 250_000, priceSource: PriceSource.LOOKUP, gctTreatment: STD },
      { id: "l2", category: M, description: "Tile adhesive, 25kg", quantity: 20, rateUnit: RateUnit.UNIT, unitPriceCents: 45_000, priceSource: PriceSource.LOOKUP, gctTreatment: STD },
      { id: "l3", category: L, description: "Tiler · 1 worker", quantity: 6, rateUnit: RateUnit.DAY, unitPriceCents: 520_000, priceSource: PriceSource.MANUAL, gctTreatment: STD },
    ],
  },
  {
    id: "qt-0138", number: "QT-0138", clientId: "cl-errol-campbell", jobId: "job-0138",
    status: QuoteStatus.INVOICED, createdLabel: "Sent Jun 30", validUntilLabel: "Valid until Jul 30, 2026",
    gctRatePct: 15, discountPct: 0, depositCents: 0,
    lines: [
      { id: "l1", category: M, description: "Lumber 2x4x14ft", quantity: 40, rateUnit: RateUnit.UNIT, unitPriceCents: 90_000, priceSource: PriceSource.LOOKUP, gctTreatment: STD },
      { id: "l2", category: M, description: "Zinc roofing sheet, 10ft", quantity: 20, rateUnit: RateUnit.UNIT, unitPriceCents: 130_000, priceSource: PriceSource.LOOKUP, gctTreatment: STD },
      { id: "l3", category: L, description: "Carpenter · 1 worker", quantity: 8, rateUnit: RateUnit.DAY, unitPriceCents: 520_000, priceSource: PriceSource.MANUAL, gctTreatment: STD },
    ],
  },
  {
    id: "qt-0137", number: "QT-0137", clientId: "cl-shauna-bailey", jobId: "job-0137",
    status: QuoteStatus.DECLINED, createdLabel: "Sent Jun 26", validUntilLabel: "Expired Jul 26, 2026",
    gctRatePct: 15, discountPct: 0, depositCents: 0,
    lines: [
      { id: "l1", category: M, description: "Concrete block, 6in", quantity: 500, rateUnit: RateUnit.UNIT, unitPriceCents: 22_000, priceSource: PriceSource.LOOKUP, gctTreatment: STD },
      { id: "l2", category: L, description: "Mason · 2 workers", quantity: 15, rateUnit: RateUnit.DAY, unitPriceCents: 450_000, priceSource: PriceSource.MANUAL, gctTreatment: STD },
    ],
  },
  {
    id: "qt-0136", number: "QT-0136", clientId: "cl-trevor-dixon", jobId: "job-0136",
    status: QuoteStatus.EXPIRED, createdLabel: "Sent Jun 20", validUntilLabel: "Expired Jul 20, 2026",
    gctRatePct: 15, discountPct: 0, depositCents: 0,
    lines: [
      { id: "l1", category: M, description: "Zinc roofing sheet, 10ft", quantity: 10, rateUnit: RateUnit.UNIT, unitPriceCents: 130_000, priceSource: PriceSource.LOOKUP, gctTreatment: STD },
      { id: "l2", category: L, description: "Carpenter · 1 worker", quantity: 3, rateUnit: RateUnit.DAY, unitPriceCents: 520_000, priceSource: PriceSource.MANUAL, gctTreatment: STD },
    ],
  },
];

/** Totals for a demo quote — the ONLY correct way to get its amount. */
export function demoQuoteTotals(quote: DemoQuote): QuoteTotals {
  return computeTotals({
    lines: quote.lines.map((l) => ({
      quantity: l.quantity,
      unitPriceCents: l.unitPriceCents,
      markupPct: l.markupPct,
      gctTreatment: l.gctTreatment,
    })),
    gctRatePct: quote.gctRatePct,
    discountPct: quote.discountPct,
    depositCents: quote.depositCents,
  });
}

/** Sum of a client's quote totals (for the clients list). */
export function demoClientTotalCents(clientId: string): Cents {
  return demoQuotes
    .filter((q) => q.clientId === clientId)
    .reduce((sum, q) => sum + demoQuoteTotals(q).totalCents, 0);
}

/** Number of quotes for a client. */
export function demoClientQuoteCount(clientId: string): number {
  return demoQuotes.filter((q) => q.clientId === clientId).length;
}

export function findDemoClient(id: string): DemoClient | undefined {
  return demoClients.find((c) => c.id === id);
}

export function findDemoJob(id: string): DemoJob | undefined {
  return demoJobs.find((j) => j.id === id);
}

export function findDemoQuote(idOrNumber: string): DemoQuote | undefined {
  return demoQuotes.find((q) => q.id === idOrNumber || q.number === idOrNumber);
}
