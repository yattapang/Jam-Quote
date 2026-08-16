import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service.js";

/**
 * Which catalog a hidden row belongs to. Kept as string constants rather than
 * a Postgres enum so adding a hideable catalog is a code change, not a
 * migration — the column is deliberately plain TEXT.
 */
export const CatalogKind = {
  MATERIAL_CATEGORY: "MATERIAL_CATEGORY",
  MATERIAL_UNIT: "MATERIAL_UNIT",
  TRADE: "TRADE",
  // NO SUPPLIER. Suppliers are wholly tenant-owned — there are no curated
  // rows a contractor is stuck with — and they already support delete. A
  // hideable kind that nothing filters would be accepted by the API and do
  // nothing, which is precisely the silent no-op assertKind exists to refuse.
} as const;
export type CatalogKind = (typeof CatalogKind)[keyof typeof CatalogKind];

export const CATALOG_KINDS: CatalogKind[] = Object.values(CatalogKind);

/**
 * A tenant's decision to stop being offered catalog entries they never use.
 *
 * Hiding is not deleting, and the distinction is the feature. The rows stay
 * exactly where they are — still referenced by existing materials, still
 * printed on documents already sent — they simply stop appearing in pickers
 * for this one business. That is what "shorten my dropdown" actually means,
 * and it is the only version that is safe: the underlying foreign keys are
 * ON DELETE RESTRICT in production, so deleting an in-use entry fails anyway.
 *
 * Every method takes businessId first and every query filters on it. That is
 * not boilerplate here: curated rows are shared platform-wide, so an unscoped
 * write would hide a category for every contractor using JamQuote.
 */
@Injectable()
export class CatalogHiddenService {
  constructor(private readonly prisma: PrismaService) {}

  /** Hidden row ids for one catalog, as a Set for cheap filtering by callers. */
  async hiddenIds(businessId: string, kind: CatalogKind): Promise<Set<string>> {
    const rows = await this.prisma.catalogHidden.findMany({
      where: { businessId, kind },
      select: { rowId: true },
    });
    return new Set(rows.map((r) => r.rowId));
  }

  /** Everything this business has hidden, grouped by catalog — for the
   * settings screen, which has to show what is hidden in order to restore it. */
  async findAll(businessId: string): Promise<{ kind: string; rowId: string }[]> {
    return this.prisma.catalogHidden.findMany({
      where: { businessId },
      select: { kind: true, rowId: true },
      orderBy: { createdAt: "asc" },
    });
  }

  /**
   * Idempotent by design: hiding something already hidden is a no-op rather
   * than a 409. The caller is a checkbox, and a double-click should not be an
   * error the contractor has to understand.
   */
  async hide(businessId: string, kind: CatalogKind, rowId: string): Promise<void> {
    await this.prisma.catalogHidden.upsert({
      where: { businessId_kind_rowId: { businessId, kind, rowId } },
      create: { businessId, kind, rowId },
      update: {},
    });
  }

  /** Also idempotent — unhiding something not hidden simply does nothing. */
  async unhide(businessId: string, kind: CatalogKind, rowId: string): Promise<void> {
    await this.prisma.catalogHidden.deleteMany({ where: { businessId, kind, rowId } });
  }
}
