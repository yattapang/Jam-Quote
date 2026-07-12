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
  /** Optional — present once the client has an email on file. Powers "Send by email". */
  email?: string;
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

/** The real, API-backed business profile (mirrors the Prisma `Business`
 * model's editable identity fields — see business.dto's updateBusinessSchema).
 * Distinct from `BusinessProfile` above, which still backs the
 * not-yet-persisted WhatsApp/email-connection and subscription-plan fixture
 * data shown on the settings page. */
export interface Business {
  id: string;
  name: string;
  trn: string;
  parish: Parish;
  tradeType: string;
  addressLine: string;
  /** Business.defaultGctRate is a Decimal already stored as a PERCENTAGE
   * (e.g. 15 means 15%) — not a 0–1 fraction. See schema.prisma's comment on
   * `Business.defaultGctRate` and quotes.service's `Number(business.defaultGctRate)`
   * used directly as `gctRatePct`. */
  defaultGctRatePct: number;
  countryCode: string;
  currency: string;
}
