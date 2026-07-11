/**
 * Seed script — `npm run -w @jamquote/api db:seed` (runs via `prisma db seed`
 * so the CLI loads apps/api/.env first). Requires DATABASE_URL to point at a
 * reachable Postgres and the schema to be migrated (`prisma migrate deploy`).
 *
 * Inserts the SAME demo dataset the web/mobile apps render (the shared
 * @jamquote/core fixtures), so the live API serves identical data. Quote money
 * totals are computed by computeTotals (via demoQuoteTotals) — never hand-typed.
 * Idempotent: clears this business's clients/jobs/quotes then re-inserts.
 */
import { PrismaClient, UserRole, RateUnit, PriceSource } from "@prisma/client";
import {
  demoClients,
  demoJobs,
  demoQuotes,
  demoQuoteTotals,
} from "@jamquote/core";

const prisma = new PrismaClient();

const BUSINESS_ID = "seed-business-blackwood";

async function main(): Promise<void> {
  const business = await prisma.business.upsert({
    where: { id: BUSINESS_ID },
    update: {},
    create: {
      id: BUSINESS_ID,
      name: "Blackwood Construction & Masonry",
      trn: "102458963",
      parish: "St. Catherine",
      tradeType: "General contractor & masonry",
      addressLine: "Spanish Town, St. Catherine",
      countryCode: "JM",
      currency: "JMD",
      defaultGctRate: "15.00",
      quotePrefix: "QT-",
      invoicePrefix: "INV-",
    },
  });

  await prisma.user.upsert({
    where: { id: "seed-user-owen" },
    update: {},
    create: {
      id: "seed-user-owen",
      businessId: business.id,
      role: UserRole.OWNER,
      fullName: "Owen Blackwood",
      phone: "8765550142",
      email: "owen@blackwoodconstruction.jm",
    },
  });

  // Clean slate for this business's transactional data (FK-safe order).
  await prisma.quoteLineItem.deleteMany({ where: { quote: { businessId: business.id } } });
  await prisma.quoteSection.deleteMany({ where: { quote: { businessId: business.id } } });
  await prisma.quote.deleteMany({ where: { businessId: business.id } });
  await prisma.job.deleteMany({ where: { businessId: business.id } });
  await prisma.client.deleteMany({ where: { businessId: business.id } });

  for (const c of demoClients) {
    await prisma.client.create({
      data: {
        id: c.id,
        businessId: business.id,
        name: c.name,
        phone: c.phone,
        parish: c.parish,
        addressLine: c.addressLine,
      },
    });
  }

  for (const j of demoJobs) {
    await prisma.job.create({
      data: {
        id: j.id,
        businessId: business.id,
        clientId: j.clientId,
        name: j.name,
        addressLine: j.addressLine,
        parish: j.parish,
        stage: j.stage,
        progressPct: j.progressPct,
      },
    });
  }

  for (const q of demoQuotes) {
    const totals = demoQuoteTotals(q);
    await prisma.quote.create({
      data: {
        id: q.id,
        businessId: business.id,
        clientId: q.clientId,
        jobId: q.jobId,
        number: q.number,
        status: q.status,
        version: 1,
        gctRate: q.gctRatePct,
        discountPct: q.discountPct,
        depositCents: q.depositCents,
        subtotalCents: totals.subtotalCents,
        gctCents: totals.gctCents,
        totalCents: totals.totalCents,
        lineItems: {
          create: q.lines.map((l, idx) => ({
            category: l.category,
            description: l.description,
            quantity: l.quantity,
            rateUnit: l.rateUnit,
            unitPriceCents: l.unitPriceCents,
            priceSource: l.priceSource,
            gctTreatment: l.gctTreatment,
            markupPct: l.markupPct,
            sort: idx,
          })),
        },
      },
    });
  }

  const supplier = await prisma.supplier.upsert({
    where: { id: "seed-supplier-hardware-lumber" },
    update: {},
    create: {
      id: "seed-supplier-hardware-lumber",
      name: "H&L True Value Hardware & Lumber",
      website: "https://www.hardwareandlumber.com",
      parish: "Kingston",
      isPartner: true,
    },
  });

  for (const p of [
    { id: "seed-price-cement", name: "Carib Cement, 42.5kg bag", unit: "42.5kg bag", priceCents: 145000 },
    { id: "seed-price-steel", name: "Steel rebar 3/8in, per length", unit: "20ft length", priceCents: 98000 },
  ]) {
    await prisma.materialPriceEntry.upsert({
      where: { id: p.id },
      update: {},
      create: { ...p, supplierId: supplier.id, source: PriceSource.LOOKUP, sourceUrl: supplier.website },
    });
  }

  for (const r of [
    { id: "seed-labour-mason", trade: "Mason", skillTier: "journeyman", rateCents: 850000, rateUnit: RateUnit.DAY },
    { id: "seed-labour-helper", trade: "General labourer", skillTier: "helper", rateCents: 280000, rateUnit: RateUnit.DAY },
  ]) {
    await prisma.labourRate.upsert({ where: { id: r.id }, update: {}, create: { ...r, businessId: business.id } });
  }

  await prisma.equipmentItem.upsert({
    where: { id: "seed-equip-mixer" },
    update: {},
    create: { id: "seed-equip-mixer", businessId: business.id, name: "Concrete mixer, 1-bag", owned: true, rateCents: 600000, rateUnit: RateUnit.DAY },
  });

  // eslint-disable-next-line no-console
  console.log(
    `Seeded ${demoClients.length} clients, ${demoJobs.length} jobs, ${demoQuotes.length} quotes for ${business.name}.`,
  );
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
