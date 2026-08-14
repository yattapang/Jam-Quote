/**
 * Removes the seeded admin-console demo tenants (biz-2 … biz-8) — the seven
 * fictional companies that exist only to give the admin console's tenant list
 * something to render. They are separate from seed-business-blackwood, which
 * has its own script (cleanup-seed.ts) because it owns real quote/client/job
 * data and deserves a different conversation.
 *
 * Run with `npm run -w @jamquote/api db:clean-demo-tenants`.
 *
 * SAFETY: destructive and irreversible. Two independent guards:
 *
 *   1. It REFUSES if any target business owns a single row of tenant data.
 *      These are supposed to be empty shells; if one is not, the assumption
 *      behind deleting it without review is wrong, and the right response is
 *      to stop and let a human look rather than to delete a bit more than
 *      anyone expected. The check re-runs at execution time rather than
 *      trusting an inventory taken earlier — a tenant could have been used
 *      between the two moments.
 *   2. It refuses unless CONFIRM_CLEANUP=yes is set.
 *
 * A Subscription row per business IS expected — the seed creates one so the
 * admin financials screen has revenue to display — and is deleted along with
 * its business. That is the one row type whose presence is not treated as a
 * reason to abort. Deleting these will lower the MRR and tenant counts the
 * admin console shows, which is the point: those figures currently include
 * seven companies that do not exist.
 *
 * AuditLog is deliberately untouched. It references targets by plain string
 * id with no foreign key, so history mentioning these tenants survives — a
 * record of an action against a since-deleted tenant is still a true record.
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const DEMO_TENANT_IDS = ["biz-2", "biz-3", "biz-4", "biz-5", "biz-6", "biz-7", "biz-8"];

/** Every table that would mean "a person actually used this tenant". */
async function countTenantData(businessId: string): Promise<Record<string, number>> {
  const [
    quotes,
    clients,
    jobs,
    invoices,
    users,
    payments,
    messageLogs,
    attachments,
    labourRates,
    materialFavourites,
    equipmentItems,
    connections,
    assemblies,
    suppliers,
    priceEntries,
    materialUnits,
    trades,
    categoryDefs,
    attributeDefs,
    attributeOptions,
    logos,
  ] = await Promise.all([
    prisma.quote.count({ where: { businessId } }),
    prisma.client.count({ where: { businessId } }),
    prisma.job.count({ where: { businessId } }),
    prisma.invoice.count({ where: { businessId } }),
    prisma.user.count({ where: { businessId } }),
    prisma.payment.count({ where: { invoice: { businessId } } }),
    prisma.messageLog.count({ where: { quote: { businessId } } }),
    prisma.attachment.count({ where: { job: { businessId } } }),
    prisma.labourRate.count({ where: { businessId } }),
    prisma.materialFavourite.count({ where: { businessId } }),
    prisma.equipmentItem.count({ where: { businessId } }),
    prisma.connection.count({ where: { businessId } }),
    prisma.assembly.count({ where: { businessId } }),
    prisma.supplier.count({ where: { businessId } }),
    prisma.materialPriceEntry.count({ where: { businessId } }),
    prisma.materialUnit.count({ where: { businessId } }),
    prisma.trade.count({ where: { businessId } }),
    prisma.materialCategoryDef.count({ where: { businessId } }),
    prisma.materialAttributeDef.count({ where: { businessId } }),
    prisma.materialAttributeOption.count({ where: { businessId } }),
    prisma.businessLogo.count({ where: { businessId } }),
  ]);
  return {
    quotes,
    clients,
    jobs,
    invoices,
    users,
    payments,
    messageLogs,
    attachments,
    labourRates,
    materialFavourites,
    equipmentItems,
    connections,
    assemblies,
    suppliers,
    priceEntries,
    materialUnits,
    trades,
    categoryDefs,
    attributeDefs,
    attributeOptions,
    logos,
  };
}

async function main(): Promise<void> {
  const found = await prisma.business.findMany({
    where: { id: { in: DEMO_TENANT_IDS } },
    select: { id: true, name: true },
  });

  if (found.length === 0) {
    // eslint-disable-next-line no-console
    console.log("None of the demo tenants exist — nothing to clean up.");
    return;
  }

  // eslint-disable-next-line no-console
  console.log(`Found ${found.length} demo tenant(s):\n`);

  let blocked = false;
  let subscriptionTotal = 0;

  for (const biz of found) {
    const counts = await countTenantData(biz.id);
    const subscriptions = await prisma.subscription.count({ where: { businessId: biz.id } });
    subscriptionTotal += subscriptions;

    const nonEmpty = Object.entries(counts).filter(([, n]) => n > 0);
    if (nonEmpty.length > 0) {
      blocked = true;
      // eslint-disable-next-line no-console
      console.log(
        `  ${biz.id}  "${biz.name}"  *** NOT EMPTY: ` +
          nonEmpty.map(([k, n]) => `${n} ${k}`).join(", ") +
          " ***",
      );
    } else {
      // eslint-disable-next-line no-console
      console.log(
        `  ${biz.id}  "${biz.name}"  empty` +
          (subscriptions > 0 ? ` (+${subscriptions} seeded subscription)` : ""),
      );
    }
  }

  if (blocked) {
    // eslint-disable-next-line no-console
    console.log(
      "\nAborting without deleting anything. At least one tenant listed above " +
        "owns real data, so the premise for removing these unreviewed — that " +
        "they are empty shells — does not hold. Inspect it first.",
    );
    return;
  }

  // eslint-disable-next-line no-console
  console.log(
    `\nAll ${found.length} are empty. Deleting them removes ${subscriptionTotal} ` +
      "seeded subscription row(s) with them, which will lower the tenant count " +
      "and MRR shown in the admin console.\n" +
      "NOT touched: seed-business-blackwood, your real tenants, all curated " +
      "catalog data, and AuditLog history.",
  );

  if (process.env.CONFIRM_CLEANUP !== "yes") {
    // eslint-disable-next-line no-console
    console.log(
      "\nRefusing to proceed: set CONFIRM_CLEANUP=yes to actually run this deletion.\n" +
        "e.g. CONFIRM_CLEANUP=yes npm run -w @jamquote/api db:clean-demo-tenants",
    );
    return;
  }

  // eslint-disable-next-line no-console
  console.log("\nCONFIRM_CLEANUP=yes — proceeding with deletion...");

  const ids = found.map((b) => b.id);
  await prisma.$transaction(async (tx) => {
    // Subscription -> Business has no cascade, so it goes first.
    await tx.subscription.deleteMany({ where: { businessId: { in: ids } } });
    await tx.business.deleteMany({ where: { id: { in: ids } } });
  });

  // eslint-disable-next-line no-console
  console.log(`\nDone. Deleted ${ids.length} demo tenant(s): ${ids.join(", ")}`);
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
