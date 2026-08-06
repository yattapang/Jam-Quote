import { Injectable, NotFoundException } from "@nestjs/common";
import type { MaterialFavourite } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service.js";
import { MaterialSchemaService } from "./material-schema.service.js";
import type {
  CreateMaterialFavouriteInput,
  MaterialFavouriteQuery,
  UpdateMaterialFavouriteInput,
} from "./catalogs.dto.js";

@Injectable()
export class MaterialFavouritesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly schema: MaterialSchemaService,
  ) {}

  /**
   * The name/specs/searchText triple is never taken from the client as-is:
   * MaterialSchemaService validates the specs against the category's
   * attributes, records any new vocabulary value, and COMPOSES the display
   * name. That is what keeps names consistent enough for search and de-duping
   * to work at all — see #26.
   */
  async create(
    businessId: string,
    input: CreateMaterialFavouriteInput,
  ): Promise<MaterialFavourite> {
    if (input.unitId) await this.schema.assertUnitVisible(businessId, input.unitId);
    const normalized = await this.schema.normalizeForWrite(businessId, input);
    return this.prisma.materialFavourite.create({
      data: {
        ...input,
        businessId,
        name: normalized.name,
        specs: normalized.specs ?? undefined,
        searchText: normalized.searchText,
      },
    });
  }

  /**
   * GET /catalogs/material-favourites?q=&category=&categoryDefId=&limit=
   *
   * `q` matches the denormalized `searchText` column (name + description +
   * spec values, lowercased), which MaterialSchemaService maintains on every
   * write and the 2a migration backfilled onto every existing row.
   *
   * This replaced a raw `jsonb_each_text` + ILIKE query that unnested `specs`
   * on every keystroke. The raw query was correct, but once `searchText`
   * exists the two are independent implementations of "what does this
   * material match?" and WILL drift — searchText is now the single source.
   * name/description stay in the OR as a belt-and-braces fallback for any row
   * whose searchText was somehow never populated, so a search can degrade but
   * never silently return nothing.
   *
   * `q` is passed through Prisma's `contains`, which parameterizes it — a
   * value containing SQL metacharacters is matched as a literal substring.
   */
  async findAll(
    businessId: string,
    filters: MaterialFavouriteQuery = {},
  ): Promise<MaterialFavourite[]> {
    const { q, category, categoryDefId, limit } = filters;
    const insensitive = { mode: "insensitive" } as const;

    return this.prisma.materialFavourite.findMany({
      where: {
        businessId,
        deletedAt: null,
        ...(category ? { category } : {}),
        ...(categoryDefId ? { categoryDefId } : {}),
        ...(q
          ? {
              OR: [
                { searchText: { contains: q.toLowerCase() } },
                { name: { contains: q, ...insensitive } },
                { description: { contains: q, ...insensitive } },
              ],
            }
          : {}),
      },
      orderBy: { name: "asc" },
      // The unit is a FK as of 2a; including it means every consumer can
      // render "(bag)" without separately fetching the schema and joining by
      // hand. Same reason findOne includes it.
      include: { unitRef: true },
      ...(limit !== undefined ? { take: limit } : {}),
    });
  }

  async findOne(businessId: string, id: string): Promise<MaterialFavourite> {
    const fav = await this.prisma.materialFavourite.findFirst({
      where: { id, businessId, deletedAt: null },
      include: { unitRef: true },
    });
    if (!fav) throw new NotFoundException("Material favourite not found");
    return fav;
  }

  /**
   * PATCH semantics: normalization runs against the MERGED state (existing row
   * + supplied fields), not the patch alone. Changing only the price must not
   * recompose the name from an empty spec set, and changing one spec must
   * revalidate against the whole material.
   */
  async update(
    businessId: string,
    id: string,
    input: UpdateMaterialFavouriteInput,
  ): Promise<MaterialFavourite> {
    const existing = await this.findOne(businessId, id);
    if (input.unitId) await this.schema.assertUnitVisible(businessId, input.unitId);

    const normalized = await this.schema.normalizeForWrite(businessId, input, {
      categoryDefId: existing.categoryDefId,
      specs: (existing.specs as Record<string, string> | null) ?? null,
      name: existing.name,
      nameCustom: existing.nameCustom,
      description: existing.description,
    });

    return this.prisma.materialFavourite.update({
      where: { id },
      data: {
        ...input,
        name: normalized.name,
        specs: normalized.specs ?? undefined,
        searchText: normalized.searchText,
      },
    });
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
