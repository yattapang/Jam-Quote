import type { Prisma } from "@prisma/client";

/**
 * Permanently deletes a business and every row it owns, in FK-safe order.
 *
 * This is the exact deletion order used by prisma/cleanup-seed.ts, extracted
 * here so the one-off seed-cleanup script and the admin hard-delete endpoint
 * (AdminService.hardDeleteTenant) share a single source of truth. Must run
 * inside a `prisma.$transaction(async (tx) => ...)` — the caller is
 * responsible for opening (and confirming) the transaction.
 *
 * Most relations to Business in schema.prisma do NOT declare
 * onDelete: Cascade (only Quote -> QuoteSection/QuoteLineItem,
 * Invoice -> Payment, and User -> PasswordResetToken do). Everything else
 * referencing this business, or referencing rows owned by this business,
 * must be deleted explicitly in an order that never violates a foreign key:
 *
 *   MessageLog (-> Quote)
 *   Invoice (-> Quote, -> Client; cascades to Payment)
 *   Attachment (-> Job)
 *   Quote (-> Job, -> Client; cascades to QuoteSection, QuoteLineItem)
 *   Job (-> Client)
 *   Client
 *   LabourRate, MaterialFavourite, EquipmentItem, Connection, Subscription
 *   MaterialPriceEntry, then Supplier (see step 8 — RESTRICT between them)
 *   User (businessId is nullable, but still an FK; cascades to
 *     PasswordResetToken)
 *   Business
 */
export async function deleteBusinessCascade(
  tx: Prisma.TransactionClient,
  businessId: string,
): Promise<void> {
  // 1. MessageLog references Quote directly (no cascade) — delete first.
  await tx.messageLog.deleteMany({ where: { quote: { businessId } } });

  // 2. Invoice references Quote and Client (no cascade on either) — delete
  //    before both. Invoice -> Payment IS onDelete: Cascade, so Payment
  //    rows go with it automatically.
  await tx.invoice.deleteMany({ where: { businessId } });

  // 3. Attachment references Job (no cascade) — delete before Job.
  await tx.attachment.deleteMany({ where: { job: { businessId } } });

  // 4. Quote references Job and Client (no cascade on either); cascades to
  //    QuoteSection and QuoteLineItem itself.
  await tx.quote.deleteMany({ where: { businessId } });

  // 5. Job references Client (no cascade) — delete before Client.
  await tx.job.deleteMany({ where: { businessId } });

  // 6. Client.
  await tx.client.deleteMany({ where: { businessId } });

  // 7. Simple businessId-only FKs — any order among themselves.
  await tx.labourRate.deleteMany({ where: { businessId } });
  await tx.materialFavourite.deleteMany({ where: { businessId } });
  await tx.equipmentItem.deleteMany({ where: { businessId } });
  await tx.connection.deleteMany({ where: { businessId } });
  await tx.subscription.deleteMany({ where: { businessId } });

  // 8. Suppliers are tenant-owned. Supplier.businessId IS onDelete: Cascade,
  //    but relying on that would delete them as a side effect of step 9 — and
  //    MaterialPriceEntry.supplierId is ON DELETE RESTRICT, which fires
  //    immediately rather than deferring to the end of the statement. Any
  //    price entry still pointing at this tenant's supplier would abort the
  //    whole hard delete with an opaque FK error. So: entries first, then the
  //    suppliers, explicitly and in that order.
  await tx.materialPriceEntry.deleteMany({ where: { businessId } });
  await tx.supplier.deleteMany({ where: { businessId } });

  // 9. User.businessId is nullable but still an FK — delete users of this
  //    business before the business itself. PasswordResetToken cascades.
  await tx.user.deleteMany({ where: { businessId } });

  // 10. Finally, the business row.
  await tx.business.delete({ where: { id: businessId } });
}
