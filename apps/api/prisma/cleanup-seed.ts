/**
 * Seed cleanup script — deletes the single seeded demo Business
 * ("seed-business-blackwood") and every row that hangs off it, so a
 * production deployment doesn't carry the demo tenant forever.
 *
 * Run with `npm run -w @jamquote/api db:clean-seed` (executes via tsx, which
 * loads apps/api/.env the same way prisma/seed.ts does).
 *
 * SAFETY: this is destructive and irreversible. It refuses to run unless
 * CONFIRM_CLEANUP=yes is set in the environment, and it always prints a
 * summary of exactly what it is about to delete before doing anything.
 *
 * Scope: only data belonging to seed-business-blackwood. It intentionally
 * leaves alone:
 *   - Supplier / MaterialPriceEntry rows (catalog data, not business-scoped
 *     in the schema — shared across tenants).
 *   - RegulatoryUpdate rows (platform-wide, not business-scoped).
 *   - The other seeded admin-console businesses (biz-2..biz-8) and their
 *     Subscription rows — those are a separate concern from this demo
 *     tenant's data.
 *
 * FK-safety: most relations to Business in schema.prisma do NOT declare
 * onDelete: Cascade (only Quote -> QuoteSection/QuoteLineItem and
 * Invoice -> Payment do). Everything else referencing this business, or
 * referencing rows owned by this business, must be deleted explicitly in an
 * order that never violates a foreign key:
 *
 *   MessageLog (-> Quote)
 *   Invoice (-> Quote, -> Client; cascades to Payment)
 *   Attachment (-> Job)
 *   Quote (-> Job, -> Client; cascades to QuoteSection, QuoteLineItem)
 *   Job (-> Client)
 *   Client
 *   LabourRate, MaterialFavourite, EquipmentItem, Connection, Subscription
 *   User (businessId is nullable, but still an FK to Business)
 *   Business
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const BUSINESS_ID = "seed-business-blackwood";

async function main(): Promise<void> {
  const business = await prisma.business.findUnique({ where: { id: BUSINESS_ID } });

  if (!business) {
    // eslint-disable-next-line no-console
    console.log(`No business with id "${BUSINESS_ID}" found — nothing to clean up.`);
    return;
  }

  // --- Gather counts up front so we can print an accurate summary and so
  // the transaction below doesn't need to re-derive them mid-flight. ---
  const [
    messageLogCount,
    paymentCount,
    invoiceCount,
    attachmentCount,
    quoteLineItemCount,
    quoteSectionCount,
    quoteCount,
    jobCount,
    clientCount,
    labourRateCount,
    materialFavouriteCount,
    equipmentItemCount,
    connectionCount,
    subscriptionCount,
    userCount,
  ] = await Promise.all([
    prisma.messageLog.count({ where: { quote: { businessId: business.id } } }),
    prisma.payment.count({ where: { invoice: { businessId: business.id } } }),
    prisma.invoice.count({ where: { businessId: business.id } }),
    prisma.attachment.count({ where: { job: { businessId: business.id } } }),
    prisma.quoteLineItem.count({ where: { quote: { businessId: business.id } } }),
    prisma.quoteSection.count({ where: { quote: { businessId: business.id } } }),
    prisma.quote.count({ where: { businessId: business.id } }),
    prisma.job.count({ where: { businessId: business.id } }),
    prisma.client.count({ where: { businessId: business.id } }),
    prisma.labourRate.count({ where: { businessId: business.id } }),
    prisma.materialFavourite.count({ where: { businessId: business.id } }),
    prisma.equipmentItem.count({ where: { businessId: business.id } }),
    prisma.connection.count({ where: { businessId: business.id } }),
    prisma.subscription.count({ where: { businessId: business.id } }),
    prisma.user.count({ where: { businessId: business.id } }),
  ]);

  // eslint-disable-next-line no-console
  console.log(`About to permanently delete business "${business.name}" (${business.id}) and:`);
  // eslint-disable-next-line no-console
  console.log(`  ${messageLogCount} message log entries`);
  // eslint-disable-next-line no-console
  console.log(`  ${paymentCount} payments (via ${invoiceCount} invoices, cascade)`);
  // eslint-disable-next-line no-console
  console.log(`  ${invoiceCount} invoices`);
  // eslint-disable-next-line no-console
  console.log(`  ${attachmentCount} attachments`);
  // eslint-disable-next-line no-console
  console.log(
    `  ${quoteLineItemCount} quote line items and ${quoteSectionCount} quote sections (via ${quoteCount} quotes, cascade)`,
  );
  // eslint-disable-next-line no-console
  console.log(`  ${quoteCount} quotes`);
  // eslint-disable-next-line no-console
  console.log(`  ${jobCount} jobs`);
  // eslint-disable-next-line no-console
  console.log(`  ${clientCount} clients`);
  // eslint-disable-next-line no-console
  console.log(`  ${labourRateCount} labour rates`);
  // eslint-disable-next-line no-console
  console.log(`  ${materialFavouriteCount} material favourites`);
  // eslint-disable-next-line no-console
  console.log(`  ${equipmentItemCount} equipment items`);
  // eslint-disable-next-line no-console
  console.log(`  ${connectionCount} connections`);
  // eslint-disable-next-line no-console
  console.log(`  ${subscriptionCount} subscription`);
  // eslint-disable-next-line no-console
  console.log(`  ${userCount} users`);
  // eslint-disable-next-line no-console
  console.log(`  1 business`);
  // eslint-disable-next-line no-console
  console.log(
    "\nNOT touched (shared/platform data, not owned by this business): Supplier, " +
      "MaterialPriceEntry, RegulatoryUpdate, and the other seeded admin-console businesses.",
  );

  if (process.env.CONFIRM_CLEANUP !== "yes") {
    // eslint-disable-next-line no-console
    console.log(
      '\nRefusing to proceed: set CONFIRM_CLEANUP=yes to actually run this deletion.\n' +
        "e.g. CONFIRM_CLEANUP=yes npm run -w @jamquote/api db:clean-seed",
    );
    return;
  }

  // eslint-disable-next-line no-console
  console.log("\nCONFIRM_CLEANUP=yes — proceeding with deletion...");

  await prisma.$transaction(async (tx) => {
    // 1. MessageLog references Quote directly (no cascade) — delete first.
    await tx.messageLog.deleteMany({ where: { quote: { businessId: business.id } } });

    // 2. Invoice references Quote and Client (no cascade on either) — delete
    //    before both. Invoice -> Payment IS onDelete: Cascade, so Payment
    //    rows go with it automatically.
    await tx.invoice.deleteMany({ where: { businessId: business.id } });

    // 3. Attachment references Job (no cascade) — delete before Job.
    await tx.attachment.deleteMany({ where: { job: { businessId: business.id } } });

    // 4. Quote references Job and Client (no cascade on either); cascades to
    //    QuoteSection and QuoteLineItem itself.
    await tx.quote.deleteMany({ where: { businessId: business.id } });

    // 5. Job references Client (no cascade) — delete before Client.
    await tx.job.deleteMany({ where: { businessId: business.id } });

    // 6. Client.
    await tx.client.deleteMany({ where: { businessId: business.id } });

    // 7. Simple businessId-only FKs — any order among themselves.
    await tx.labourRate.deleteMany({ where: { businessId: business.id } });
    await tx.materialFavourite.deleteMany({ where: { businessId: business.id } });
    await tx.equipmentItem.deleteMany({ where: { businessId: business.id } });
    await tx.connection.deleteMany({ where: { businessId: business.id } });
    await tx.subscription.deleteMany({ where: { businessId: business.id } });

    // 8. User.businessId is nullable but still an FK — delete the seeded
    //    login-capable users for this business before the business itself.
    await tx.user.deleteMany({ where: { businessId: business.id } });

    // 9. Finally, the business row.
    await tx.business.delete({ where: { id: business.id } });
  });

  // eslint-disable-next-line no-console
  console.log(`\nDone. Deleted business "${business.name}" (${business.id}) and all owned data.`);
}

main()
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error(err);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
