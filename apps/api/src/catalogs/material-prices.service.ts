import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service.js";
import type { CreateMaterialPriceEntryInput } from "./catalogs.dto.js";

/** One supplier's latest observed price for a material, for the comparison view. */
export interface SupplierPriceView {
  id: string;
  supplierId: string;
  supplierName: string;
  /** Supplier.parish — the "location" line in the mobile comparison UI. */
  location: string | null;
  priceCents: number;
  note: string | null;
  /** ISO timestamp. Deliberately NOT a pre-rendered "2 hours ago" string:
   * formatting is the client's job (web and mobile render it differently), and
   * a server-rendered relative time is wrong the moment it is cached. */
  fetchedAt: string;
  /** false = platform-curated reference price; true = this contractor's own
   * recorded price. The UI must distinguish them — "what I actually paid"
   * carries more weight than a catalogue lookup. */
  own: boolean;
}

@Injectable()
export class MaterialPricesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Price comparison for one of this business's materials.
   *
   * Combines two sources:
   *  - This tenant's OWN entries, linked by materialFavouriteId (exact).
   *  - Platform-curated lookup rows (businessId NULL), which are catalogue-wide
   *    and carry no materialFavouriteId, so they can only be matched by NAME.
   *    That match is best-effort by nature — it is reference data, and it is
   *    labelled `own: false` so the contractor can see which is which.
   *
   * Returns the most recent entry per supplier: the comparison answers "what
   * does each supplier charge", not "every price ever seen". The full history
   * is still in the table, ordered by fetchedAt.
   */
  async findForMaterial(businessId: string, materialFavouriteId: string): Promise<SupplierPriceView[]> {
    // Ownership check first — an id is not a capability. Without this, passing
    // another tenant's material id would return their private price history.
    const material = await this.prisma.materialFavourite.findFirst({
      where: { id: materialFavouriteId, businessId, deletedAt: null },
    });
    if (!material) throw new NotFoundException("Material not found");

    const entries = await this.prisma.materialPriceEntry.findMany({
      where: {
        OR: [
          { businessId, materialFavouriteId },
          // Curated reference rows, matched on name.
          { businessId: null, name: { equals: material.name, mode: "insensitive" } },
        ],
        // A soft-deleted supplier is one an admin has retired; showing its
        // price as a live option would send a contractor to a dead merchant.
        // SuppliersService.findAll does NOT filter this, so it must be done here.
        supplier: { deletedAt: null },
      },
      include: { supplier: true },
      orderBy: { fetchedAt: "desc" },
    });

    // Most recent per supplier. `entries` is already newest-first, so the first
    // row seen for a supplier is the one to keep.
    const latestBySupplier = new Map<string, SupplierPriceView>();
    for (const e of entries) {
      if (latestBySupplier.has(e.supplierId)) continue;
      latestBySupplier.set(e.supplierId, {
        id: e.id,
        supplierId: e.supplierId,
        supplierName: e.supplier.name,
        location: e.supplier.parish,
        priceCents: e.priceCents,
        note: e.note,
        fetchedAt: e.fetchedAt.toISOString(),
        own: e.businessId !== null,
      });
    }

    return [...latestBySupplier.values()].sort((a, b) => a.priceCents - b.priceCents);
  }

  /**
   * Records a price this contractor observed. Always an insert — see the
   * MaterialPriceEntry comment in schema.prisma.
   *
   * `name` is denormalized from the material at write time rather than joined,
   * matching how the curated rows are shaped and keeping the row meaningful if
   * the material is later renamed.
   */
  async create(businessId: string, input: CreateMaterialPriceEntryInput) {
    const material = await this.prisma.materialFavourite.findFirst({
      where: { id: input.materialFavouriteId, businessId, deletedAt: null },
    });
    if (!material) throw new NotFoundException("Material not found");

    // The supplier must be this tenant's own and not retired. Suppliers are
    // tenant-private now, so an unscoped lookup here would let a caller name
    // another tenant's supplier by id and then read its name and parish back
    // out of the comparison view — ids are not capabilities.
    const supplier = await this.prisma.supplier.findFirst({
      where: { id: input.supplierId, businessId, deletedAt: null },
    });
    if (!supplier) throw new NotFoundException("Supplier not found");

    return this.prisma.materialPriceEntry.create({
      data: {
        businessId,
        materialFavouriteId: material.id,
        supplierId: supplier.id,
        name: material.name,
        unit: material.unit,
        priceCents: input.priceCents,
        note: input.note,
        fetchedAt: input.fetchedAt ?? new Date(),
        // MANUAL, not LOOKUP: a contractor typed this in. LOOKUP is reserved
        // for platform-scraped reference prices, and conflating them would
        // make the curated/own distinction unrecoverable from the data.
        source: "MANUAL",
      },
    });
  }

  /**
   * Hard delete, unlike the rest of the catalog. A price entry is a
   * point-in-time observation, not an entity clients cache — MaterialPriceEntry
   * is excluded from delta-sync (docs/SYNC.md), so there is no tombstone for an
   * offline client to observe.
   */
  async remove(businessId: string, id: string): Promise<void> {
    const entry = await this.prisma.materialPriceEntry.findUnique({ where: { id } });
    if (!entry) throw new NotFoundException("Price entry not found");
    // Curated rows (businessId null) belong to the platform, not to whoever
    // asks. Only an admin may remove those.
    if (entry.businessId !== businessId) {
      throw new ForbiddenException("Cannot delete a price entry you did not record");
    }
    await this.prisma.materialPriceEntry.delete({ where: { id } });
  }
}
