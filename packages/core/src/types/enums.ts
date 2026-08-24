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
  // Jurisdiction-specific wallet (Lynk, GK One, …) is recorded in
  // Payment.providerCode; the valid set comes from the jurisdiction rule-pack.
  MOBILE_MONEY: "MOBILE_MONEY",
  OTHER: "OTHER",
} as const;
export type PaymentMethod = (typeof PaymentMethod)[keyof typeof PaymentMethod];

/** Business entity type — drives jurisdiction rule-pack selection. */
export const EntityType = {
  SOLE_TRADER: "SOLE_TRADER",
  PARTNERSHIP: "PARTNERSHIP",
  LIMITED_COMPANY: "LIMITED_COMPANY",
} as const;
export type EntityType = (typeof EntityType)[keyof typeof EntityType];

/** What a job component draws its cost from. */
export const JobComponentKind = {
  MATERIAL: "MATERIAL",
  LABOUR: "LABOUR",
  /** Plant and hire — a mixer for two days, a truck per trip. Points at the
   * equipment library, so the rate stays the one the contractor maintains
   * rather than a number retyped into a recipe and left to drift from it. */
  EQUIPMENT: "EQUIPMENT",
  OTHER: "OTHER",
} as const;
export type JobComponentKind =
  (typeof JobComponentKind)[keyof typeof JobComponentKind];

/**
 * Per-quote rendering detail level: SUMMARY shows an job line as a
 * single priced row; DETAILED expands it into its component snapshot.
 * Purely a display setting — pricing/totals are identical either way.
 */
export const QuoteDetailLevel = {
  SUMMARY: "SUMMARY",
  DETAILED: "DETAILED",
} as const;
export type QuoteDetailLevel = (typeof QuoteDetailLevel)[keyof typeof QuoteDetailLevel];

/**
 * Where the physical work stands. HAND-SET by the contractor, never derived:
 * the app can see quotes and invoices, but nothing in it knows whether the
 * blocks are actually laid — inferring IN_PROGRESS from a document would be
 * inventing knowledge the system does not have.
 *
 * Deliberately has no INVOICED or PAID member. That is billing state, it
 * already lives on Invoice.status, and modelling the same fact in two places
 * guarantees the two eventually disagree.
 */
export const ProjectStage = {
  /** Work a contractor knows about but has not priced yet. Sits BEFORE
   * QUOTED, and exists because there was previously nowhere to record a job
   * you had been asked about — the ladder started at "Quoted", which is a
   * claim you have already sent the client a price. */
  ENQUIRY: "ENQUIRY",
  QUOTED: "QUOTED",
  WON: "WON",
  IN_PROGRESS: "IN_PROGRESS",
  COMPLETE: "COMPLETE",
  CANCELLED: "CANCELLED",
} as const;
export type ProjectStage = (typeof ProjectStage)[keyof typeof ProjectStage];

/** Every stage in workflow order — drives the stage picker. */
export const PROJECT_STAGES: ProjectStage[] = Object.values(ProjectStage);

/** The one label map. Web list, web detail and mobile all read it, so the
 * same stage can never read three different ways to the same contractor. */
export const PROJECT_STAGE_LABELS: Record<ProjectStage, string> = {
  ENQUIRY: "Enquiry",
  QUOTED: "Quoted",
  WON: "Won",
  IN_PROGRESS: "In progress",
  COMPLETE: "Complete",
  CANCELLED: "Cancelled",
};

/**
 * Whether Project.progressPct says anything at this stage — the read-side
 * rule for every surface that renders it.
 *
 * Only live work has a meaningful "how far along". QUOTED has no committed
 * work to be a fraction of, COMPLETE is done by definition (and a stale 62%
 * on it would contradict the stage), and a CANCELLED project showing "40%"
 * reads as a bug rather than as history. The stored number is never cleared —
 * it is simply not shown where it would mislead.
 */
export function projectStageTracksProgress(stage: ProjectStage): boolean {
  return stage === ProjectStage.WON || stage === ProjectStage.IN_PROGRESS;
}

/**
 * Granular capabilities a JamQuote staff admin can be granted. A super-admin
 * (User.isSuperAdmin) implicitly holds all of them and is the only one who
 * can grant/revoke super-admin or manage other admins. Regular admins are
 * limited to the capabilities in their User.adminCapabilities list — the
 * AdminGuard enforces the required capability per route. Stored as plain
 * strings (User.adminCapabilities String[]) rather than a Prisma enum so
 * adding a capability never needs a DB enum migration.
 */
// NOTE: removing a member here does NOT migrate User.adminCapabilities, which
// is a plain String[]. A revoked capability simply stops matching anything —
// harmless, but the stale string lingers on existing admin rows.
// MANAGE_SUPPLIERS was removed when suppliers became tenant-owned (#31): it
// guarded a platform supplier directory that no longer exists, and leaving it
// listed would offer admins a permission that grants nothing.
export const AdminCapability = {
  /** Suspend / restore / hard-delete tenants and change their plan. */
  MANAGE_TENANTS: "MANAGE_TENANTS",
  /** Edit platform subscription pricing. */
  MANAGE_PRICING: "MANAGE_PRICING",
  /** View the subscription & revenue (financials) screen. */
  VIEW_FINANCIALS: "VIEW_FINANCIALS",
  /** Edit jurisdiction rule-packs (tax/statutory overrides via the console). */
  MANAGE_RULEPACK: "MANAGE_RULEPACK",
  /** Manage admin users and their capabilities. */
  MANAGE_ADMINS: "MANAGE_ADMINS",
} as const;
export type AdminCapability = (typeof AdminCapability)[keyof typeof AdminCapability];

/** Every capability, in display order — the source of truth for admin UIs
 * and server-side validation of a submitted capability list. */
export const ADMIN_CAPABILITIES: AdminCapability[] = Object.values(AdminCapability);

/** Human-readable label + description for each capability, for admin UIs. */
export const ADMIN_CAPABILITY_META: Record<AdminCapability, { label: string; description: string }> = {
  MANAGE_TENANTS: { label: "Manage tenants", description: "Suspend, restore, delete businesses and change their plan" },
  MANAGE_PRICING: { label: "Manage pricing", description: "Edit subscription plan pricing" },
  VIEW_FINANCIALS: { label: "View financials", description: "See subscription revenue and renewals" },
  MANAGE_RULEPACK: { label: "Manage rule-packs", description: "Edit jurisdiction tax/regulatory rules" },
  MANAGE_ADMINS: { label: "Manage admins", description: "Add admins and set their capabilities" },
};

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
