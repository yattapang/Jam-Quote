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
  const ids = [
    ...new Set(
      supplierIds
        .filter((v): v is string => Boolean(v))
        .filter((v) => !allowIds.has(v)),
    ),
  ];
  if (ids.length === 0) return;

  const rows = await prisma.supplier.findMany({
    where: { id: { in: ids }, businessId, deletedAt: null },
    select: { id: true },
  });
  if (rows.length !== ids.length) {
    throw new NotFoundException("Supplier not found");
  }
}
