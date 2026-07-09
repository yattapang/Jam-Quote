import { InvoiceStatus, QuoteStatus } from "@jamquote/core";
import type { PillKind, PillVariant } from "@/components/ui/StatusPill";

interface PillSpec {
  label: string;
  kind: PillKind;
  variant: PillVariant;
}

const QUOTE_STATUS_PILL: Record<QuoteStatus, PillSpec> = {
  [QuoteStatus.DRAFT]: { label: "Draft", kind: "neutral", variant: "soft" },
  [QuoteStatus.SENT]: { label: "Sent", kind: "info", variant: "soft" },
  [QuoteStatus.VIEWED]: { label: "Viewed", kind: "info", variant: "solid" },
  [QuoteStatus.ACCEPTED]: { label: "Accepted", kind: "good", variant: "soft" },
  [QuoteStatus.DECLINED]: { label: "Declined", kind: "critical", variant: "soft" },
  [QuoteStatus.EXPIRED]: { label: "Expired", kind: "neutral", variant: "soft" },
  [QuoteStatus.INVOICED]: { label: "Invoiced", kind: "accent", variant: "solid" },
};

const INVOICE_STATUS_PILL: Record<InvoiceStatus, PillSpec> = {
  [InvoiceStatus.DRAFT]: { label: "Draft", kind: "neutral", variant: "soft" },
  [InvoiceStatus.INVOICED]: { label: "Invoiced", kind: "accent", variant: "solid" },
  [InvoiceStatus.PARTIAL]: { label: "Partial", kind: "warn", variant: "soft" },
  [InvoiceStatus.PAID]: { label: "Paid", kind: "good", variant: "solid" },
  [InvoiceStatus.OVERDUE]: { label: "Overdue", kind: "critical", variant: "solid" },
};

export function quoteStatusPill(status: QuoteStatus): PillSpec {
  return QUOTE_STATUS_PILL[status];
}

export function invoiceStatusPill(status: InvoiceStatus): PillSpec {
  return INVOICE_STATUS_PILL[status];
}

export const QUOTE_STATUS_FILTERS: Array<{ label: string; value: QuoteStatus | "ALL" }> = [
  { label: "All", value: "ALL" },
  { label: "Draft", value: QuoteStatus.DRAFT },
  { label: "Sent", value: QuoteStatus.SENT },
  { label: "Viewed", value: QuoteStatus.VIEWED },
  { label: "Accepted", value: QuoteStatus.ACCEPTED },
  { label: "Declined", value: QuoteStatus.DECLINED },
  { label: "Invoiced", value: QuoteStatus.INVOICED },
  { label: "Expired", value: QuoteStatus.EXPIRED },
];

export const INVOICE_STATUS_FILTERS: Array<{ label: string; value: InvoiceStatus | "ALL" }> = [
  { label: "All", value: "ALL" },
  { label: "Invoiced", value: InvoiceStatus.INVOICED },
  { label: "Partial", value: InvoiceStatus.PARTIAL },
  { label: "Paid", value: InvoiceStatus.PAID },
  { label: "Overdue", value: InvoiceStatus.OVERDUE },
];
