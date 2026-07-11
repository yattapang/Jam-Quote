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
import { PrismaClient, UserRole, RateUnit, PriceSource, EntityType } from "@prisma/client";
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

  await prisma.subscription.upsert({
    where: { businessId: business.id },
    update: {},
    create: { businessId: business.id, plan: "Pro", status: "active" },
  });

  // -------------------------------------------------------------------------
  // Platform-level data for the internal admin console (/admin/*). These
  // extra businesses/suppliers/regulatory rows are NOT the demo tenant's
  // data — they exist so the staff console lists have real cross-tenant
  // volume against the live Neon DB. Idempotent via upsert-by-stable-id.
  // -------------------------------------------------------------------------
  const otherBusinesses = [
    {
      id: "biz-2",
      name: "Golding Roofing & Sheet Metal",
      parish: "St. Andrew",
      entityType: EntityType.LIMITED_COMPANY,
      trn: "100112233",
      tradeType: "Roofing",
      plan: "Pro",
      status: "active",
    },
    {
      id: "biz-3",
      name: "Reid Electrical Services",
      parish: "St. James",
      entityType: EntityType.SOLE_TRADER,
      trn: "100223344",
      tradeType: "Electrical",
      plan: "Starter",
      status: "trial",
    },
    {
      id: "biz-4",
      name: "Campbell Plumbing & Irrigation",
      parish: "Clarendon",
      entityType: EntityType.PARTNERSHIP,
      trn: "100334455",
      tradeType: "Plumbing",
      plan: "Core",
      status: "active",
    },
    {
      id: "biz-5",
      name: "Brown's Tiling & Finishes",
      parish: "Manchester",
      entityType: EntityType.SOLE_TRADER,
      trn: "100445566",
      tradeType: "Tiling & finishes",
      plan: "Free",
      status: "active",
    },
    {
      id: "biz-6",
      name: "Excel Concrete & Foundations Ltd",
      parish: "St. Ann",
      entityType: EntityType.LIMITED_COMPANY,
      trn: "100556677",
      tradeType: "Concrete & foundations",
      plan: "Pro",
      status: "past_due",
    },
    {
      id: "biz-7",
      name: "Dawes Carpentry Co",
      parish: "Portland",
      entityType: EntityType.SOLE_TRADER,
      trn: "100667788",
      tradeType: "Carpentry",
      plan: "Starter",
      status: "active",
    },
    {
      id: "biz-8",
      name: "Highgate Painting & Decor",
      parish: "St. Mary",
      entityType: EntityType.PARTNERSHIP,
      trn: null,
      tradeType: "Painting & decor",
      plan: "Core",
      status: "trial",
    },
  ];

  for (const b of otherBusinesses) {
    const biz = await prisma.business.upsert({
      where: { id: b.id },
      update: {},
      create: {
        id: b.id,
        name: b.name,
        parish: b.parish,
        entityType: b.entityType,
        trn: b.trn,
        tradeType: b.tradeType,
        countryCode: "JM",
        currency: "JMD",
      },
    });
    await prisma.subscription.upsert({
      where: { businessId: biz.id },
      update: { plan: b.plan, status: b.status },
      create: { businessId: biz.id, plan: b.plan, status: b.status },
    });
  }

  const hoursAgo = (h: number): Date => new Date(Date.now() - h * 60 * 60 * 1000);
  const daysAgo = (d: number): Date => new Date(Date.now() - d * 24 * 60 * 60 * 1000);

  const otherSuppliers = [
    {
      id: "seed-supplier-kirks",
      name: "Kirk's Building Supplies",
      website: "https://www.kirksbuildingsupplies.com",
      parish: "St. Andrew",
      isPartner: true,
      prices: [
        { id: "seed-price-kirks-1", name: "Plywood 3/4in, 4x8 sheet", unit: "sheet", priceCents: 620000, fetchedAt: hoursAgo(3) },
        { id: "seed-price-kirks-2", name: "Roofing nails, 5lb box", unit: "5lb box", priceCents: 85000, fetchedAt: hoursAgo(6) },
      ],
    },
    {
      id: "seed-supplier-coppertone",
      name: "Coppertone Hardware",
      website: "https://www.coppertonehardware.com",
      parish: "Westmoreland",
      isPartner: false,
      prices: [
        { id: "seed-price-coppertone-1", name: "PVC pipe 4in, 10ft length", unit: "10ft length", priceCents: 210000, fetchedAt: daysAgo(2) },
      ],
    },
    {
      id: "seed-supplier-tilemax",
      name: "TileMax Jamaica",
      website: "https://www.tilemaxja.com",
      parish: "St. James",
      isPartner: true,
      prices: [
        { id: "seed-price-tilemax-1", name: "Porcelain floor tile, 60x60cm box", unit: "box (1.44sqm)", priceCents: 450000, fetchedAt: hoursAgo(12) },
        { id: "seed-price-tilemax-2", name: "Tile adhesive, 25kg bag", unit: "25kg bag", priceCents: 210000, fetchedAt: daysAgo(1) },
        { id: "seed-price-tilemax-3", name: "Grout, 5kg bag", unit: "5kg bag", priceCents: 95000, fetchedAt: daysAgo(1) },
      ],
    },
    {
      id: "seed-supplier-grace",
      name: "Grace Building Materials",
      website: "https://www.gracebuildingmaterials.com",
      parish: "Clarendon",
      isPartner: false,
      prices: [
        { id: "seed-price-grace-1", name: "Concrete blocks, 6in", unit: "block", priceCents: 15000, fetchedAt: daysAgo(5) },
        { id: "seed-price-grace-2", name: "River sand, per load", unit: "load (5 tonne)", priceCents: 1800000, fetchedAt: daysAgo(5) },
      ],
    },
    {
      id: "seed-supplier-ironsteel",
      name: "Iron & Steel Depot",
      website: "https://www.ironsteeldepot.com",
      parish: "Kingston",
      isPartner: true,
      prices: [
        { id: "seed-price-ironsteel-1", name: "Steel rebar 1/2in, per length", unit: "20ft length", priceCents: 145000, fetchedAt: hoursAgo(1) },
      ],
    },
  ];

  for (const s of otherSuppliers) {
    const supplier2 = await prisma.supplier.upsert({
      where: { id: s.id },
      update: {},
      create: { id: s.id, name: s.name, website: s.website, parish: s.parish, isPartner: s.isPartner },
    });
    for (const p of s.prices) {
      await prisma.materialPriceEntry.upsert({
        where: { id: p.id },
        update: { fetchedAt: p.fetchedAt },
        create: {
          id: p.id,
          supplierId: supplier2.id,
          name: p.name,
          unit: p.unit,
          priceCents: p.priceCents,
          source: PriceSource.LOOKUP,
          sourceUrl: supplier2.website,
          fetchedAt: p.fetchedAt,
        },
      });
    }
  }

  const regulatoryUpdates = [
    {
      id: "reg-1",
      title: "GCT registration threshold increases to JMD 15M",
      category: "GCT",
      summary:
        "Tax Administration Jamaica raised the mandatory GCT registration threshold; small contractors below it may deregister.",
      effectiveDate: new Date("2026-08-01T00:00:00.000Z"),
      sourceUrl: "https://www.jamaicatax.gov.jm",
      actionNeeded: "Review quote GCT defaults for micro-business tenants.",
    },
    {
      id: "reg-2",
      title: "NHT contribution rate unchanged for 2026/27",
      category: "NHT",
      summary: "The National Housing Trust confirmed employer/employee contribution rates hold steady for the new fiscal year.",
      effectiveDate: new Date("2026-04-01T00:00:00.000Z"),
      sourceUrl: "https://www.nht.gov.jm",
      actionNeeded: null,
    },
    {
      id: "reg-3",
      title: "HEART/NSTA levy filing deadline moved up",
      category: "HEART",
      summary: "Employers must now file the HEART Trust NSTA training levy return two weeks earlier than prior years.",
      effectiveDate: new Date("2026-09-15T00:00:00.000Z"),
      sourceUrl: "https://www.heart-nsta.org",
      actionNeeded: "Flag payroll reminder for affected business tenants.",
    },
    {
      id: "reg-4",
      title: "Minimum wage increases for construction labourers",
      category: "MIN_WAGE",
      summary: "The national minimum wage rises, affecting default labour rate suggestions for helper/labourer tiers.",
      effectiveDate: new Date("2026-06-01T00:00:00.000Z"),
      sourceUrl: "https://mlss.gov.jm",
      actionNeeded: "Update seeded LabourRate defaults for new tenants.",
    },
    {
      id: "reg-5",
      title: "Education tax withholding guidance updated",
      category: "EDUCATION",
      summary: "Tax Administration Jamaica clarified education tax withholding treatment for sole-trader contractors.",
      effectiveDate: new Date("2026-05-01T00:00:00.000Z"),
      sourceUrl: "https://www.jamaicatax.gov.jm",
      actionNeeded: null,
    },
  ];

  for (const r of regulatoryUpdates) {
    await prisma.regulatoryUpdate.upsert({
      where: { id: r.id },
      update: {},
      create: r,
    });
  }

  // eslint-disable-next-line no-console
  console.log(
    `Seeded ${demoClients.length} clients, ${demoJobs.length} jobs, ${demoQuotes.length} quotes for ${business.name}; ` +
      `${otherBusinesses.length + 1} businesses, ${otherSuppliers.length + 1} suppliers, ${regulatoryUpdates.length} regulatory updates total.`,
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
