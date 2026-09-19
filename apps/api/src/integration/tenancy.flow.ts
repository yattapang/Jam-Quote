/**
 * FLOW 4 — tenancy, over the real services and a real Postgres.
 *
 * Tenant A builds a full world (client, supplier, catalog items, a job, a project, a
 * quote, an invoice and a payment). Tenant B then tries every id it could get hold of
 * against every service method that takes one — to READ it, to REFERENCE it from its
 * own rows, and to MUTATE it — and each attempt must be refused with exactly the same
 * status AND message as the same call with a made-up id. Anything else tells B which
 * ids are real.
 *
 * Every refusal is followed by proof that A's rows did not move (a whole-table snapshot
 * of A's business before and after), so a method that writes first and throws second
 * is caught too.
 *
 * Limits: this drives the services, not HTTP. `@BusinessId()` resolution from the JWT
 * is covered by business-id.decorator.test.ts and tenant-auth.guard.test.ts, not here.
 */
import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { JobComponentKind, LineCategory, PaymentMethod, QuoteStatus, RateUnit } from "@jamquote/core";
import { createQuoteSchema } from "../quotes/quotes.dto.js";
import { createClientSchema } from "../clients/clients.dto.js";
import { createProjectSchema } from "../projects/projects.dto.js";
import { createJobSchema } from "../jobs/jobs.dto.js";
import { createInvoiceSchema } from "../invoices/invoices.dto.js";
import {
  createEquipmentItemSchema,
  createLabourRateSchema,
  createMaterialFavouriteSchema,
  createSupplierSchema,
} from "../catalogs/catalogs.dto.js";
import { failure, type Integration } from "./fixture.js";

let env: Integration;

const line = (extra: Record<string, unknown> = {}) => ({
  category: LineCategory.OTHER,
  description: "Works",
  quantity: 1,
  rateUnit: RateUnit.JOB,
  unitPriceCents: 100_000,
  ...extra,
});

async function buildWorld(businessId: string) {
  const { svc } = env;
  const client = await svc.clients.create(businessId, createClientSchema.parse({ firstName: "Ann", lastName: "Lee" }));
  const supplier = await svc.suppliers.create(businessId, createSupplierSchema.parse({ name: "A's hardware" }));
  const material = await svc.materials.create(
    businessId,
    createMaterialFavouriteSchema.parse({ name: "Sand", priceCents: 5_000, unit: "load", supplierId: supplier.id }),
  );
  const labour = await svc.labour.create(businessId, createLabourRateSchema.parse({ trade: "Carpenter", rateCents: 900_000 }));
  const equipment = await svc.equipment.create(businessId, createEquipmentItemSchema.parse({ name: "Truck", rateCents: 1_500_000 }));
  const job = await svc.jobs.create(
    businessId,
    createJobSchema.parse({
      name: "Pour",
      unit: "m3",
      components: [
        { kind: JobComponentKind.MATERIAL, materialFavouriteId: material.id, description: "Sand", quantityPerUnit: 1, unitPriceCents: 5_000 },
      ],
    }),
  );
  const project = await svc.projects.create(businessId, createProjectSchema.parse({ name: "A's job", clientId: client.id }));
  const quote = await svc.quotes.create(
    businessId,
    createQuoteSchema.parse({ clientId: client.id, projectId: project.id, lineItems: [line({ supplierId: supplier.id })] }),
  );
  const draftQuote = await svc.quotes.create(businessId, createQuoteSchema.parse({ lineItems: [line()] }));
  await svc.quotes.share(businessId, quote.id);
  await svc.quotes.updateStatus(businessId, quote.id, QuoteStatus.SENT);
  await svc.quotes.updateStatus(businessId, quote.id, QuoteStatus.ACCEPTED);
  const invoice = await svc.invoices.finalize(businessId, (await svc.invoices.convertFromQuote(businessId, quote.id)).id);
  const draftInvoice = await svc.invoices.create(
    businessId,
    createInvoiceSchema.parse({ clientId: client.id, lineItems: [line()] }),
  );
  await svc.payments.recordManualPayment({ businessId, invoiceId: invoice.id, amountCents: 10_000, method: PaymentMethod.CASH });
  const payment = (await svc.invoices.findOne(businessId, invoice.id)).payments[0]!;
  return { client, supplier, material, labour, equipment, job, project, quote, draftQuote, invoice, draftInvoice, payment };
}

/** Every row belonging to one business, for a before/after comparison. */
async function snapshotOf(businessId: string) {
  const p = env.prisma;
  const byBiz = { where: { businessId } };
  return {
    business: await p.business.findUnique({ where: { id: businessId } }),
    clients: await p.client.findMany(byBiz),
    suppliers: await p.supplier.findMany(byBiz),
    materials: await p.materialFavourite.findMany(byBiz),
    labour: await p.labourRate.findMany(byBiz),
    equipment: await p.equipmentItem.findMany(byBiz),
    jobs: await p.job.findMany({ ...byBiz, include: { components: true } }),
    projects: await p.project.findMany(byBiz),
    quotes: await p.quote.findMany({ ...byBiz, include: { lineItems: true, sections: true } }),
    invoices: await p.invoice.findMany({ ...byBiz, include: { lineItems: true, payments: true } }),
    hidden: await p.catalogHidden.findMany(byBiz),
  };
}


/** Registered by flows.integration.test.ts, which owns the one shared database. */
export function tenancyFlow(shared: () => Integration): void {
  beforeAll(() => {
    env = shared();
  });

describe("tenancy: B cannot read, reference or mutate A's rows", () => {
  it("every id-taking method refuses a foreign id exactly as it refuses a made-up one", async () => {
    const { svc } = env;
    const { a, b } = await env.tenants();
    const A = await buildWorld(a.id);
    const B = await buildWorld(b.id); // B's own rows, so references have something legitimate beside them
    const before = await snapshotOf(a.id);

    type Case = [name: string, foreignId: string, call: (id: string) => Promise<unknown>];
    const cases: Case[] = [
      // clients
      ["clients.findOne", A.client.id, (id) => svc.clients.findOne(b.id, id)],
      ["clients.update", A.client.id, (id) => svc.clients.update(b.id, id, { firstName: "Hacked" })],
      ["clients.remove", A.client.id, (id) => svc.clients.remove(b.id, id)],
      ["projects.create(clientId)", A.client.id, (id) => svc.projects.create(b.id, createProjectSchema.parse({ name: "x", clientId: id }))],
      ["quotes.create(clientId)", A.client.id, (id) => svc.quotes.create(b.id, createQuoteSchema.parse({ clientId: id, lineItems: [line()] }))],
      ["quotes.update(clientId)", A.client.id, (id) => svc.quotes.update(b.id, B.draftQuote.id, { clientId: id })],
      ["invoices.create(clientId)", A.client.id, (id) => svc.invoices.create(b.id, createInvoiceSchema.parse({ clientId: id, lineItems: [line()] }))],
      ["invoices.update(clientId)", A.client.id, (id) => svc.invoices.update(b.id, B.draftInvoice.id, { clientId: id })],
      // suppliers
      ["suppliers.findOne", A.supplier.id, (id) => svc.suppliers.findOne(b.id, id)],
      ["suppliers.update", A.supplier.id, (id) => svc.suppliers.update(b.id, id, { name: "Hacked" })],
      ["suppliers.remove", A.supplier.id, (id) => svc.suppliers.remove(b.id, id)],
      ["materials.create(supplierId)", A.supplier.id, (id) => svc.materials.create(b.id, createMaterialFavouriteSchema.parse({ name: "x", priceCents: 1, supplierId: id }))],
      ["quotes.create(line.supplierId)", A.supplier.id, (id) => svc.quotes.create(b.id, createQuoteSchema.parse({ lineItems: [line({ supplierId: id })] }))],
      ["invoices.create(line.supplierId)", A.supplier.id, (id) => svc.invoices.create(b.id, createInvoiceSchema.parse({ lineItems: [line({ supplierId: id })] }))],
      ["materialPrices.create(supplierId)", A.supplier.id, (id) => svc.materialPrices.create(b.id, { supplierId: id, materialFavouriteId: B.material.id, priceCents: 1 })],
      // catalog items
      ["materials.findOne", A.material.id, (id) => svc.materials.findOne(b.id, id)],
      ["materials.update", A.material.id, (id) => svc.materials.update(b.id, id, { priceCents: 1 })],
      ["materials.remove", A.material.id, (id) => svc.materials.remove(b.id, id)],
      ["materialPrices.findForMaterial", A.material.id, (id) => svc.materialPrices.findForMaterial(b.id, id)],
      ["materialPrices.create(materialId)", A.material.id, (id) => svc.materialPrices.create(b.id, { supplierId: B.supplier.id, materialFavouriteId: id, priceCents: 1 })],
      ["labour.findOne", A.labour.id, (id) => svc.labour.findOne(b.id, id)],
      ["labour.update", A.labour.id, (id) => svc.labour.update(b.id, id, { rateCents: 1 })],
      ["labour.remove", A.labour.id, (id) => svc.labour.remove(b.id, id)],
      ["equipment.findOne", A.equipment.id, (id) => svc.equipment.findOne(b.id, id)],
      ["equipment.update", A.equipment.id, (id) => svc.equipment.update(b.id, id, { rateCents: 1 })],
      ["equipment.remove", A.equipment.id, (id) => svc.equipment.remove(b.id, id)],
      ...(["materialFavouriteId", "labourRateId", "equipmentItemId"] as const).map(
        (key): Case => [
          `jobs.create(${key})`,
          key === "materialFavouriteId" ? A.material.id : key === "labourRateId" ? A.labour.id : A.equipment.id,
          (id) =>
            svc.jobs.create(
              b.id,
              createJobSchema.parse({
                name: "x",
                unit: "each",
                components: [
                  {
                    kind: key === "materialFavouriteId" ? "MATERIAL" : key === "labourRateId" ? "LABOUR" : "EQUIPMENT",
                    [key]: id,
                    description: "x",
                    quantityPerUnit: 1,
                    unitPriceCents: 1,
                  },
                ],
              }),
            ),
        ],
      ),
      // jobs
      ["jobs.findOne", A.job.id, (id) => svc.jobs.findOne(b.id, id)],
      ["jobs.update", A.job.id, (id) => svc.jobs.update(b.id, id, { name: "Hacked" })],
      ["jobs.remove", A.job.id, (id) => svc.jobs.remove(b.id, id)],
      // projects
      ["projects.findOne", A.project.id, (id) => svc.projects.findOne(b.id, id)],
      ["projects.update", A.project.id, (id) => svc.projects.update(b.id, id, { name: "Hacked" })],
      ["projects.remove", A.project.id, (id) => svc.projects.remove(b.id, id)],
      ["quotes.create(projectId)", A.project.id, (id) => svc.quotes.create(b.id, createQuoteSchema.parse({ projectId: id, lineItems: [line()] }))],
      ["quotes.update(projectId)", A.project.id, (id) => svc.quotes.update(b.id, B.draftQuote.id, { projectId: id })],
      // quotes
      ["quotes.findOne", A.quote.id, (id) => svc.quotes.findOne(b.id, id)],
      ["quotes.update", A.draftQuote.id, (id) => svc.quotes.update(b.id, id, { terms: "Hacked" })],
      ["quotes.updateStatus", A.draftQuote.id, (id) => svc.quotes.updateStatus(b.id, id, QuoteStatus.SENT)],
      ["quotes.share", A.draftQuote.id, (id) => svc.quotes.share(b.id, id)],
      ["quotes.unshare", A.quote.id, (id) => svc.quotes.unshare(b.id, id)],
      ["quotes.revise", A.quote.id, (id) => svc.quotes.revise(b.id, id)],
      ["quotes.createVariation", A.quote.id, (id) => svc.quotes.createVariation(b.id, id)],
      ["quotes.remove", A.draftQuote.id, (id) => svc.quotes.remove(b.id, id)],
      ["invoices.convertFromQuote", A.quote.id, (id) => svc.invoices.convertFromQuote(b.id, id)],
      // invoices
      ["invoices.findOne", A.invoice.id, (id) => svc.invoices.findOne(b.id, id)],
      ["invoices.update", A.draftInvoice.id, (id) => svc.invoices.update(b.id, id, { terms: "Hacked" })],
      ["invoices.finalize", A.draftInvoice.id, (id) => svc.invoices.finalize(b.id, id)],
      ["invoices.share", A.invoice.id, (id) => svc.invoices.share(b.id, id)],
      ["invoices.unshare", A.invoice.id, (id) => svc.invoices.unshare(b.id, id)],
      ["invoices.setRetentionReleased", A.invoice.id, (id) => svc.invoices.setRetentionReleased(b.id, id, true)],
      ["invoices.recordReminder", A.invoice.id, (id) => svc.invoices.recordReminder(b.id, id, "WHATSAPP")],
      ["invoices.remove", A.draftInvoice.id, (id) => svc.invoices.remove(b.id, id)],
      // payments
      ["payments.recordManualPayment", A.invoice.id, (id) => svc.payments.recordManualPayment({ businessId: b.id, invoiceId: id, amountCents: 1, method: PaymentMethod.CASH })],
      ["payments.startCardPayment", A.invoice.id, (id) => svc.payments.startCardPayment(b.id, id)],
      ["payments.voidPayment", A.payment.id, (id) => svc.payments.voidPayment(b.id, id)],
    ];

    const outcomes = [];
    for (const [name, foreignId, call] of cases) {
      const foreign = await failure(call(foreignId)).catch((e: Error) => ({ status: 0, message: `ACCEPTED: ${e.message}` }));
      const madeUp = await failure(call(randomUUID())).catch((e: Error) => ({ status: 0, message: `ACCEPTED: ${e.message}` }));
      outcomes.push({ name, foreign, madeUp });
    }
    // One assertion over the whole table so a failure names every leaking method at once.
    expect(outcomes.filter((o) => o.foreign.status !== 404 || JSON.stringify(o.foreign) !== JSON.stringify(o.madeUp))).toEqual([]);
    expect(outcomes.length).toBeGreaterThanOrEqual(55);

    // Nothing of A's moved.
    expect(await snapshotOf(a.id)).toEqual(before);

    // And B's lists never contain A's rows.
    const aIds = new Set(Object.values(A).map((r) => r.id));
    const lists = [
      await svc.clients.findAll(b.id),
      await svc.suppliers.findAll(b.id),
      await svc.labour.findAll(b.id, true),
      await svc.equipment.findAll(b.id, true),
      await svc.jobs.findAll(b.id),
      await svc.projects.findAll(b.id),
      await svc.quotes.findAll(b.id),
      await svc.invoices.findAll(b.id),
    ];
    expect(lists.every((l) => l.length > 0)).toBe(true);
    expect(lists.flat().filter((r) => aIds.has(r.id))).toEqual([]);
  });

  /**
   * KNOWN DEFECT D5 — a quote or invoice LINE's `jobId` is stored unchecked
   * (quotes.dto.ts calls it "a plain reference ... not validated/FK'd"). B can save a
   * line naming A's job, and the id is echoed back on B's own document and copied by
   * revise/convert. No A data is disclosed (the job snapshot fields are caller-typed),
   * but it is the one id-bearing field on these writes that is not tenant-checked, and
   * the server equally accepts a job whose stored cost is invalid (flow 1).
   */
  it.fails("KNOWN DEFECT D5: a quote line cannot reference another tenant's job", async () => {
    const { a, b } = await env.tenants();
    const A = await buildWorld(a.id);
    const foreign = await failure(
      env.svc.quotes.create(b.id, createQuoteSchema.parse({ lineItems: [line({ jobId: A.job.id, jobName: "x", jobUnit: "m3" })] })),
    );
    expect(foreign.status).toBe(404);
  });
});
}
