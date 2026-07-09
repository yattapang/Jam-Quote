/**
 * Local mock data shaped like the real domain (see docs/ARCHITECTURE.md and
 * extracted/JamQuote.dc.html for the source sample values — Basil Reid,
 * QT-0142, Spanish Town etc.). No network calls; swap for apiClient reads
 * once apps/api is live.
 */
import {
  GctTreatment,
  InvoiceStatus,
  LineCategory,
  PaymentMethod,
  PriceSource,
  QuoteStatus,
  RateUnit,
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

export const clients: Client[] = [
  {
    id: "cl-basil-reid",
    name: "Basil Reid",
    initials: "BR",
    parish: "St. Catherine",
    phone: "876 402 8811",
    address: "Lot 14 Bloxburgh Dr, Spanish Town, St. Catherine",
  },
  {
    id: "cl-paulette-wright",
    name: "Paulette Wright",
    initials: "PW",
    parish: "St. Catherine",
    phone: "876 771 2290",
    address: "22 Passage Fort Dr, Portmore, St. Catherine",
  },
  {
    id: "cl-devon-facey",
    name: "Devon Facey",
    initials: "DF",
    parish: "St. Andrew",
    phone: "876 555 0142",
    address: "8 Angels, St. Andrew",
  },
  {
    id: "cl-marva-grant",
    name: "Marva Grant",
    initials: "MG",
    parish: "Kingston",
    phone: "876 833 4471",
    address: "14 Hope Rd, Kingston 6",
  },
  {
    id: "cl-errol-campbell",
    name: "Errol Campbell",
    initials: "EC",
    parish: "Manchester",
    phone: "876 924 1187",
    address: "Mandeville, Manchester",
  },
  {
    id: "cl-shauna-bailey",
    name: "Shauna Bailey",
    initials: "SB",
    parish: "St. Catherine",
    phone: "876 662 9034",
    address: "Old Harbour, St. Catherine",
  },
  {
    id: "cl-trevor-dixon",
    name: "Trevor Dixon",
    initials: "TD",
    parish: "St. Catherine",
    phone: "876 771 5523",
    address: "Linstead, St. Catherine",
  },
];

export function findClient(id: string): Client | undefined {
  return clients.find((c) => c.id === id);
}

// Full itemized build for the flagship quote (QT-0142) used in the editor.
const qt0142Lines: Quote["lines"] = [
  {
    id: "ln-1",
    category: LineCategory.MATERIAL,
    description: "Cement, 42.5kg bag",
    quantity: 40,
    rateUnit: RateUnit.UNIT,
    unitPriceCents: 115000,
    priceSource: PriceSource.LOOKUP,
    gctTreatment: GctTreatment.STANDARD,
  },
  {
    id: "ln-2",
    category: LineCategory.MATERIAL,
    description: "Rebar 3/8″ x 20ft",
    quantity: 60,
    rateUnit: RateUnit.UNIT,
    unitPriceCents: 65000,
    priceSource: PriceSource.LOOKUP,
    gctTreatment: GctTreatment.STANDARD,
  },
  {
    id: "ln-3",
    category: LineCategory.MATERIAL,
    description: "River sand, per load",
    quantity: 2,
    rateUnit: RateUnit.UNIT,
    unitPriceCents: 550000,
    priceSource: PriceSource.MANUAL,
    gctTreatment: GctTreatment.STANDARD,
  },
  {
    id: "ln-4",
    category: LineCategory.LABOUR,
    description: "Mason · 2 workers",
    quantity: 6,
    rateUnit: RateUnit.DAY,
    unitPriceCents: 450000,
    priceSource: PriceSource.MANUAL,
    gctTreatment: GctTreatment.STANDARD,
  },
  {
    id: "ln-5",
    category: LineCategory.EQUIPMENT,
    description: "Concrete mixer rental",
    quantity: 3,
    rateUnit: RateUnit.DAY,
    unitPriceCents: 600000,
    priceSource: PriceSource.MANUAL,
    gctTreatment: GctTreatment.STANDARD,
  },
];

export const quotes: Quote[] = [
  {
    id: "qt-0142",
    num: "QT-0142",
    clientId: "cl-basil-reid",
    jobLabel: "Retaining wall, Spanish Town",
    status: QuoteStatus.ACCEPTED,
    lines: qt0142Lines,
    gctRatePct: 15,
    discountPct: 5,
    depositCents: 5000000,
    createdLabel: "Sent Jul 9",
    validUntilLabel: "Valid until Aug 8, 2026",
  },
  {
    id: "qt-0141",
    num: "QT-0141",
    clientId: "cl-paulette-wright",
    jobLabel: "Bathroom remodel, Portmore",
    status: QuoteStatus.DRAFT,
    lines: [
      {
        id: "ln-1",
        category: LineCategory.MATERIAL,
        description: "Porcelain floor tile, per box",
        quantity: 48,
        rateUnit: RateUnit.UNIT,
        unitPriceCents: 285000,
        priceSource: PriceSource.LOOKUP,
        gctTreatment: GctTreatment.STANDARD,
      },
      {
        id: "ln-2",
        category: LineCategory.LABOUR,
        description: "Tile setter · 2 workers",
        quantity: 10,
        rateUnit: RateUnit.DAY,
        unitPriceCents: 500000,
        priceSource: PriceSource.MANUAL,
        gctTreatment: GctTreatment.STANDARD,
      },
    ],
    gctRatePct: 15,
    discountPct: 0,
    depositCents: 0,
    createdLabel: "Draft · not sent",
    validUntilLabel: "Valid until Aug 20, 2026",
  },
  {
    id: "qt-0140",
    num: "QT-0140",
    clientId: "cl-devon-facey",
    jobLabel: "Fence & gate, St. Catherine",
    status: QuoteStatus.SENT,
    lines: [
      {
        id: "ln-1",
        category: LineCategory.MATERIAL,
        description: "Galvanized chain-link fencing, per roll",
        quantity: 6,
        rateUnit: RateUnit.UNIT,
        unitPriceCents: 1800000,
        priceSource: PriceSource.LOOKUP,
        gctTreatment: GctTreatment.STANDARD,
      },
      {
        id: "ln-2",
        category: LineCategory.LABOUR,
        description: "General labourer · 1 worker",
        quantity: 4,
        rateUnit: RateUnit.DAY,
        unitPriceCents: 280000,
        priceSource: PriceSource.MANUAL,
        gctTreatment: GctTreatment.STANDARD,
      },
    ],
    gctRatePct: 15,
    discountPct: 0,
    depositCents: 0,
    createdLabel: "Sent 6 days ago",
    validUntilLabel: "Valid until Jul 30, 2026",
  },
  {
    id: "qt-0139",
    num: "QT-0139",
    clientId: "cl-marva-grant",
    jobLabel: "Kitchen tiling, Kingston 6",
    status: QuoteStatus.VIEWED,
    lines: [
      {
        id: "ln-1",
        category: LineCategory.MATERIAL,
        description: "Ceramic wall tile, per box",
        quantity: 55,
        rateUnit: RateUnit.UNIT,
        unitPriceCents: 420000,
        priceSource: PriceSource.LOOKUP,
        gctTreatment: GctTreatment.STANDARD,
      },
      {
        id: "ln-2",
        category: LineCategory.LABOUR,
        description: "Tile setter",
        quantity: 8,
        rateUnit: RateUnit.DAY,
        unitPriceCents: 500000,
        priceSource: PriceSource.MANUAL,
        gctTreatment: GctTreatment.STANDARD,
      },
    ],
    gctRatePct: 15,
    discountPct: 0,
    depositCents: 0,
    createdLabel: "Viewed yesterday",
    validUntilLabel: "Valid until Aug 5, 2026",
  },
  {
    id: "qt-0138",
    num: "QT-0138",
    clientId: "cl-errol-campbell",
    jobLabel: "Carport extension, Mandeville",
    status: QuoteStatus.INVOICED,
    lines: [
      {
        id: "ln-1",
        category: LineCategory.MATERIAL,
        description: "Steel roofing sheets, per sheet",
        quantity: 24,
        rateUnit: RateUnit.UNIT,
        unitPriceCents: 650000,
        priceSource: PriceSource.LOOKUP,
        gctTreatment: GctTreatment.STANDARD,
      },
      {
        id: "ln-2",
        category: LineCategory.LABOUR,
        description: "Carpenter & helper",
        quantity: 9,
        rateUnit: RateUnit.DAY,
        unitPriceCents: 700000,
        priceSource: PriceSource.MANUAL,
        gctTreatment: GctTreatment.STANDARD,
      },
    ],
    gctRatePct: 15,
    discountPct: 0,
    depositCents: 0,
    createdLabel: "Invoiced Jul 1",
    validUntilLabel: "Valid until Jul 31, 2026",
  },
  {
    id: "qt-0137",
    num: "QT-0137",
    clientId: "cl-shauna-bailey",
    jobLabel: "Perimeter block wall, Old Harbour",
    status: QuoteStatus.DECLINED,
    lines: [
      {
        id: "ln-1",
        category: LineCategory.MATERIAL,
        description: "6-inch concrete block",
        quantity: 900,
        rateUnit: RateUnit.UNIT,
        unitPriceCents: 18000,
        priceSource: PriceSource.LOOKUP,
        gctTreatment: GctTreatment.STANDARD,
      },
      {
        id: "ln-2",
        category: LineCategory.LABOUR,
        description: "Mason crew · 3 workers",
        quantity: 14,
        rateUnit: RateUnit.DAY,
        unitPriceCents: 600000,
        priceSource: PriceSource.MANUAL,
        gctTreatment: GctTreatment.STANDARD,
      },
    ],
    gctRatePct: 15,
    discountPct: 0,
    depositCents: 0,
    createdLabel: "Declined Jun 20",
    validUntilLabel: "Expired",
  },
  {
    id: "qt-0136",
    num: "QT-0136",
    clientId: "cl-trevor-dixon",
    jobLabel: "Roof repair, Linstead",
    status: QuoteStatus.EXPIRED,
    lines: [
      {
        id: "ln-1",
        category: LineCategory.MATERIAL,
        description: "Roofing nails & sealant",
        quantity: 1,
        rateUnit: RateUnit.JOB,
        unitPriceCents: 1500000,
        priceSource: PriceSource.MANUAL,
        gctTreatment: GctTreatment.STANDARD,
      },
      {
        id: "ln-2",
        category: LineCategory.LABOUR,
        description: "Roofer",
        quantity: 3,
        rateUnit: RateUnit.DAY,
        unitPriceCents: 500000,
        priceSource: PriceSource.MANUAL,
        gctTreatment: GctTreatment.STANDARD,
      },
    ],
    gctRatePct: 15,
    discountPct: 0,
    depositCents: 0,
    createdLabel: "Expired Jun 1",
    validUntilLabel: "Expired",
  },
];

export function findQuote(id: string): Quote | undefined {
  return quotes.find((q) => q.id === id);
}

export const invoices: Invoice[] = [
  {
    id: "inv-0098",
    num: "INV-0098",
    quoteId: "qt-0142",
    clientId: "cl-basil-reid",
    status: InvoiceStatus.OVERDUE,
    dueLabel: "Overdue 9 days",
    dueDate: "2026-06-30",
    overdueDays: 9,
    payments: [],
  },
  {
    id: "inv-0097",
    num: "INV-0097",
    quoteId: "qt-0138",
    clientId: "cl-errol-campbell",
    status: InvoiceStatus.INVOICED,
    dueLabel: "Due Jul 18",
    dueDate: "2026-07-18",
    payments: [],
  },
  {
    id: "inv-0096",
    num: "INV-0096",
    quoteId: "qt-0139",
    clientId: "cl-marva-grant",
    status: InvoiceStatus.PAID,
    dueLabel: "Paid Jul 2",
    dueDate: "2026-07-02",
    payments: [
      { id: "pay-1", amountCents: 42190000, method: PaymentMethod.BANK_TRANSFER, dateLabel: "Jul 2, 2026" },
    ],
  },
  {
    id: "inv-0095",
    num: "INV-0095",
    quoteId: "qt-0141",
    clientId: "cl-paulette-wright",
    status: InvoiceStatus.INVOICED,
    dueLabel: "Due Jul 24",
    dueDate: "2026-07-24",
    payments: [],
  },
  {
    id: "inv-0094",
    num: "INV-0094",
    quoteId: "qt-0136",
    clientId: "cl-trevor-dixon",
    status: InvoiceStatus.PAID,
    dueLabel: "Paid Jun 28",
    dueDate: "2026-06-28",
    payments: [
      { id: "pay-2", amountCents: 9450000, method: PaymentMethod.CASH, dateLabel: "Jun 28, 2026" },
    ],
  },
];

export function findInvoice(id: string): Invoice | undefined {
  return invoices.find((i) => i.id === id);
}

export const regulatoryAlerts: RegulatoryAlert[] = [
  {
    id: "reg-gct-threshold",
    title: "GCT threshold update takes effect Aug 1, 2026",
    detail:
      "The standard GCT rate and registration threshold change Aug 1, 2026 — review your default pricing and quote templates before then.",
    effectiveLabel: "Effective Aug 1, 2026",
    severity: "warn",
  },
  {
    id: "reg-trn-verification",
    title: "New TRN verification requirement for invoices over $500,000",
    detail:
      "Invoices billing more than $500,000 JMD must display a verified TRN match for both business and client starting this date.",
    effectiveLabel: "Effective Sep 1, 2026",
    severity: "info",
  },
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
