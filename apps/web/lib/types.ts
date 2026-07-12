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
  createdLabel: string;
  validUntilLabel: string;
  /** Denormalized total from the API (computed via computeTotals). Set on list
   * rows where `lines` may be omitted; detail rows carry both. */
  totalCents?: number;
}

export interface Client {
  id: string;
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
