/**
 * Shared domain enums. These mirror the Prisma schema exactly so api, web,
 * and mobile all speak the same language. Kept framework-free.
 */

export const LineCategory = {
  MATERIAL: "MATERIAL",
  LABOUR: "LABOUR",
  EQUIPMENT: "EQUIPMENT",
  RENTAL: "RENTAL",
  SUBCONTRACTOR: "SUBCONTRACTOR",
  OTHER: "OTHER",
} as const;
export type LineCategory = (typeof LineCategory)[keyof typeof LineCategory];

/** Rate cadence — labour rates and rentals can be any of these. */
export const RateUnit = {
  HOUR: "HOUR",
  DAY: "DAY",
  WEEK: "WEEK",
  MONTH: "MONTH",
  JOB: "JOB",
  UNIT: "UNIT",
} as const;
export type RateUnit = (typeof RateUnit)[keyof typeof RateUnit];

export const GctTreatment = {
  STANDARD: "STANDARD",
  ZERO_RATED: "ZERO_RATED",
  EXEMPT: "EXEMPT",
} as const;
export type GctTreatment = (typeof GctTreatment)[keyof typeof GctTreatment];

export const PriceSource = {
  MANUAL: "MANUAL",
  LOOKUP: "LOOKUP",
  SCAN: "SCAN",
} as const;
export type PriceSource = (typeof PriceSource)[keyof typeof PriceSource];

export const QuoteStatus = {
  DRAFT: "DRAFT",
  SENT: "SENT",
  VIEWED: "VIEWED",
  ACCEPTED: "ACCEPTED",
  DECLINED: "DECLINED",
  EXPIRED: "EXPIRED",
  INVOICED: "INVOICED",
} as const;
export type QuoteStatus = (typeof QuoteStatus)[keyof typeof QuoteStatus];

export const InvoiceStatus = {
  DRAFT: "DRAFT",
  INVOICED: "INVOICED",
  PARTIAL: "PARTIAL",
  PAID: "PAID",
  OVERDUE: "OVERDUE",
} as const;
export type InvoiceStatus = (typeof InvoiceStatus)[keyof typeof InvoiceStatus];

export const PaymentMethod = {
  CARD: "CARD", // WiPay debit/credit
  CASH: "CASH",
  BANK_TRANSFER: "BANK_TRANSFER",
  LYNK: "LYNK",
  OTHER: "OTHER",
} as const;
export type PaymentMethod = (typeof PaymentMethod)[keyof typeof PaymentMethod];

/** The 14 parishes of Jamaica. */
export const PARISHES = [
  "Kingston",
  "St. Andrew",
  "St. Thomas",
  "Portland",
  "St. Mary",
  "St. Ann",
  "Trelawny",
  "St. James",
  "Hanover",
  "Westmoreland",
  "St. Elizabeth",
  "Manchester",
  "Clarendon",
  "St. Catherine",
] as const;
export type Parish = (typeof PARISHES)[number];
