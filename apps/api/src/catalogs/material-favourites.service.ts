import { Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { MaterialFavourite } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service.js";
import type {
  CreateMaterialFavouriteInput,
  MaterialFavouriteQuery,
  UpdateMaterialFavouriteInput,
} from "./catalogs.dto.js";

@Injectable()
export class MaterialFavouritesService {
  constructor(private readonly prisma: PrismaService) {}

  create(
    businessId: string,
    input: CreateMaterialFavouriteInput,
  ): Promise<MaterialFavourite> {
    return this.prisma.materialFavourite.create({ data: { ...input, businessId } });
  }

  /**
   * GET /catalogs/material-favourites?q=&category=&limit=
   *
   * `q` search-across-JSON approach: Prisma's query API has no portable way
   * to do a case-insensitive `contains` over the *values* of an arbitrary
   * JSON column (its JSON filters only support exact-value / path
   * equality, not substring/insensitive matching). So when `q` is given we
   * first resolve the matching ids with a raw, hand-written query — using
   * Postgres's `jsonb_each_text` to unnest `specs` into key/value rows and
   * ILIKE each value — and then re-fetch the full rows through the normal
   * typed Prisma `findMany` below (which also applies `category`, ordering,
   * and `limit`). That second round trip is deliberate: it keeps
   * Decimal/Json field deserialization on Prisma's normal, well-tested
   * path instead of hand-reconstructing a MaterialFavourite from a raw
   * result set. This is the "raw SQL for correctness at scale" option
   * rather than fetch-all-then-filter-in-JS, because the latter would
   * require pulling every one of a tenant's (potentially thousands of)
   * rows into memory on every search keystroke.
   *
   * SQL injection: `businessId` and the ILIKE pattern are passed as bound
   * parameters via Prisma.sql tagged-template interpolation, never
   * string-concatenated into the query text — Prisma sends them to
   * Postgres as separate parameters ($1, $2, ...), so `q` containing SQL
   * metacharacters (quotes, `--`, `;`, etc.) is matched only as a literal
   * substring and can never alter the query. See the
   * "treats SQL metacharacters as a literal" test in
   * material-favourites.service.test.ts.
   */
  async findAll(
    businessId: string,
    filters: MaterialFavouriteQuery = {},
  ): Promise<MaterialFavourite[]> {
    const { q, category, limit } = filters;

    let idFilter: { id: { in: string[] } } | undefined;
    if (q) {
      const pattern = `%${q}%`;
      const rows = await this.prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
        SELECT "id" FROM "MaterialFavourite"
        WHERE "businessId" = ${businessId}
          AND "deletedAt" IS NULL
          AND (
            "name" ILIKE ${pattern}
            OR "description" ILIKE ${pattern}
            OR EXISTS (
              SELECT 1 FROM jsonb_each_text(COALESCE("specs", '{}'::jsonb)) AS spec(key, value)
              WHERE spec.value ILIKE ${pattern}
            )
          )
      `);
      idFilter = { id: { in: rows.map((r) => r.id) } };
    }

    return this.prisma.materialFavourite.findMany({
      where: {
        businessId,
        deletedAt: null,
        ...(category ? { category } : {}),
        ...(idFilter ?? {}),
      },
      orderBy: { name: "asc" },
      ...(limit !== undefined ? { take: limit } : {}),
    });
  }

  async findOne(businessId: string, id: string): Promise<MaterialFavourite> {
    const fav = await this.prisma.materialFavourite.findFirst({
      where: { id, businessId, deletedAt: null },
    });
    if (!fav) throw new NotFoundException("Material favourite not found");
    return fav;
  }

  async update(
    businessId: string,
    id: string,
    input: UpdateMaterialFavouriteInput,
  ): Promise<MaterialFavourite> {
    await this.findOne(businessId, id);
    return this.prisma.materialFavourite.update({ where: { id }, data: input });
  }

  /**
   * Soft-delete: sets deletedAt rather than removing the row, so offline
   * clients doing a delta-sync can observe the tombstone (matches
   * LabourRatesService.remove / AssembliesService.remove).
   *
   * AssemblyComponent.materialFavouriteId has `onDelete: SetNull`, but that
   * only fires on a real DB-level DELETE — since this is now an UPDATE, any
   * assembly component still referencing this material keeps its
   * materialFavouriteId pointing at the (soft-deleted) row. That's safe:
   * AssemblyComponent stores its own unitPriceCents/description snapshot at
   * add-time and never re-reads the live MaterialFavourite for costing (see
   * the comment on AssemblyComponent in schema.prisma), so no existing
   * assembly's cost changes. The soft-deleted material just stops showing
   * up here (findAll/findOne both filter deletedAt: null) and in the
   * material picker.
   */
  async remove(businessId: string, id: string): Promise<void> {
    await this.findOne(businessId, id);
    await this.prisma.materialFavourite.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }
}
