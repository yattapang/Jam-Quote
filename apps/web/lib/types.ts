import type {
  InvoiceStatus,
  PaymentMethod,
  Parish,
  QuoteLineItemInput,
  QuoteStatus,
} from "@jamquote/core";

export interface QuoteLine extends QuoteLineItemInput {
  id: string;
}

export interface Quote {
  id: string;
  num: string;
  clientId: string;
  jobId?: string;
  jobLabel: string;
  status: QuoteStatus;
  lines: QuoteLine[];
  gctRatePct: number;
  discountPct: number;
  depositCents: number;
  createdAt: string; // ISO — raw creation date, for date math (dashboard stats, sorting)
  createdLabel: string;
  validUntilLabel: string;
  /** Raw ISO validity deadline (undated quotes omit it). Used by the quote
   * builder to derive its "valid for N days" field when editing. */
  validUntil?: string;
  /** Section groupings, title preserved — populated only for detail rows
   * (list rows may omit `lines`/`sections` entirely). `lines` above already
   * includes every section's lines flattened in for totals/category display;
   * this is additional grouping data for round-tripping the quote builder. */
  sections?: { title: string; lines: QuoteLine[] }[];
  /** Denormalized total from the API (computed via computeTotals). Set on list
   * rows where `lines` may be omitted; detail rows carry both. */
  totalCents?: number;
}

export interface Client {
  id: string;
  firstName: string;
  lastName: string;
  /** Computed `firstName + " " + lastName` — kept for existing display usages. */
  name: string;
  initials: string;
  parish: Parish;
  phone: string;
  address: string;
}

export interface Payment {
  id: string;
  amountCents: number;
  method: PaymentMethod;
  dateLabel: string;
}

export interface Invoice {
  id: string;
  num: string;
  quoteId: string;
  clientId: string;
  status: InvoiceStatus;
  dueLabel: string;
  dueDate: string;
  overdueDays?: number;
  payments: Payment[];
}

export interface RegulatoryAlert {
  id: string;
  title: string;
  detail: string;
  effectiveLabel: string;
  severity: "warn" | "info" | "critical";
}

export interface BusinessProfile {
  name: string;
  ownerFirstName: string;
  trn: string;
  parish: Parish;
  tradeType: string;
  defaultGctRatePct: number;
  phone: string;
  email: string;
  whatsapp: { connected: boolean; label: string };
  emailChannel: { connected: boolean; label: string };
  plan: {
    name: string;
    priceCents: number;
    renewsLabel: string;
    features: string;
  };
}
