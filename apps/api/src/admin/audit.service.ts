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

  /** GET /admin/audit — newest first. */
  recent(limit = 100): Promise<AuditLog[]> {
    return this.prisma.auditLog.findMany({
      orderBy: { createdAt: "desc" },
      take: limit,
    });
  }
}
