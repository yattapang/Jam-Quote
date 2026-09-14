import { Injectable } from "@nestjs/common";
import type { AuditLog, Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service.js";

export interface RecordAuditInput {
  actorUserId: string;
  action: string;
  targetType: string;
  targetId: string;
  details?: Record<string, unknown> | null;
}

/**
 * Redact-by-default allow-list.
 *
 * A hand-kept DENY-list (the old `FINANCIAL_AUDIT_ACTIONS`) leaks by omission:
 * every action nobody thought to add — `pricing.update` (admin.service.ts),
 * which carries `proMonthlyPriceCents`/`proAnnualPriceCents`, was never in
 * that set and its `details` leaked in full to any admin without
 * VIEW_FINANCIALS/MANAGE_TENANTS. A regex/text scan meant to catch that class
 * of miss is also defeated trivially — spreading a variable instead of a
 * literal, or a money field not spelled with a `Cents` suffix, both produce
 * no match — and it skipped admin.controller.ts entirely.
 *
 * So the direction is inverted: `details` is redacted for every action
 * EXCEPT the ones named here. Registering an action is an explicit claim
 * that its `details`, as actually written, carries no money — checked for
 * every name below by audit-writer-details.test.ts, which calls each
 * writer with mocked Prisma and asserts the real payload passed to
 * `audit.record` contains no money-shaped value, so a writer that adds a
 * `Cents` field later fails that test rather than leaking silently. A brand
 * new action is redacted the moment it exists, whether or not anyone
 * registers it — the unsafe case is now the default, not the miss.
 *
 * Deliberately excluded (and so still redacted): `tenant.setPlan`,
 * `pricing.update` (admin.service.ts — `priceCents`), and
 * `subscription.payment.record`/`subscription.payment.void`
 * (subscription-payments.service.ts — `amountCents`).
 *
 * This list is every OTHER `audit.record`/`this.audit.record` call site in
 * apps/api/src as of this writing: admin.service.ts (tenant.impersonate,
 * tenant.suspend, tenant.restore, tenant.delete, regulatory.create,
 * regulatory.update, regulatory.review, regulatory.reopen, regulatory.delete,
 * admin.promote, admin.update, admin.revoke), admin.controller.ts
 * (subscription.sweep.manual, subscription.sweep.manual.failed), and
 * rulepack.service.ts (rulepack.update — percentage rates, not a paid/owed
 * money amount).
 */
export const NON_FINANCIAL_AUDIT_ACTIONS: ReadonlySet<string> = new Set([
  "tenant.impersonate",
  "tenant.suspend",
  "tenant.restore",
  "tenant.delete",
  "regulatory.create",
  "regulatory.update",
  "regulatory.review",
  "regulatory.reopen",
  "regulatory.delete",
  "admin.promote",
  "admin.update",
  "admin.revoke",
  "subscription.sweep.manual",
  "subscription.sweep.manual.failed",
  "rulepack.update",
]);

const REDACTED_DETAILS = {
  redacted: "financial details — requires VIEW_FINANCIALS or MANAGE_TENANTS",
};

/**
 * Records an immutable audit trail entry for every destructive/financial
 * admin action (tenant suspend/restore/delete, plan changes, pricing edits,
 * supplier writes). Callers only ever need to know who is making the
 * request (req.user.sub, i.e. actorUserId) — actorEmail is resolved here so
 * every call site stays uniform and can't drift out of sync with the DB.
 */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async record(input: RecordAuditInput): Promise<void> {
    const actor = await this.prisma.user.findUnique({
      where: { id: input.actorUserId },
      select: { email: true },
    });

    await this.prisma.auditLog.create({
      data: {
        actorUserId: input.actorUserId,
        actorEmail: actor?.email ?? "unknown",
        action: input.action,
        targetType: input.targetType,
        targetId: input.targetId,
        details: (input.details ?? undefined) as Prisma.InputJsonValue | undefined,
      },
    });
  }

  /**
   * GET /admin/audit — newest first.
   *
   * `includeFinancials` mirrors `AdminService.tenants`'s `canSeePrice`: the
   * route itself takes any admin (the general activity log — tenant
   * suspends, rulepack edits, admin promotions — is not financial data and
   * every capability legitimately needs it), but a caller without
   * VIEW_FINANCIALS/MANAGE_TENANTS must not be able to read the negotiated
   * price or amount paid back out of this feed, which is the twin of the
   * `/admin/tenants` leak. See NON_FINANCIAL_AUDIT_ACTIONS.
   */
  async recent(includeFinancials: boolean, limit = 100): Promise<AuditLog[]> {
    const rows = await this.prisma.auditLog.findMany({
      orderBy: { createdAt: "desc" },
      take: limit,
    });
    if (includeFinancials) return rows;
    return rows.map((row) =>
      NON_FINANCIAL_AUDIT_ACTIONS.has(row.action)
        ? row
        : { ...row, details: REDACTED_DETAILS as unknown as AuditLog["details"] },
    );
  }
}
