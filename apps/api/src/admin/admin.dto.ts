import { z } from "zod";
import { ADMIN_CAPABILITIES } from "@jamquote/core";

// zod's z.enum needs a non-empty string tuple; ADMIN_CAPABILITIES is the
// single source of truth for valid capability values (from core).
const capabilityEnum = z.enum(ADMIN_CAPABILITIES as [string, ...string[]]);

export const setTenantPlanSchema = z.object({
  plan: z.enum(["free", "pro"]),
  /**
   * The term. Annual is the long-term option: it renews a year out and is
   * priced from proAnnualPriceCents, which is deliberately below twelve
   * monthly payments — that discount IS the incentive to commit for a year.
   */
  interval: z.enum(["monthly", "annual"]).optional(),
  /**
   * A negotiated price for THIS tenant, per term, in cents. Omit to charge the
   * standard price for the interval; null clears a previous negotiation and
   * returns them to standard. Kept separate from the global pricing config so
   * one tenant's deal never moves everyone else's bill.
   */
  priceCents: z.number().int().nonnegative().nullable().optional(),
  renewsAt: z.string().datetime().optional(),
});
export type SetTenantPlanInput = z.infer<typeof setTenantPlanSchema>;

/** Body for DELETE /admin/tenants/:id — must match the business's exact name. */
export const hardDeleteTenantSchema = z.object({
  confirmName: z.string().min(1),
});
export type HardDeleteTenantInput = z.infer<typeof hardDeleteTenantSchema>;

// The supplier schemas used to live here, for the admin supplier CRUD.
// Suppliers are tenant-owned now — catalogs.dto.ts owns those schemas and the
// staff console has no supplier surface at all.

/** Body for POST /admin/admins — promote an EXISTING user (by email) to an
 * internal admin with the given capabilities. isSuperAdmin may only be set by
 * a super-admin (enforced in AdminService). */
export const promoteAdminSchema = z.object({
  email: z.string().email(),
  capabilities: z.array(capabilityEnum).default([]),
  isSuperAdmin: z.boolean().optional(),
});
export type PromoteAdminInput = z.infer<typeof promoteAdminSchema>;

/** Body for PATCH /admin/admins/:id — update an admin's capabilities and/or
 * super-admin status. At least one field required. */
export const updateAdminSchema = z
  .object({
    capabilities: z.array(capabilityEnum).optional(),
    isSuperAdmin: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: "At least one field must be provided",
  });
export type UpdateAdminInput = z.infer<typeof updateAdminSchema>;

/**
 * Regulatory feed CRUD (staff console).
 *
 * `category` is a free string in the schema with a documented convention
 * (GCT | NHT | TRN | MIN_WAGE | PERMIT | OTHER) rather than an enum, and that
 * stays true here: a new levy should not need a migration to be recorded.
 *
 * `actionNeeded` carries the same meaning it always has — a non-empty value
 * means this change requires work, which is what drives "Needs review" in the
 * console. It is nullable so an entry can be downgraded to monitoring.
 */
export const createRegulatoryUpdateSchema = z.object({
  title: z.string().min(1),
  category: z.string().min(1),
  summary: z.string().min(1),
  effectiveDate: z.coerce.date().nullable().optional(),
  actionNeeded: z.string().nullable().optional(),
  sourceUrl: z.string().url().nullable().optional(),
  publishedAt: z.coerce.date().optional(),
});
export type CreateRegulatoryUpdateInput = z.infer<typeof createRegulatoryUpdateSchema>;

/** Every field optional — an omitted key leaves the stored value alone, while
 * an explicit null clears a nullable one (same convention as the invoice
 * client picker: null is a value the caller can legitimately mean). */
export const updateRegulatoryUpdateSchema = createRegulatoryUpdateSchema.partial();
export type UpdateRegulatoryUpdateInput = z.infer<typeof updateRegulatoryUpdateSchema>;

/** Body for PATCH /admin/regulatory/:id/review — `reviewed: false` reopens an
 * entry marked reviewed by mistake, which must be possible or the only way
 * back is editing the database. */
export const reviewRegulatoryUpdateSchema = z.object({
  reviewed: z.boolean(),
});
export type ReviewRegulatoryUpdateInput = z.infer<typeof reviewRegulatoryUpdateSchema>;

/**
 * Body for POST /admin/tenants/:id/subscription-payments.
 *
 * `amountCents` is optional: omitted means the agreed price for the tenant's
 * term, which is the common case and keeps the form a single click. It is
 * never inferred FROM the amount — a short payment must stay visible as a
 * short payment rather than silently redefining the agreed rate.
 */
export const recordSubscriptionPaymentSchema = z.object({
  amountCents: z.number().int().positive().optional(),
  method: z.enum(["CARD", "CASH", "BANK_TRANSFER", "MOBILE_MONEY", "OTHER"]),
  /** Cheque number, bank reference, wallet transaction id — whatever lets this
   * be matched against a bank statement later. */
  reference: z.string().max(120).optional(),
  /** When the money actually arrived, if that differs from when it was keyed
   * in. Defaults to now. */
  paidAt: z.string().datetime().optional(),
  /** Switch the tenant onto a different term with this payment (e.g. monthly
   * to annual at renewal). Defaults to the term they are already on. */
  interval: z.enum(["monthly", "annual"]).optional(),
  note: z.string().max(500).optional(),
});
export type RecordSubscriptionPaymentInput = z.infer<typeof recordSubscriptionPaymentSchema>;
