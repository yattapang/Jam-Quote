import { NotFoundException } from "@nestjs/common";
import type { PrismaService } from "../prisma/prisma.service.js";

/** A shape narrow enough to accept the real client or a fake in a test. */
type SupplierLookup = Pick<PrismaService, "supplier">;

/**
 * Batched form of `assertSupplierOwned` (see `assert-owned.ts`), for a
 * line-item array rather than one field — one `findMany` over the
 * de-duplicated ids instead of one query per line.
 *
 * `allowIds` carries `supplierId`s already persisted on the SAME document
 * being updated (e.g. every id currently on the quote/invoice before the
 * replace). An id in that set passes even if the supplier has since been
 * soft-deleted, so an old document that already pointed at it stays
 * editable — only a NEWLY introduced id must name a live supplier of this
 * business. Leave `allowIds` empty on create, where nothing is persisted yet.
 *
 * Throws the same `NotFoundException` a single-field check would, so a
 * foreign id and a made-up id are indistinguishable to the caller.
 */
export async function assertSuppliersOwned(
  prisma: SupplierLookup,
  businessId: string,
  supplierIds: ReadonlyArray<string | null | undefined>,
  allowIds: ReadonlySet<string> = new Set(),
): Promise<void> {
  const distinct = [...new Set(supplierIds.filter((v): v is string => Boolean(v)))];
  const newIds = distinct.filter((v) => !allowIds.has(v));
  const grandfatheredIds = distinct.filter((v) => allowIds.has(v));

  if (newIds.length > 0) {
    const rows = await prisma.supplier.findMany({
      where: { id: { in: newIds }, businessId, deletedAt: null },
      select: { id: true },
    });
    if (rows.length !== newIds.length) {
      throw new NotFoundException("Supplier not found");
    }
  }

  if (grandfatheredIds.length > 0) {
    // Mirrors assertRefKindOwned's treatment of grandfathered ids (see
    // assert-owned.ts): no `deletedAt` filter, so an id already on the
    // document stays allowed even if the supplier has since been
    // soft-deleted. But it is STILL checked against `businessId` — a
    // pre-S7 id, written before tenant checks existed, that belongs to a
    // DIFFERENT business is not silently grandfathered forever. Found
    // belonging to another tenant (or not existing at all), the update is
    // refused rather than silently dropping the id to null: this data is a
    // financial reference on a real quote/invoice, and changing what it
    // points at (or discarding it) without the contractor's knowledge is a
    // worse outcome than making them fix the document once.
    const rows = await prisma.supplier.findMany({
      where: { id: { in: grandfatheredIds }, businessId },
      select: { id: true },
    });
    if (rows.length !== grandfatheredIds.length) {
      throw new NotFoundException("Supplier not found");
    }
  }
}
