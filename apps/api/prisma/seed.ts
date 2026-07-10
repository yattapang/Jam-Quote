/**
 * Seed script — `npm run -w @jamquote/api db:seed` (runs via tsx).
 * Requires DATABASE_URL to point at a reachable Postgres and the schema to be
 * migrated first (`prisma migrate dev`). Idempotent: every row uses a stable id
 * with upsert, so re-running updates rather than duplicating.
 *
 * Money is integer JMD cents, mirroring packages/core. Enum values come from
 * the generated Prisma client so they always match the schema.
 */
import {
  PrismaClient,
  UserRole,
  RateUnit,
  PriceSource,
} from "@prisma/client";

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

  const clients = [
    {
      id: "seed-client-basil",
      name: "Basil Reid",
      phone: "8764028811",
      parish: "St. Catherine",
      addressLine: "Lot 14 Bloxburgh Dr, Spanish Town, St. Catherine",
    },
    {
      id: "seed-client-paulette",
      name: "Paulette Wright",
      phone: "8767712290",
      parish: "St. Catherine",
      addressLine: "22 Passage Fort Dr, Portmore, St. Catherine",
    },
  ];
  for (const c of clients) {
    await prisma.client.upsert({
      where: { id: c.id },
      update: {},
      create: { ...c, businessId: business.id },
    });
  }

  await prisma.job.upsert({
    where: { id: "seed-job-retaining-wall" },
    update: {},
    create: {
      id: "seed-job-retaining-wall",
      businessId: business.id,
      clientId: "seed-client-basil",
      name: "Retaining wall, Spanish Town",
      parish: "St. Catherine",
      stage: "Quoted",
    },
  });

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

  const priceEntries = [
    {
      id: "seed-price-cement",
      name: "Carib Cement, 42.5kg bag",
      unit: "42.5kg bag",
      priceCents: 145000,
    },
    {
      id: "seed-price-steel",
      name: "Steel rebar 3/8in, per length",
      unit: "20ft length",
      priceCents: 98000,
    },
  ];
  for (const p of priceEntries) {
    await prisma.materialPriceEntry.upsert({
      where: { id: p.id },
      update: {},
      create: {
        ...p,
        supplierId: supplier.id,
        source: PriceSource.LOOKUP,
        sourceUrl: supplier.website,
      },
    });
  }

  const labourRates = [
    { id: "seed-labour-mason", trade: "Mason", skillTier: "journeyman", rateCents: 850000, rateUnit: RateUnit.DAY },
    { id: "seed-labour-helper", trade: "General labourer", skillTier: "helper", rateCents: 280000, rateUnit: RateUnit.DAY },
  ];
  for (const r of labourRates) {
    await prisma.labourRate.upsert({
      where: { id: r.id },
      update: {},
      create: { ...r, businessId: business.id },
    });
  }

  await prisma.materialFavourite.upsert({
    where: { id: "seed-fav-cement" },
    update: {},
    create: {
      id: "seed-fav-cement",
      businessId: business.id,
      name: "Carib Cement, 42.5kg bag",
      unit: "42.5kg bag",
      priceCents: 145000,
      supplierId: supplier.id,
    },
  });

  await prisma.equipmentItem.upsert({
    where: { id: "seed-equip-mixer" },
    update: {},
    create: {
      id: "seed-equip-mixer",
      businessId: business.id,
      name: "Concrete mixer, 1-bag",
      owned: true,
      rateCents: 600000,
      rateUnit: RateUnit.DAY,
    },
  });

  // eslint-disable-next-line no-console
  console.log(`Seeded business ${business.name} (${business.id}).`);
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
