import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { UserRole, type Business } from "@prisma/client";
import {
  AdminCapability,
  SubscriptionStanding,
  subscriptionStanding,
  supportedJurisdictions,
  nextTermEnd,
  expandAdminCapabilities,
} from "@jamquote/core";
import { PrismaService } from "../prisma/prisma.service.js";
import { startOfJamaicaMonth } from "../common/month.util.js";
import { PricingService, type PricingSnapshot } from "../billing/pricing.service.js";
import type { UpdatePricingInput } from "../billing/billing.dto.js";
import type {
  CreateRegulatoryUpdateInput,
  PromoteAdminInput,
  SetTenantPlanInput,
  UpdateAdminInput,
  UpdateRegulatoryUpdateInput,
} from "./admin.dto.js";

/** The acting admin's authorization, from AdminGuard's req.adminContext.
 * Passed into admin-management methods so they can enforce super-admin-only
 * rules and prevent self-lockout. `capabilities`, when present, is the
 * EFFECTIVE (already-expanded, see expandAdminCapabilities) list — optional
 * because some existing call sites/tests construct an actor without needing
 * a capability-gated method. */
export interface AdminActor {
  userId: string;
  isSuperAdmin: boolean;
  capabilities?: string[];
}

/** One internal staff admin, as returned by the admin-management endpoints.
 * `businessId` is decision 4b's dual-role signal: non-null here means this
 * admin ALSO still has a tenant link (either a legacy admin promoted before
 * promoteAdmin started clearing it, or — should the refusal below ever be
 * bypassed some other way — a new one). The console renders a warning badge
 * for it; see REVIEW-FINDINGS.md, "Dual-role admins (decision 4b)". */
export interface AdminUser {
  id: string;
  email: string | null;
  fullName: string | null;
  isSuperAdmin: boolean;
  capabilities: string[];
  businessId: string | null;
  createdAt: Date;
}
import { AuditService } from "./audit.service.js";
import { AuthService } from "../auth/auth.service.js";
import { deleteBusinessCascade } from "./tenant-deletion.util.js";

export interface AdminOverview {
  businesses: number;
  activeSubscriptions: number;
  suppliersTracked: number;
  jurisdictionsLive: number;
}

export interface AdminTenant {
  id: string;
  name: string;
  parish: string | null;
  plan: string;
  /** "monthly" | "annual" — the term. Free tenants report "monthly". */
  interval: string;
  /** Negotiated per-term price in cents, or null for the standard price. */
  priceCents: number | null;
  renewsAt: Date | null;
  trn: string | null;
  createdAt: Date;
  /**
   * When this tenant last did anything, or null if they never have.
   *
   * The most recent `Quote.updatedAt`, which is the only activity timestamp the
   * platform records — there is no `lastLoginAt`. A soft-delete counts, because
   * deleting a quote is activity and `@updatedAt` bumps on it.
   *
   * The console's LAST ACTIVE column used to render `createdAt` — the signup date —
   * which on a screen used to decide who to suspend is the most misleading possible
   * substitute: a dormant tenant who signed up yesterday looked active, and a busy
   * one from 2024 looked abandoned.
   */
  lastActiveAt: Date | null;
  quoteCount: number;
  suspended: boolean;
}

export interface AdminRegulatoryUpdate {
  id: string;
  title: string;
  category: string;
  summary: string;
  effectiveDate: Date | null;
  sourceUrl: string | null;
  actionNeeded: string | null;
  publishedAt: Date;
  /** Null means outstanding. Drives the console's "Applied (YTD)" count, which
   * before this column existed could never be anything but zero. */
  reviewedAt: Date | null;
  reviewedByUserId: string | null;
}

export interface AdminUpcomingRenewal {
  businessId: string;
  businessName: string;
  plan: string;
  renewsAt: Date;
}

export interface AdminFinancials {
  freeCount: number;
  proCount: number;
  /** How many of the pro tenants are on a yearly term. */
  annualCount: number;
  currency: string;
  proMonthlyPriceCents: number;
  /**
   * CONTRACTED run-rate: what paying tenants owe per month. Not income.
   *
   * Shown beside `collectedThisMonthCents` on purpose. With only this figure
   * visible, recording a payment appeared to do nothing — the tenant already
   * owed the same amount — and there was no way to see whether the money had
   * actually arrived.
   */
  mrrCents: number;
  /** Money that ACTUALLY arrived this calendar month, from the payment ledger,
   * excluding voided rows. */
  collectedThisMonthCents: number;
  /** Paying tenants whose term has already ended — the ones to chase. */
  pastDueCount: number;
  upcomingRenewals: AdminUpcomingRenewal[];
}

const SIXTY_DAYS_MS = 60 * 24 * 60 * 60 * 1000;

/**
 * Start of the current calendar month in JAMAICA local time.
 *
 * Deliberately not `startOfCurrentMonth` from common/month.util.ts, which uses
 * server time: that one gates the free quota, where an hour either side of a
 * boundary is harmless. This is an accounting period, and it has to agree with
 * the month a contractor sees in their own Reports — which bucket in Jamaica
 * time. A figure labelled "this month" that means two different months in two
 * places is the kind of thing nobody catches until the numbers are disputed.
 */
// startOfJamaicaMonth moved to common/month.util.ts — it was the only correct
// copy, and `startOfCurrentMonth` next to it had the server-clock bug.


// A manual staff-side renewal used to compute its own "one term from today"
// with local setMonth/setFullYear — both the Jamaica-timezone bug and the
// month-end overflow bug that `nextTermEnd` in core now fixes in one shared
// place. Spend that instead of keeping a second copy here.
//
// THE RULE, in one sentence: a plan/interval switch RE-PRICES the subscription;
// it never buys or destroys time, so `renewsAt` afterwards is the furthest date
// the tenant has already been paid up to or granted — and never a date in the
// past.
//
// In precedence order:
//  1. Same plan AND same interval on a live term -> a true no-op. Nothing about
//     the commercial term changed, so `renewsAt` must not move at all. (This is
//     what a re-save must do; without it, alternating annual<->monthly stacked a
//     fresh term on every call with no payment ever recorded.)
//  2. The LEDGER's paid-through (the latest non-voided `coversUntil`), when it is
//     still in the future. This is the authoritative figure and no term is added.
//  3. Otherwise the current `renewsAt`, when THAT is still in the future — a term
//     an admin granted by hand, with no payment behind it. Kept, not shortened.
//  4. Otherwise one term from today: nothing is paid or granted ahead, so this is
//     the admin putting a lapsed or brand-new tenant back on the clock.
//
// ## Why the ledger and not `renewsAt`, and why no new term
//
// This has to match `SubscriptionPaymentsService.reallocateTerms`, which is the
// only other writer of `renewsAt` and which recomputes it from the ledger alone
// on every payment recorded and every payment voided. Any date a switch invents
// that the ledger does not back is therefore temporary: the next real payment
// silently overwrites it. That produced two visible defects.
//
//  - Granting a term on a switch made the console and the sweep disagree:
//    monthly -> annual read `renewsAt` a year out while the ledger said one month,
//    so an unpaid year was on the clock. Recording the real annual payment then
//    moved nothing, because `reallocateTerms` recomputed from the ledger and
//    landed on the same date the switch had already claimed — a payment that
//    visibly did nothing. With the rule above, the switch leaves paid-through
//    alone and that payment extends it by a full term, which is what it bought.
//  - Basing the new term on `coversUntil` UNCONDITIONALLY put `renewsAt` in the
//    PAST whenever the surviving ledger lagged the row (payments voided, or a term
//    granted by hand): `{pro, annual, renewsAt 2027-01-01}` with one payment
//    covering to 2026-03-01 switched to monthly gave 2026-03-29, which reads as
//    PAST_DUE, so the revert sweep downgraded a live paying tenant to free and
//    emailed them. Steps 2 and 3 are both gated on being in the future for that
//    reason, and the FURTHEST of the two wins, so this function can only ever move
//    `renewsAt` forwards, or leave it — proven by the test that a nearer ledger date
//    cannot shorten a further granted term.
//
// A FUTURE `coversUntil` wins whatever the current plan says, including `free`.
// Setting a tenant free nulls `renewsAt`, so after paid -> free -> paid the ledger
// is the only surviving record of the term they bought; reading it only for a
// currently-paid row destroyed that paid time.
function nextRenewal(
  interval: string,
  current: { plan: string; interval: string; renewsAt: Date | null } | null,
  latestPaymentCoversUntil: Date | null,
  samePlanAndInterval: boolean,
  from: Date = new Date(),
): Date | null {
  if (samePlanAndInterval) return current?.renewsAt ?? null;

  // The FURTHEST future of the two, not the first one that happens to be future.
  // Checking `coversUntil` first and returning it let a NEARER ledger date overwrite
  // a further `renewsAt`: `{renewsAt 2028-01-01}` with one surviving payment covering
  // 18 days out switched to monthly gave that ledger date and silently deleted 15
  // months of hand-granted term. It also compounded, because `recordPayment` takes
  // `coversFrom` from the reduced `renewsAt`, so the next payment did not restore it.
  // Whichever record says the tenant is entitled to more time is the one that stands.
  const entitled = [latestPaymentCoversUntil, current?.renewsAt ?? null].filter(
    (d): d is Date => d !== null && d.getTime() > from.getTime(),
  );
  if (entitled.length > 0) {
    return entitled.reduce((furthest, d) => (d.getTime() > furthest.getTime() ? d : furthest));
  }
  return nextTermEnd(interval, null, from);
}

/**
 * What one pro subscription is worth PER MONTH.
 *
 * A negotiated price wins over the list price; an annual term is divided by
 * twelve. Rounded to the cent so a sum of these is a payable figure rather
 * than carrying fractions.
 */
function monthlyValueCents(
  sub: { interval: string; priceCents: number | null },
  pricing: { proMonthlyPriceCents: number; proAnnualPriceCents: number },
): number {
  const annual = sub.interval === "annual";
  const agreed = sub.priceCents ?? (annual ? pricing.proAnnualPriceCents : pricing.proMonthlyPriceCents);
  return annual ? Math.round(agreed / 12) : agreed;
}

/** One select for every regulatory read and write. Separate literals drift —
 * the material catalog lost a unit that way when its writes omitted a join its
 * reads had. */
const REGULATORY_SELECT = {
  id: true,
  title: true,
  category: true,
  summary: true,
  effectiveDate: true,
  sourceUrl: true,
  actionNeeded: true,
  publishedAt: true,
  reviewedAt: true,
  reviewedByUserId: true,
} as const;

/**
 * Platform-level admin service for the internal JamQuote staff console.
 * Deliberately NOT business-scoped — no businessId filtering. Reads across
 * every tenant. Only reachable via the internal /admin routes.
 */
@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pricingService: PricingService,
    private readonly audit: AuditService,
    private readonly auth: AuthService,
  ) {}

  /**
   * POST /admin/tenants/:id/impersonate — mint a short-lived, read-only token
   * scoping the tenant API to this business, so an admin can see what the
   * contractor sees while diagnosing a support issue.
   *
   * The audit entry is written BEFORE the token is minted, and a failure to
   * write it is deliberately not caught. If we cannot record who read a
   * company's books and when, then we do not get to read them: an unlogged
   * look is indistinguishable from one that never happened, and this is the
   * most sensitive capability in the console.
   *
   * A suspended tenant is refused. Suspension means the account is closed, and
   * reading its data should require a deliberate restore rather than a quieter
   * side entrance.
   */
  async impersonateTenant(
    id: string,
    actorUserId: string,
    actor?: AdminActor,
  ): Promise<{ token: string; expiresAt: string; business: { id: string; name: string } }> {
    // Decision 5b: IMPERSONATE_TENANTS, not MANAGE_TENANTS, gates this route.
    // AdminGuard already enforces this via @RequireCapability on the
    // controller, but re-checking here is deliberate defense in depth — this
    // is, per the docblock above, the most sensitive capability in the
    // console, and it should not depend solely on a decorator never being
    // dropped in a future refactor. `actor` is optional only so existing
    // direct-service-call tests that predate this check keep compiling;
    // every real caller (AdminController) passes req.adminContext.
    if (actor && !actor.isSuperAdmin && !actor.capabilities?.includes(AdminCapability.IMPERSONATE_TENANTS)) {
      throw new ForbiddenException(`Missing required admin capability: ${AdminCapability.IMPERSONATE_TENANTS}`);
    }

    const business = await this.prisma.business.findUnique({ where: { id } });
    if (!business) throw new NotFoundException("Business not found");
    if (business.deletedAt) throw new BadRequestException("Tenant is suspended");

    const admin = await this.prisma.user.findUnique({
      where: { id: actorUserId },
      select: { id: true, role: true },
    });
    if (!admin) throw new NotFoundException("Admin user not found");

    await this.audit.record({
      actorUserId,
      action: "tenant.impersonate",
      targetType: "Business",
      targetId: id,
      details: { name: business.name },
    });

    const { token, expiresAt } = this.auth.issueImpersonationToken(admin, business.id);
    return { token, expiresAt, business: { id: business.id, name: business.name } };
  }

  async overview(): Promise<AdminOverview> {
    const [businesses, activeSubscriptions, suppliersTracked] = await Promise.all([
      this.prisma.business.count({ where: { deletedAt: null } }),
      this.prisma.subscription.count({ where: { status: "active" } }),
      // Suppliers are tenant-owned now, so this is the sum across every
      // contractor's own list rather than a curated feed — retired ones must
      // not inflate it.
      this.prisma.supplier.count({ where: { deletedAt: null } }),
    ]);

    return {
      businesses,
      activeSubscriptions,
      suppliersTracked,
      jurisdictionsLive: supportedJurisdictions().length,
    };
  }

  /**
   * Lists tenants. By default, excludes soft-deleted (suspended) businesses
   * to preserve existing callers' expectations; pass includeSuspended: true
   * to see them too (each row still carries its own `suspended` flag either
   * way, so the shape never changes — only the set of rows returned does).
   *
   * `includePrice` (default true for callers that don't pass it — internal
   * callers, not the controller) controls whether `priceCents` — the
   * negotiated subscription price — is included. AdminController.tenants
   * passes false for a caller without VIEW_FINANCIALS/MANAGE_TENANTS, since
   * plan + interval + priceCents across every row is exactly what would let
   * that caller reconstruct the financials screen (MRR, renewal mix) from a
   * route that itself requires no capability.
   */
  async tenants(includeSuspended = false, includePrice = true): Promise<AdminTenant[]> {
    const businesses = await this.prisma.business.findMany({
      where: includeSuspended ? {} : { deletedAt: null },
      include: {
        subscription: true,
        // Quote is soft-deleted (`deletedAt`), so an unfiltered count includes
        // tombstones: a tenant who deleted 40 draft quotes still showed
        // "40 quotes" on the admin console.
        _count: { select: { quotes: { where: { deletedAt: null } } } },
        // The newest quote touch, as the tenant's last activity.
        //
        // Prisma resolves a `take`-limited include as ONE extra windowed query, not
        // one per tenant — so this is not N+1. It is NOT index-assisted, though:
        // `Quote` has no index on `updatedAt` (only `[businessId, number, version]`,
        // `[businessId, status]` and `[clientId]`), so the sort is over every quote
        // of every tenant on each admin page load. An earlier version of this
        // comment claimed an index that does not exist; a review caught it. F58
        // covers adding `@@index([businessId, updatedAt])` when this screen starts
        // to feel it.
        quotes: {
          where: { deletedAt: null },
          select: { updatedAt: true },
          orderBy: { updatedAt: "desc" },
          take: 1,
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return businesses.map((b) => ({
      id: b.id,
      name: b.name,
      parish: b.parish,
      plan: b.subscription?.plan ?? "Free",
      interval: b.subscription?.interval ?? "monthly",
      priceCents: includePrice ? b.subscription?.priceCents ?? null : null,
      renewsAt: b.subscription?.renewsAt ?? null,
      trn: b.trn,
      createdAt: b.createdAt,
      lastActiveAt: b.quotes[0]?.updatedAt ?? null,
      quoteCount: b._count.quotes,
      suspended: b.deletedAt !== null,
    }));
  }

  /** PATCH /admin/tenants/:id/suspend — reversible soft-delete. */
  async suspendTenant(id: string, actorUserId: string): Promise<Business> {
    const business = await this.prisma.business.findUnique({ where: { id } });
    if (!business) throw new NotFoundException("Business not found");
    if (business.deletedAt) throw new BadRequestException("Tenant is already suspended");

    const updated = await this.prisma.business.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    await this.audit.record({
      actorUserId,
      action: "tenant.suspend",
      targetType: "Business",
      targetId: id,
      details: { name: business.name },
    });

    return updated;
  }

  /** PATCH /admin/tenants/:id/restore — undo a suspend. */
  async restoreTenant(id: string, actorUserId: string): Promise<Business> {
    const business = await this.prisma.business.findUnique({ where: { id } });
    if (!business) throw new NotFoundException("Business not found");
    if (!business.deletedAt) throw new BadRequestException("Tenant is not suspended");

    const updated = await this.prisma.business.update({
      where: { id },
      data: { deletedAt: null },
    });

    await this.audit.record({
      actorUserId,
      action: "tenant.restore",
      targetType: "Business",
      targetId: id,
      details: { name: business.name },
    });

    return updated;
  }

  /**
   * DELETE /admin/tenants/:id — PERMANENT hard delete. Irreversible, so it
   * requires confirmName to exactly match the business's current name
   * (case-sensitive) before anything is touched. Deletes the business and
   * every row it owns inside a single transaction (see
   * ./tenant-deletion.util.ts for the FK-safe order, shared with
   * prisma/cleanup-seed.ts).
   */
  async hardDeleteTenant(
    id: string,
    confirmName: string,
    actorUserId: string,
  ): Promise<{ deleted: true; businessId: string }> {
    const business = await this.prisma.business.findUnique({ where: { id } });
    if (!business) throw new NotFoundException("Business not found");
    if (confirmName !== business.name) {
      throw new BadRequestException("confirmName does not match the business name");
    }

    await this.prisma.$transaction((tx) => deleteBusinessCascade(tx, id));

    await this.audit.record({
      actorUserId,
      action: "tenant.delete",
      targetType: "Business",
      targetId: id,
      details: { name: business.name },
    });

    return { deleted: true, businessId: id };
  }

  // Supplier management deliberately does NOT live here. Suppliers are
  // tenant-owned — each contractor keeps their own merchant list via
  // SuppliersService — and there is no curated directory for staff to
  // administer, so an admin CRUD surface over that table would only be a way
  // to reach into tenants' private data.

  regulatory(): Promise<AdminRegulatoryUpdate[]> {
    return this.prisma.regulatoryUpdate.findMany({
      orderBy: { publishedAt: "desc" },
      select: REGULATORY_SELECT,
    });
  }

  /**
   * Regulatory feed CRUD. The feed was read-only: staff could see a change but
   * not record one, correct one, or mark it dealt with — which is what "the
   * regulatory review is static" meant when it was reported.
   *
   * Every mutation is audited. This feed is the platform's record of which tax
   * and statutory changes it has responded to; a silent edit to it is exactly
   * the thing an audit log exists for.
   */
  async createRegulatory(
    input: CreateRegulatoryUpdateInput,
    actorUserId: string,
  ): Promise<AdminRegulatoryUpdate> {
    const created = await this.prisma.regulatoryUpdate.create({
      data: {
        title: input.title,
        category: input.category,
        summary: input.summary,
        effectiveDate: input.effectiveDate ?? null,
        actionNeeded: input.actionNeeded ?? null,
        sourceUrl: input.sourceUrl ?? null,
        ...(input.publishedAt ? { publishedAt: input.publishedAt } : {}),
      },
      select: REGULATORY_SELECT,
    });
    await this.audit.record({
      actorUserId,
      action: "regulatory.create",
      targetType: "RegulatoryUpdate",
      targetId: created.id,
      details: { title: created.title, category: created.category },
    });
    return created;
  }

  async updateRegulatory(
    id: string,
    input: UpdateRegulatoryUpdateInput,
    actorUserId: string,
  ): Promise<AdminRegulatoryUpdate> {
    await this.findRegulatoryOrThrow(id);
    const updated = await this.prisma.regulatoryUpdate.update({
      where: { id },
      // Only keys actually present are written: an omitted key leaves the
      // stored value alone, while an explicit null clears a nullable field.
      data: {
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.category !== undefined ? { category: input.category } : {}),
        ...(input.summary !== undefined ? { summary: input.summary } : {}),
        ...(input.effectiveDate !== undefined ? { effectiveDate: input.effectiveDate } : {}),
        ...(input.actionNeeded !== undefined ? { actionNeeded: input.actionNeeded } : {}),
        ...(input.sourceUrl !== undefined ? { sourceUrl: input.sourceUrl } : {}),
        ...(input.publishedAt !== undefined ? { publishedAt: input.publishedAt } : {}),
      },
      select: REGULATORY_SELECT,
    });
    await this.audit.record({
      actorUserId,
      action: "regulatory.update",
      targetType: "RegulatoryUpdate",
      targetId: id,
      details: { fields: Object.keys(input) },
    });
    return updated;
  }

  /** Mark dealt with, or reopen one marked by mistake — which must be possible
   * or the only way back is editing the database by hand. */
  async reviewRegulatory(
    id: string,
    reviewed: boolean,
    actorUserId: string,
  ): Promise<AdminRegulatoryUpdate> {
    await this.findRegulatoryOrThrow(id);
    const updated = await this.prisma.regulatoryUpdate.update({
      where: { id },
      data: {
        reviewedAt: reviewed ? new Date() : null,
        reviewedByUserId: reviewed ? actorUserId : null,
      },
      select: REGULATORY_SELECT,
    });
    await this.audit.record({
      actorUserId,
      action: reviewed ? "regulatory.review" : "regulatory.reopen",
      targetType: "RegulatoryUpdate",
      targetId: id,
      details: { title: updated.title },
    });
    return updated;
  }

  /**
   * Hard delete — deliberately, unlike a tenant. A regulatory entry is
   * reference material the platform authored, not a contractor's data: nothing
   * points at it, no document snapshots it, and an offline client has no copy
   * to reconcile. A row created in error should leave, not linger as a
   * tombstone in a compliance feed. The audit entry is the record it existed.
   */
  async deleteRegulatory(id: string, actorUserId: string): Promise<void> {
    const existing = await this.findRegulatoryOrThrow(id);
    await this.prisma.regulatoryUpdate.delete({ where: { id } });
    await this.audit.record({
      actorUserId,
      action: "regulatory.delete",
      targetType: "RegulatoryUpdate",
      targetId: id,
      details: { title: existing.title, category: existing.category },
    });
  }

  private async findRegulatoryOrThrow(id: string): Promise<AdminRegulatoryUpdate> {
    const found = await this.prisma.regulatoryUpdate.findUnique({
      where: { id },
      select: REGULATORY_SELECT,
    });
    if (!found) throw new NotFoundException("Regulatory update not found");
    return found;
  }

  pricing(): Promise<PricingSnapshot> {
    return this.pricingService.get();
  }

  async updatePricing(patch: UpdatePricingInput, actorUserId: string): Promise<PricingSnapshot> {
    const updated = await this.pricingService.update(patch);

    await this.audit.record({
      actorUserId,
      action: "pricing.update",
      targetType: "PricingConfig",
      targetId: "default",
      details: { ...patch },
    });

    return updated;
  }

  /** Manual-upgrade path: admin sets a business's plan directly. */
  async setTenantPlan(businessId: string, input: SetTenantPlanInput, actorUserId: string) {
    const business = await this.prisma.business.findUnique({ where: { id: businessId } });
    if (!business) throw new NotFoundException("Business not found");

    const interval = input.interval ?? "monthly";
    // Downgrading to free ends the commercial terms with it — leaving an
    // annual term and a negotiated price on a free tenant would resurface the
    // moment anyone put them back on pro, quietly restoring a deal that had
    // ended.
    const priceCents = input.plan === "free" ? null : (input.priceCents ?? null);

    const currentSub = await this.prisma.subscription.findUnique({ where: { businessId } });
    // A same-plan-same-interval re-save is a no-op ONLY while the current
    // term is genuinely still live (CURRENT/DUE_SOON, or a manual paid row
    // with no renewsAt at all). A PAST_DUE row saved with the same plan is
    // the admin's "reactivate" action — that must still start a fresh term
    // from today, exactly as it always has, rather than freezing renewsAt in
    // the past forever.
    const currentStanding = currentSub
      ? subscriptionStanding(
          { ...currentSub, renewsAt: currentSub.renewsAt ? currentSub.renewsAt.toISOString() : null },
          new Date(),
        )
      : SubscriptionStanding.FREE;
    const samePlanAndInterval =
      !!currentSub &&
      currentSub.plan === input.plan &&
      currentSub.interval === interval &&
      currentStanding !== SubscriptionStanding.PAST_DUE;

    // An explicit date wins; otherwise a paid plan renews one term out, which
    // is what makes "annual" mean anything. Free plans do not renew. A
    // re-save of the SAME plan+interval is a no-op (see `nextRenewal`) so it
    // never needs the payment lookup below.
    let latestPaymentCoversUntil: Date | null = null;
    if (!input.renewsAt && input.plan !== "free" && !samePlanAndInterval) {
      const latestPayment = await this.prisma.subscriptionPayment.findFirst({
        where: { businessId, voidedAt: null },
        orderBy: { coversUntil: "desc" },
      });
      latestPaymentCoversUntil = latestPayment?.coversUntil ?? null;
    }

    const renewsAt = input.renewsAt
      ? new Date(input.renewsAt)
      : input.plan === "free"
        ? null
        : nextRenewal(interval, currentSub, latestPaymentCoversUntil, samePlanAndInterval);

    const subscription = await this.prisma.subscription.upsert({
      where: { businessId },
      create: {
        businessId,
        plan: input.plan,
        status: "active",
        interval,
        priceCents,
        renewsAt,
      },
      update: {
        plan: input.plan,
        interval,
        priceCents,
        renewsAt,
      },
    });

    await this.audit.record({
      actorUserId,
      action: "tenant.setPlan",
      targetType: "Business",
      targetId: businessId,
      details: {
        plan: input.plan,
        interval,
        priceCents,
        renewsAt: renewsAt ? renewsAt.toISOString() : null,
      },
    });

    return subscription;
  }

  /**
   * GET /admin/financials — subscription & revenue overview, derived from
   * Subscription + PricingConfig + Business. Excludes soft-deleted
   * (suspended) businesses from every count below.
   */
  async financials(): Promise<AdminFinancials> {
    const monthStart = startOfJamaicaMonth();
    const [pricing, businesses, collected] = await Promise.all([
      this.pricingService.get(),
      this.prisma.business.findMany({
        where: { deletedAt: null },
        include: { subscription: true },
      }),
      // Voided rows excluded: they are history for reconciliation, not income.
      this.prisma.subscriptionPayment.aggregate({
        where: { voidedAt: null, paidAt: { gte: monthStart } },
        _sum: { amountCents: true },
      }),
    ]);

    const now = Date.now();
    const cutoff = new Date(now + SIXTY_DAYS_MS);

    let proCount = 0;
    let mrrCents = 0;
    let annualCount = 0;
    let pastDueCount = 0;
    const upcomingRenewals: AdminUpcomingRenewal[] = [];

    for (const b of businesses) {
      const isPro = b.subscription?.plan === "pro";
      if (isPro) {
        proCount += 1;
        if (b.subscription!.interval === "annual") annualCount += 1;
        // MRR is a MONTHLY figure, so an annual term contributes a twelfth of
        // its price. Counting it in full would overstate revenue by 12x in the
        // month it renews and report zero for the other eleven; counting it at
        // the monthly list price would ignore the annual discount the tenant
        // was actually given.
        mrrCents += monthlyValueCents(b.subscription!, pricing);
        // Derived from the dates, never from Subscription.status — which is
        // written once as "active" and never updated.
        if (
          subscriptionStanding({
            plan: b.subscription!.plan,
            interval: b.subscription!.interval,
            renewsAt: b.subscription!.renewsAt ? b.subscription!.renewsAt.toISOString() : null,
          }) === SubscriptionStanding.PAST_DUE
        ) {
          pastDueCount += 1;
        }
      }

      if (
        isPro &&
        b.subscription!.renewsAt &&
        b.subscription!.renewsAt.getTime() >= now &&
        b.subscription!.renewsAt.getTime() <= cutoff.getTime()
      ) {
        upcomingRenewals.push({
          businessId: b.id,
          businessName: b.name,
          plan: b.subscription!.plan,
          renewsAt: b.subscription!.renewsAt!,
        });
      }
    }

    upcomingRenewals.sort((a, b) => a.renewsAt.getTime() - b.renewsAt.getTime());

    return {
      freeCount: businesses.length - proCount,
      proCount,
      annualCount,
      currency: pricing.currency,
      proMonthlyPriceCents: pricing.proMonthlyPriceCents,
      // Summed per tenant rather than proCount x list price, so an annual term
      // or a negotiated rate is reported at what that tenant actually pays.
      mrrCents,
      collectedThisMonthCents: collected._sum.amountCents ?? 0,
      pastDueCount,
      upcomingRenewals,
    };
  }

  // --- Admin RBAC (super-admin + granular capabilities) --------------------

  private toAdminUser(u: {
    id: string;
    email: string | null;
    fullName: string | null;
    isSuperAdmin: boolean;
    adminCapabilities: string[];
    businessId: string | null;
    createdAt: Date;
  }): AdminUser {
    return {
      id: u.id,
      email: u.email,
      fullName: u.fullName,
      isSuperAdmin: u.isSuperAdmin,
      // Effective, not raw: backfills IMPERSONATE_TENANTS for anyone who
      // already held MANAGE_TENANTS before decision 5b split them. See
      // expandAdminCapabilities (@jamquote/core).
      capabilities: expandAdminCapabilities(u.adminCapabilities),
      businessId: u.businessId,
      createdAt: u.createdAt,
    };
  }

  private readonly ADMIN_SELECT = {
    id: true,
    email: true,
    fullName: true,
    isSuperAdmin: true,
    adminCapabilities: true,
    businessId: true,
    createdAt: true,
  } as const;

  /** GET /admin/me — the signed-in admin's own authorization. */
  async adminMe(userId: string): Promise<{ isSuperAdmin: boolean; capabilities: string[] }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { isSuperAdmin: true, adminCapabilities: true },
    });
    return {
      isSuperAdmin: user?.isSuperAdmin ?? false,
      capabilities: expandAdminCapabilities(user?.adminCapabilities ?? []),
    };
  }

  /** GET /admin/admins — every internal staff admin. */
  async listAdmins(): Promise<AdminUser[]> {
    const users = await this.prisma.user.findMany({
      where: { role: UserRole.ADMIN },
      select: this.ADMIN_SELECT,
      orderBy: { createdAt: "asc" },
    });
    return users.map((u) => this.toAdminUser(u));
  }

  /** How many super-admins exist — used to prevent removing the last one. */
  private countSuperAdmins(): Promise<number> {
    return this.prisma.user.count({ where: { role: UserRole.ADMIN, isSuperAdmin: true } });
  }

  /**
   * POST /admin/admins — promote an EXISTING user (matched by email) to an
   * internal admin with the given capabilities. Only a super-admin may grant
   * super-admin status. We deliberately never create a brand-new account here
   * (that needs a password) — the person must sign up first, then be promoted.
   *
   * Decision 4b: a platform admin must not also be a contractor. This
   * clears the promoted user's businessId as part of promotion — UNLESS
   * doing so would orphan a business, i.e. the user is that business's SOLE
   * OWNER (role OWNER, and no other User row shares that businessId with
   * role OWNER). Ownership here is modeled entirely on User.role/businessId
   * — there is no separate membership/ownership join table in this schema —
   * so "sole owner" is exactly "the only OWNER-role row for that
   * businessId". In that case the promotion is refused outright rather than
   * silently promoted-but-still-linked (the bug this decision fixes) or
   * promoted-with-an-orphaned-business (a worse bug): the owner must
   * transfer ownership to another user on the account first, or use a
   * separate login for admin duties.
   *
   * This is a forward-only fix. Existing admins already promoted before this
   * change may still carry a businessId — see REVIEW-FINDINGS.md, "Dual-role
   * admins (decision 4b)", for the read-only query that lists them; changing
   * their data is out of scope here (no migration access).
   */
  async promoteAdmin(input: PromoteAdminInput, actor: AdminActor): Promise<AdminUser> {
    if (input.isSuperAdmin && !actor.isSuperAdmin) {
      throw new ForbiddenException("Only a super-admin can grant super-admin status.");
    }

    const email = input.email.trim().toLowerCase();
    const user = await this.prisma.user.findFirst({
      where: { email: { equals: email, mode: "insensitive" } },
      select: { id: true, isSuperAdmin: true, businessId: true, role: true },
    });
    if (!user) {
      throw new NotFoundException("No user with that email — ask them to sign up first, then promote them.");
    }

    // The target may ALREADY be a super-admin (e.g. re-promoting an existing
    // admin to change their capabilities) even when input.isSuperAdmin is
    // false/undefined — the check above only looks at the incoming flag.
    // Mirrors updateAdmin/revokeAdmin's "only a super-admin may modify a
    // super-admin" rule so this route can't be used to reach that row by
    // going through the promote path instead of update.
    if (user.isSuperAdmin && !actor.isSuperAdmin) {
      throw new ForbiddenException("Only a super-admin can modify a super-admin.");
    }

    let clearBusinessId = false;
    if (user.businessId) {
      if (user.role === UserRole.OWNER) {
        const ownerCount = await this.prisma.user.count({
          where: { businessId: user.businessId, role: UserRole.OWNER },
        });
        if (ownerCount <= 1) {
          throw new BadRequestException(
            "This user is the sole owner of a business — promoting them to admin would leave that business without an owner. " +
              "Transfer ownership to another user on the account first, or have them use a separate login for admin duties.",
          );
        }
      }
      // STAFF (or a role other than OWNER) never orphans a business by
      // losing its businessId, so promotion clears the link unconditionally
      // in that case.
      clearBusinessId = true;
    }

    const updated = await this.prisma.user.update({
      where: { id: user.id },
      data: {
        role: UserRole.ADMIN,
        adminCapabilities: input.capabilities,
        isSuperAdmin: input.isSuperAdmin ?? user.isSuperAdmin,
        ...(clearBusinessId ? { businessId: null } : {}),
      },
      select: this.ADMIN_SELECT,
    });

    await this.audit.record({
      actorUserId: actor.userId,
      action: "admin.promote",
      targetType: "User",
      targetId: user.id,
      details: { email, capabilities: input.capabilities, isSuperAdmin: updated.isSuperAdmin },
    });

    return this.toAdminUser(updated);
  }

  /**
   * PATCH /admin/admins/:id — update an admin's capabilities and/or
   * super-admin status. Guards: only a super-admin may change super-admin
   * status or edit a super-admin; the last super-admin can't be demoted; an
   * actor can't strip their own super-admin or MANAGE_ADMINS access.
   */
  async updateAdmin(id: string, input: UpdateAdminInput, actor: AdminActor): Promise<AdminUser> {
    const target = await this.prisma.user.findUnique({
      where: { id },
      select: { id: true, role: true, isSuperAdmin: true, adminCapabilities: true },
    });
    if (!target || target.role !== UserRole.ADMIN) {
      throw new NotFoundException("Admin not found");
    }

    const touchesSuperAdmin = input.isSuperAdmin !== undefined;
    if ((touchesSuperAdmin || target.isSuperAdmin) && !actor.isSuperAdmin) {
      throw new ForbiddenException("Only a super-admin can modify a super-admin.");
    }

    // Demoting the last super-admin would lock everyone out of admin management.
    if (touchesSuperAdmin && input.isSuperAdmin === false && target.isSuperAdmin) {
      if ((await this.countSuperAdmins()) <= 1) {
        throw new BadRequestException("Cannot remove the last super-admin.");
      }
      if (target.id === actor.userId) {
        throw new BadRequestException("You can't remove your own super-admin status.");
      }
    }

    // Prevent an actor from removing their own path back into admin management.
    if (
      target.id === actor.userId &&
      !actor.isSuperAdmin &&
      input.capabilities !== undefined &&
      !input.capabilities.includes("MANAGE_ADMINS")
    ) {
      throw new BadRequestException("You can't remove your own 'Manage admins' capability.");
    }

    const updated = await this.prisma.user.update({
      where: { id },
      data: {
        ...(input.capabilities !== undefined ? { adminCapabilities: input.capabilities } : {}),
        ...(touchesSuperAdmin ? { isSuperAdmin: input.isSuperAdmin } : {}),
      },
      select: this.ADMIN_SELECT,
    });

    await this.audit.record({
      actorUserId: actor.userId,
      action: "admin.update",
      targetType: "User",
      targetId: id,
      details: {
        capabilities: input.capabilities ?? null,
        isSuperAdmin: touchesSuperAdmin ? input.isSuperAdmin : null,
      },
    });

    return this.toAdminUser(updated);
  }

  /**
   * DELETE /admin/admins/:id — revoke a user's admin access (back to OWNER,
   * capabilities cleared). Guards: can't revoke yourself; can't revoke the
   * last super-admin; only a super-admin may revoke a super-admin.
   */
  async revokeAdmin(id: string, actor: AdminActor): Promise<{ revoked: true; userId: string }> {
    const target = await this.prisma.user.findUnique({
      where: { id },
      select: { id: true, role: true, isSuperAdmin: true },
    });
    if (!target || target.role !== UserRole.ADMIN) {
      throw new NotFoundException("Admin not found");
    }
    if (target.id === actor.userId) {
      throw new BadRequestException("You can't revoke your own admin access.");
    }
    if (target.isSuperAdmin && !actor.isSuperAdmin) {
      throw new ForbiddenException("Only a super-admin can revoke a super-admin.");
    }
    if (target.isSuperAdmin && (await this.countSuperAdmins()) <= 1) {
      throw new BadRequestException("Cannot revoke the last super-admin.");
    }

    await this.prisma.user.update({
      where: { id },
      data: { role: UserRole.OWNER, isSuperAdmin: false, adminCapabilities: [] },
    });

    await this.audit.record({
      actorUserId: actor.userId,
      action: "admin.revoke",
      targetType: "User",
      targetId: id,
      details: {},
    });

    return { revoked: true, userId: id };
  }
}
