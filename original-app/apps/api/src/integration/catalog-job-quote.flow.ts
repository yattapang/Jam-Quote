/**
 * FLOW 1 — catalog -> job -> quote, over the real services and a real Postgres.
 *
 * The web builds a job component from a catalog row's price and a quote line from a
 * job's `unitCostCents` (lib/line-editor.ts `jobPatch`). The API is the other half
 * of each hand-off, and the defect that motivated this suite crossed exactly here: a
 * job whose cost could not be computed was read back with a placeholder price, and
 * that price was what the quote builder copied into a line.
 *
 * The web half is represented by `lineFromJob`, the same fields `jobPatch` sets. It is
 * not imported: apps/api's tsconfig roots at src/, so a web module cannot be compiled
 * into this workspace. What this does NOT prove is that the web's `jobPatch` still sets
 * these fields — that is apps/web/lib/line-editor.test.ts's job.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { GctTreatment, JobComponentKind, LineCategory, RateUnit } from "@jamquote/core";
import { createJobSchema, updateJobSchema } from "../jobs/jobs.dto.js";
import { createQuoteSchema } from "../quotes/quotes.dto.js";
import {
  createEquipmentItemSchema,
  createLabourRateSchema,
  createMaterialFavouriteSchema,
} from "../catalogs/catalogs.dto.js";
import type { JobWithCost } from "../jobs/jobs.service.js";
import { type Integration } from "./fixture.js";

let env: Integration;

/** What the web's quote builder puts on a line when a job is picked. */
function lineFromJob(job: JobWithCost, quantity: number) {
  return {
    category: LineCategory.OTHER,
    description: job.name,
    quantity,
    rateUnit: RateUnit.UNIT,
    unitLabel: job.unit,
    unitPriceCents: job.unitCostCents,
    gctTreatment: GctTreatment.STANDARD,
    jobId: job.id,
    jobName: job.name,
    jobUnit: job.unit,
    jobComponents: job.components.map((c) => ({
      kind: c.kind,
      description: c.description,
      quantityPerUnit: Number(c.quantityPerUnit),
      unitLabel: c.unitLabel ?? undefined,
      unitPriceCents: c.unitPriceCents,
    })),
  };
}

async function buildCatalogAndJob(businessId: string) {
  const { svc } = env;
  const material = await svc.materials.create(
    businessId,
    createMaterialFavouriteSchema.parse({ name: "Portland cement 42.5kg", priceCents: 189_550, unit: "bag" }),
  );
  const labour = await svc.labour.create(
    businessId,
    createLabourRateSchema.parse({ trade: "Mason", rateCents: 1_200_000, rateUnit: RateUnit.DAY }),
  );
  const equipment = await svc.equipment.create(
    businessId,
    createEquipmentItemSchema.parse({ name: "Concrete mixer", rateCents: 450_000, rateUnit: RateUnit.DAY }),
  );

  const job = await svc.jobs.create(
    businessId,
    createJobSchema.parse({
      name: "Block wall, 6in",
      unit: "m2",
      markupPct: 17.5,
      components: [
        {
          kind: JobComponentKind.MATERIAL,
          materialFavouriteId: material.id,
          description: material.name,
          quantityPerUnit: 1.333,
          unitPriceCents: material.priceCents,
        },
        {
          kind: JobComponentKind.LABOUR,
          labourRateId: labour.id,
          description: labour.trade,
          quantityPerUnit: 0.125,
          unitPriceCents: labour.rateCents,
        },
        {
          kind: JobComponentKind.EQUIPMENT,
          equipmentItemId: equipment.id,
          description: equipment.name,
          quantityPerUnit: 0.05,
          unitPriceCents: equipment.rateCents,
        },
      ],
    }),
  );
  return { material, labour, equipment, job };
}


/** Registered by flows.integration.test.ts, which owns the one shared database. */
export function catalogJobQuoteFlow(shared: () => Integration): void {
  beforeAll(() => {
    env = shared();
  });

describe("catalog -> job -> quote", () => {
  it("prices the quote line at the job's unit cost to the cent, and the cost is the catalog's", async () => {
    const { a } = await env.tenants();
    const { material, labour, equipment, job } = await buildCatalogAndJob(a.id);

    // catalog -> job: each component carries the catalog row's own price.
    const byKind = Object.fromEntries(job.components.map((c) => [c.kind, c.unitPriceCents]));
    expect(byKind).toEqual({
      MATERIAL: material.priceCents,
      LABOUR: labour.rateCents,
      EQUIPMENT: equipment.rateCents,
    });
    // Worked by hand, NOT by core, so a defect in the shared cost function shows here:
    //   1.333 x 189550 = 252670.15 -> 252670
    //   0.125 x 1200000 = 150000
    //   0.05  x 450000  = 22500
    //   base 425170; markup 17.5% = 74404.75 -> 74405; unit cost 499575.
    expect(job.costInvalid).toBe(false);
    expect(job.unitCostCents).toBe(499_575);
    expect(job.unit).toBe("m²");

    // job -> quote
    const quote = await env.svc.quotes.create(a.id, createQuoteSchema.parse({ lineItems: [lineFromJob(job, 12)] }));
    const [line] = quote.lineItems;
    expect(line!.unitPriceCents).toBe(job.unitCostCents);
    expect(line!.markupPct).toBeNull(); // the job's markup is already in the price
    expect(line!.jobId).toBe(job.id);
    expect(quote.subtotalCents).toBe(12 * 499_575);
    // A is GCT-registered at 15%: 5,994,900 x 15% = 899,235.
    expect(quote.gctCents).toBe(899_235);
    expect(quote.totalCents).toBe(5_994_900 + 899_235);
  });

  it("a later edit to the catalog or the job does not move a saved quote", async () => {
    const { a } = await env.tenants();
    const { material, labour, job } = await buildCatalogAndJob(a.id);
    const quote = await env.svc.quotes.create(a.id, createQuoteSchema.parse({ lineItems: [lineFromJob(job, 4)] }));
    const before = await env.svc.quotes.findOne(a.id, quote.id);

    await env.svc.materials.update(a.id, material.id, { priceCents: 999_999 });
    await env.svc.labour.update(a.id, labour.id, { rateCents: 1 });
    const edited = await env.svc.jobs.update(
      a.id,
      job.id,
      updateJobSchema.parse({
        name: "Renamed wall",
        markupPct: 40,
        components: job.components.map((c) => ({
          kind: c.kind,
          materialFavouriteId: c.materialFavouriteId ?? undefined,
          labourRateId: c.labourRateId ?? undefined,
          equipmentItemId: c.equipmentItemId ?? undefined,
          description: c.description,
          quantityPerUnit: Number(c.quantityPerUnit) * 2,
          unitPriceCents: c.unitPriceCents,
        })),
      }),
    );
    expect(edited.unitCostCents).not.toBe(job.unitCostCents); // the edit really moved the job
    await env.svc.jobs.remove(a.id, job.id);

    const after = await env.svc.quotes.findOne(a.id, quote.id);
    expect(after).toEqual(before);
  });

  it("a job whose stored cost is invalid reads as costInvalid at 0, never as a placeholder price", async () => {
    const { a } = await env.tenants();
    const { job } = await buildCatalogAndJob(a.id);
    // The DTO refuses this on write; a row can still hold it from before that check.
    // Planted directly: 999,999,999.999 x 2,147,483,647 is past Number.MAX_SAFE_INTEGER.
    await env.prisma.jobComponent.updateMany({
      where: { jobId: job.id, kind: JobComponentKind.MATERIAL },
      data: { quantityPerUnit: "999999999.999", unitPriceCents: 2_147_483_647 },
    });

    const read = await env.svc.jobs.findOne(a.id, job.id);
    expect(read.costInvalid).toBe(true);
    expect(read.unitCostCents).toBe(0);
    // The list still loads, carrying the same verdict.
    const listed = (await env.svc.jobs.findAll(a.id)).find((j) => j.id === job.id);
    expect(listed).toMatchObject({ costInvalid: true, unitCostCents: 0 });

    // What reaches a line if a caller copies the price anyway: zero, never the Int32
    // ceiling. NOTE: the API does not REFUSE such a line — `jobId` is an unchecked
    // reference and the only gate is the web picker. Reported as a finding.
    const quote = await env.svc.quotes.create(a.id, createQuoteSchema.parse({ lineItems: [lineFromJob(read, 1)] }));
    expect(quote.lineItems[0]!.unitPriceCents).toBe(0);
    expect(quote.totalCents).toBe(0);
  });
});
}
