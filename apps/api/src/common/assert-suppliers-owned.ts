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
    // soft-deleted.
    //
    // The owner test accepts this business OR **no owner at all**, and the
    // difference between those two cases and a DIFFERENT tenant's id is the
    // whole point of this check:
    //
    //  - `businessId: null` is pre-tenancy platform data. `Supplier.businessId`
    //    is nullable only for those rows (see model Supplier in schema.prisma),
    //    they are FK-referenced by existing `QuoteLineItem`s, and no tenant can
    //    see or reach one — so an ownerless row leaks nothing. Refusing it made
    //    update, revise and convert every 404 on a quote that already referenced
    //    one, and `LineItemsEditor.tsx` has no supplier control, so the
    //    contractor could not clear the field either: the quote was permanently
    //    unsavable with no path to recovery.
    //  - Another business's id is a live merchant belonging to a real
    //    contractor. A pre-S7 id written before tenant checks existed is not
    //    grandfathered forever: the update is refused rather than silently
    //    dropping the id to null, because this is a financial reference on a
    //    real quote/invoice and changing what it points at without the
    //    contractor's knowledge is worse than making them fix the document once.
    //
    // NEW ids get none of this: the `newIds` branch above still demands a live
    // supplier this business owns, so nobody can ATTACH an ownerless row.
    const rows = await prisma.supplier.findMany({
      // `OR` rather than `businessId: { in: [businessId, null] }`: Prisma's
      // StringNullableFilter types `in` as `string[]`, so a null in that array is a
      // type error — and casting it away would be a cast over exactly the tenant
      // boundary this function exists to enforce.
      where: { id: { in: grandfatheredIds }, OR: [{ businessId }, { businessId: null }] },
      select: { id: true },
    });
    if (rows.length !== grandfatheredIds.length) {
      throw new NotFoundException("Supplier not found");
    }
  }
}
