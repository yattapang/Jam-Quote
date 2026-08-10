import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import type { Supplier } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service.js";
import type { CreateSupplierInput, UpdateSupplierInput } from "./catalogs.dto.js";

/**
 * Suppliers a contractor keeps for themselves — the merchants they actually
 * buy from, including the corner hardware shop no curated directory will ever
 * carry.
 *
 * Every row is owned by exactly one business. Rows with businessId NULL are
 * legacy platform data from before suppliers were tenant-scoped; they are
 * deliberately invisible here, because a NULL owner is nobody's row, not
 * everybody's. That is the opposite of MaterialCategoryDef/MaterialUnit, where
 * NULL means curated-and-shared — do not copy that visibility filter into
 * this service.
 *
 * Ids are not capabilities: every id a client supplies is re-checked against
 * the caller's businessId before it is read or written.
 */
@Injectable()
export class SuppliersService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Idempotent create, matching TradesService.create: if this business already
   * has a supplier with the same name (case-insensitively), that row is
   * returned instead of a duplicate being made. A contractor typing "Rapid
   * True Value" twice means the same merchant both times, and two of them in
   * the price-comparison picker is worse than not creating the second.
   */
  async create(businessId: string, input: CreateSupplierInput): Promise<Supplier> {
    const name = input.name.trim();
    const existing = await this.prisma.supplier.findFirst({
      where: { businessId, deletedAt: null, name: { equals: name, mode: "insensitive" } },
    });
    if (existing) return existing;
    return this.prisma.supplier.create({ data: { ...input, name, businessId } });
  }

  /**
   * Retired suppliers are excluded here, not just in the comparison view. A
   * soft-deleted supplier is one the contractor stopped using; offering it in
   * the picker would quietly resurrect it.
   *
   * MaterialPricesService.findForMaterial filters `supplier: { deletedAt:
   * null }` itself. That is now belt-and-braces rather than compensation —
   * it reads MaterialPriceEntry directly, not through this service, so it
   * still needs its own filter. Left in place.
   */
  findAll(businessId: string): Promise<Supplier[]> {
    return this.prisma.supplier.findMany({
      where: { businessId, deletedAt: null },
      orderBy: { name: "asc" },
    });
  }

  findOne(businessId: string, id: string): Promise<Supplier> {
    return this.assertOwned(businessId, id);
  }

  async update(businessId: string, id: string, input: UpdateSupplierInput): Promise<Supplier> {
    await this.assertOwned(businessId, id);
    return this.prisma.supplier.update({ where: { id }, data: input });
  }

  /**
   * Soft delete, matching every other catalog resource (and the admin
   * console's old supplier removal): MaterialPriceEntry.supplierId is
   * ON DELETE RESTRICT and QuoteLineItem.supplierId ON DELETE SET NULL, so a
   * hard delete would either fail outright the moment this supplier had ever
   * been priced against, or silently strip the supplier off historical quote
   * lines — rewriting documents the contractor has already sent to customers.
   * The tombstone is also what a delta-syncing offline client needs to see.
   */
  async remove(businessId: string, id: string): Promise<void> {
    await this.assertOwned(businessId, id);
    await this.prisma.supplier.update({ where: { id }, data: { deletedAt: new Date() } });
  }

  /**
   * Resolves an id to a row this caller actually owns.
   *
   * The two failure modes are deliberately different: a legacy platform row
   * (businessId NULL) exists but belongs to no tenant, so 403 says "not
   * yours" without pretending it isn't there; another tenant's row is a 404,
   * because confirming its existence would leak that they have it.
   */
  private async assertOwned(businessId: string, id: string): Promise<Supplier> {
    const supplier = await this.prisma.supplier.findFirst({ where: { id, deletedAt: null } });
    if (!supplier) throw new NotFoundException("Supplier not found");
    if (supplier.businessId === null) {
      throw new ForbiddenException("This supplier is managed by JamQuote");
    }
    if (supplier.businessId !== businessId) throw new NotFoundException("Supplier not found");
    return supplier;
  }
}
