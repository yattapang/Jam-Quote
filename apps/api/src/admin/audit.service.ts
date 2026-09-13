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
 * Actions whose `details` payload carries a negotiated/paid money figure —
 * the same class of data `AdminController.tenants` strips from its own
 * response for a caller without VIEW_FINANCIALS/MANAGE_TENANTS (see
 * `AdminService.tenants`'s `canSeePrice`).
 *
 * `tenant.setPlan` (admin.service.ts) carries `priceCents`/`interval`/
 * `renewsAt`; `subscription.payment.record` and `subscription.payment.void`
 * (subscription-payments.service.ts) carry `amountCents`/`method`/
 * `coversUntil`. None of the three writers can be restructured to nest
 * their money fields under a `financial` sub-object without touching
 * admin.service.ts, so redaction here keys off the action name instead —
 * one exported list, spent by the guard test below (which scans both
 * writers for any `audit.record` call whose `details` mentions a
 * money-shaped key and asserts its action is registered here), so a new
 * financial action that forgets to register itself fails that test rather
 * than leaking silently.
 *
 * What this does NOT prove: an action recorded here with a details shape
 * that later adds a NON-money field would still redact that field too
 * (redaction hides the whole `details` for these three actions, not just
 * the money keys within it) — deliberately, since there is no structural
 * split to redact partially. Widening membership is safe; narrowing it
 * without checking every historical call site is not.
 */
export const FINANCIAL_AUDIT_ACTIONS: ReadonlySet<string> = new Set([
  "tenant.setPlan",
  "subscription.payment.record",
  "subscription.payment.void",
]);

const REDACTED_DETAILS = { redacted: "financial details — requires VIEW_FINANCIALS" };

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
   * `/admin/tenants` leak. See FINANCIAL_AUDIT_ACTIONS.
   */
  async recent(includeFinancials: boolean, limit = 100): Promise<AuditLog[]> {
    const rows = await this.prisma.auditLog.findMany({
      orderBy: { createdAt: "desc" },
      take: limit,
    });
    if (includeFinancials) return rows;
    return rows.map((row) =>
      FINANCIAL_AUDIT_ACTIONS.has(row.action)
        ? { ...row, details: REDACTED_DETAILS as unknown as AuditLog["details"] }
        : row,
    );
  }
}
