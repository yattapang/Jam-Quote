import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service.js";

/**
 * The tenant-visible slice of a RegulatoryUpdate.
 *
 * Deliberately narrower than AdminRegulatoryUpdate (../admin/admin.service.ts):
 * `actionNeeded` is a STAFF operations note — the seeded rows say things like
 * "Update seeded LabourRate defaults for new tenants" — so it must never reach
 * a contractor's dashboard. Selecting fields explicitly (rather than returning
 * the row) is what keeps that true if columns are added later.
 */
export interface TenantRegulatoryUpdate {
  id: string;
  title: string;
  category: string;
  summary: string;
  effectiveDate: Date | null;
  sourceUrl: string | null;
}

/** Most recent guidance first; bounded so a growing feed can't turn the
 * dashboard read into an unbounded query. */
const FEED_LIMIT = 20;

@Injectable()
export class RegulatoryService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * GET /regulatory — the published regulatory feed.
   *
   * RegulatoryUpdate carries NO businessId: it is platform-wide guidance
   * (TAJ/NHT/HEART notices), identical for every tenant, not tenant-owned
   * records. So there is deliberately no per-business filter to apply here and
   * no businessId parameter to take — inventing one would imply a scoping that
   * the data model does not have. Access control is the TenantAuthGuard on the
   * controller (signed-in tenants only) plus the field allow-list above.
   */
  list(): Promise<TenantRegulatoryUpdate[]> {
    return this.prisma.regulatoryUpdate.findMany({
      orderBy: { publishedAt: "desc" },
      take: FEED_LIMIT,
      select: {
        id: true,
        title: true,
        category: true,
        summary: true,
        effectiveDate: true,
        sourceUrl: true,
      },
    });
  }
}
