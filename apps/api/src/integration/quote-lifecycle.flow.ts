/**
 * FLOW 2 — the quote lifecycle across quotes, the public share link, projects and
 * invoices, over the real services and a real Postgres.
 *
 * DRAFT -> share -> SENT -> client views and accepts through the PUBLIC controller ->
 * project created -> converted to an invoice -> finalized. Then revise.
 *
 * The invariants are the links between sections: what the client agreed to is what
 * gets invoiced (totals, GCT and every line field), the GCT rate is fixed at creation
 * by the business's registration and never re-derived, a quote converts once, and a
 * supplier id travelling onward through revise or convert is re-checked rather than
 * trusted because it was already on a document.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { GctTreatment, InvoiceStatus, LineCategory, ProjectStage, QuoteStatus, RateUnit } from "@jamquote/core";
import { createQuoteSchema, quoteDecisionSchema } from "../quotes/quotes.dto.js";
import { createClientSchema } from "../clients/clients.dto.js";
import { createSupplierSchema } from "../catalogs/catalogs.dto.js";
import { failure, type Integration } from "./fixture.js";

let env: Integration;

/** The line fields that must survive quote -> invoice and quote -> revision unchanged. */
const SNAPSHOT_FIELDS = [
  "category",
  "description",
  "quantity",
  "rateUnit",
  "unitLabel",
  "unitPriceCents",
  "priceSource",
  "supplierId",
  "gctTreatment",
  "markupPct",
  "overrideNote",
  "jobId",
  "jobName",
  "jobUnit",
  "jobComponents",
  "sort",
] as const;

type AnyLine = Record<(typeof SNAPSHOT_FIELDS)[number], unknown>;
type WithLines = { lineItems: AnyLine[]; sections: { title: string; lineItems: AnyLine[] }[] };

function snapshot(doc: WithLines) {
  const pick = (l: AnyLine) =>
    Object.fromEntries(SNAPSHOT_FIELDS.map((f) => [f, l[f] === null || l[f] === undefined ? null : String(JSON.stringify(l[f]))]));
  return {
    loose: doc.lineItems.map(pick),
    sections: doc.sections.map((s) => ({ title: s.title, lines: s.lineItems.map(pick) })),
  };
}

async function draftQuote(businessId: string) {
  const { svc } = env;
  const client = await svc.clients.create(
    businessId,
    createClientSchema.parse({ firstName: "Marcia", lastName: "Brown", email: "marcia@example.test" }),
  );
  const supplier = await svc.suppliers.create(businessId, createSupplierSchema.parse({ name: "Rapid True Value" }));
  const quote = await svc.quotes.create(
    businessId,
    createQuoteSchema.parse({
      clientId: client.id,
      discountPct: 5,
      depositCents: 50_000,
      terms: "50% deposit",
      lineItems: [
        {
          category: LineCategory.MATERIAL,
          description: "Steel 1/2in",
          quantity: 37.5,
          rateUnit: RateUnit.UNIT,
          unitLabel: "length",
          unitPriceCents: 212_345,
          supplierId: supplier.id,
          markupPct: 12.5,
        },
        {
          category: LineCategory.LABOUR,
          description: "Steel fixer",
          quantity: 3,
          rateUnit: RateUnit.DAY,
          unitPriceCents: 950_000,
          gctTreatment: GctTreatment.EXEMPT,
        },
      ],
      sections: [
        {
          title: "Roof",
          lineItems: [
            {
              category: LineCategory.OTHER,
              description: "Zinc sheets",
              quantity: 0.333,
              rateUnit: RateUnit.UNIT,
              unitPriceCents: 1_000_001,
              gctTreatment: GctTreatment.ZERO_RATED,
            },
          ],
        },
      ],
    }),
  );
  return { client, supplier, quote };
}


/** Registered by flows.integration.test.ts, which owns the one shared database. */
export function quoteLifecycleFlow(shared: () => Integration): void {
  beforeAll(() => {
    env = shared();
  });

describe("quote lifecycle", () => {
  it("DRAFT -> sent -> viewed -> accepted publicly -> project -> invoice, carrying everything exactly", async () => {
    const { svc } = env;
    const { a } = await env.tenants();
    const { client, quote } = await draftQuote(a.id);
    expect(quote.status).toBe(QuoteStatus.DRAFT);
    expect(Number(quote.gctRate)).toBe(15); // A is registered at 15%

    const { shareToken } = await svc.quotes.share(a.id, quote.id);
    await svc.quotes.updateStatus(a.id, quote.id, QuoteStatus.SENT);

    const view = await svc.publicQuotes.findByToken(shareToken);
    expect(view.totalCents).toBe(quote.totalCents);
    expect((await svc.quotes.findOne(a.id, quote.id)).status).toBe(QuoteStatus.VIEWED);

    const decided = await svc.publicQuotes.decide(
      shareToken,
      quoteDecisionSchema.parse({ decision: "ACCEPT", name: "  Marcia Brown " }),
    );
    expect(decided).toEqual({ status: QuoteStatus.ACCEPTED });

    const accepted = await svc.quotes.findOne(a.id, quote.id);
    expect(accepted.decidedByName).toBe("Marcia Brown");
    expect(accepted.projectId).not.toBeNull();
    const project = await svc.projects.findOne(a.id, accepted.projectId!);
    expect(project).toMatchObject({ stage: ProjectStage.WON, clientId: client.id, name: `Quote ${quote.number}` });

    const invoice = await svc.invoices.convertFromQuote(a.id, quote.id);
    expect(invoice).toMatchObject({
      status: InvoiceStatus.DRAFT,
      quoteId: quote.id,
      clientId: client.id,
      projectId: accepted.projectId,
      subtotalCents: quote.subtotalCents,
      gctCents: quote.gctCents,
      totalCents: quote.totalCents,
      depositCents: quote.depositCents,
      terms: quote.terms,
      detailLevel: quote.detailLevel,
    });
    expect(invoice.gctRate.toString()).toBe(quote.gctRate.toString());
    expect(invoice.discountPct.toString()).toBe(quote.discountPct.toString());
    expect(snapshot(invoice as unknown as WithLines)).toEqual(snapshot(quote as unknown as WithLines));

    const finalized = await svc.invoices.finalize(a.id, invoice.id);
    expect(finalized.status).toBe(InvoiceStatus.INVOICED);
    expect(finalized.totalCents).toBe(quote.totalCents);
    expect((await svc.quotes.findOne(a.id, quote.id)).status).toBe(QuoteStatus.INVOICED);
  });

  it("GCT follows registration at creation and never changes afterwards", async () => {
    const { svc } = env;
    const { a, b } = await env.tenants();
    const { quote: qa } = await draftQuote(a.id);
    const { quote: qb } = await draftQuote(b.id);
    expect(Number(qa.gctRate)).toBe(15);
    expect(Number(qb.gctRate)).toBe(0); // B is not registered
    expect(qb.gctCents).toBe(0);

    // Registration flips both ways.
    await svc.business.update(a.id, { gctRegistered: false });
    await svc.business.update(b.id, { gctRegistered: true });

    // Existing documents keep their rate through an edit that does not name one...
    const editedA = await svc.quotes.update(a.id, qa.id, { terms: "edited" });
    const editedB = await svc.quotes.update(b.id, qb.id, { terms: "edited" });
    expect([Number(editedA.gctRate), editedA.gctCents]).toEqual([15, qa.gctCents]);
    expect([Number(editedB.gctRate), editedB.gctCents]).toEqual([0, 0]);

    // ...and through acceptance and conversion.
    await svc.quotes.updateStatus(a.id, qa.id, QuoteStatus.SENT);
    await svc.quotes.updateStatus(a.id, qa.id, QuoteStatus.ACCEPTED);
    const inv = await svc.invoices.convertFromQuote(a.id, qa.id);
    expect([Number(inv.gctRate), inv.gctCents]).toEqual([15, qa.gctCents]);

    // New documents take the NEW state.
    const { quote: qa2 } = await draftQuote(a.id);
    const { quote: qb2 } = await draftQuote(b.id);
    expect(Number(qa2.gctRate)).toBe(0);
    expect(Number(qb2.gctRate)).toBe(15);
  });

  it("refuses a second convert", async () => {
    const { svc } = env;
    const { a } = await env.tenants();
    const { quote } = await draftQuote(a.id);
    await svc.quotes.updateStatus(a.id, quote.id, QuoteStatus.SENT);
    await svc.quotes.updateStatus(a.id, quote.id, QuoteStatus.ACCEPTED);

    await svc.invoices.convertFromQuote(a.id, quote.id);
    const again = await failure(svc.invoices.convertFromQuote(a.id, quote.id));
    expect(again.status).toBe(400);
    expect(await env.prisma.invoice.count({ where: { quoteId: quote.id } })).toBe(1);
  });

  /**
   * FIXED D1 — invoices.service.ts `convertFromQuote` checks "already converted" with a
   * read outside its transaction, so two converts in flight (a double-click, a retry, an
   * offline replay, two devices) could both pass the check before either committed.
   * `Invoice.quoteId` is now `@unique` (migration 20260919204301_invoice_quote_id_unique),
   * and the loser's unique-violation is caught and turned back into the same
   * "already converted to invoice N" BadRequestException the winning race's pre-check
   * gives, rather than a raw 500. Reproduced here on a single-connection pool: no
   * parallel database access is needed, only two calls left unawaited before the first
   * insert.
   */
  it("CONCURRENT converts of one quote produce one invoice", async () => {
    const { svc } = env;
    const { a } = await env.tenants();
    const { quote } = await draftQuote(a.id);
    await svc.quotes.updateStatus(a.id, quote.id, QuoteStatus.SENT);
    await svc.quotes.updateStatus(a.id, quote.id, QuoteStatus.ACCEPTED);

    const results = await Promise.allSettled([
      svc.invoices.convertFromQuote(a.id, quote.id),
      svc.invoices.convertFromQuote(a.id, quote.id),
    ]);
    const invoices = await env.prisma.invoice.findMany({ where: { quoteId: quote.id }, select: { number: true } });
    expect({ fulfilled: results.filter((r) => r.status === "fulfilled").length, invoices: invoices.length }).toEqual({
      fulfilled: 1,
      invoices: 1,
    });

    // The loser gets the SAME clear message the pre-check gives a second convert
    // outside a race (see "refuses a second convert" above) — never a raw 500 from
    // the unique-constraint violation underneath it.
    const rejected = results.find((r) => r.status === "rejected");
    expect(rejected).toBeDefined();
    const reason = (rejected as PromiseRejectedResult).reason as { getStatus?: () => number; message: string };
    expect(reason.getStatus?.()).toBe(400);
    expect(reason.message).toBe(`Quote has already been converted to invoice ${invoices[0]!.number}`);
  });

  /**
   * The other half of D1's fix. A unique index counts SOFT-DELETED rows, while
   * `convertFromQuote`'s pre-check filters `deletedAt: null` — so attaching the quote to
   * a deleted draft would make that quote permanently unconvertible: the check says go,
   * the constraint says no, and the contractor is told the quote was "already converted"
   * to an invoice they cannot see. `remove()` therefore detaches `quoteId` as it deletes.
   */
  it("a quote whose only invoice was deleted can be converted again", async () => {
    const { svc } = env;
    const { a } = await env.tenants();
    const { quote } = await draftQuote(a.id);
    await svc.quotes.updateStatus(a.id, quote.id, QuoteStatus.SENT);
    await svc.quotes.updateStatus(a.id, quote.id, QuoteStatus.ACCEPTED);

    const first = await svc.invoices.convertFromQuote(a.id, quote.id);
    await svc.invoices.remove(a.id, first.id);

    const second = await svc.invoices.convertFromQuote(a.id, quote.id);
    expect(second.id).not.toBe(first.id);
    // Exactly one LIVE invoice carries the quote; the deleted one no longer claims it.
    const live = await env.prisma.invoice.findMany({ where: { quoteId: quote.id } });
    expect(live.map((i) => i.id)).toEqual([second.id]);
  });

  it("revise copies every line, and supplier ids are re-checked on revise and convert", async () => {
    const { svc } = env;
    const { a, b } = await env.tenants();
    const { quote, supplier } = await draftQuote(a.id);
    await svc.quotes.updateStatus(a.id, quote.id, QuoteStatus.SENT);

    const revision = await svc.quotes.revise(a.id, quote.id);
    expect(revision).toMatchObject({
      status: QuoteStatus.DRAFT,
      number: quote.number,
      version: 2,
      parentQuoteId: quote.id,
      subtotalCents: quote.subtotalCents,
      gctCents: quote.gctCents,
      totalCents: quote.totalCents,
    });
    expect(snapshot(revision as unknown as WithLines)).toEqual(snapshot(quote as unknown as WithLines));

    // A soft-deleted supplier of this business is grandfathered: revise still works.
    await svc.suppliers.remove(a.id, supplier.id);
    await expect(svc.quotes.revise(a.id, quote.id)).resolves.toMatchObject({ version: 3 });

    // A FOREIGN supplier id on a stored line (a legacy row) must not travel onward.
    const foreign = await svc.suppliers.create(b.id, createSupplierSchema.parse({ name: "B's supplier" }));
    await env.prisma.quoteLineItem.updateMany({
      where: { quoteId: quote.id, supplierId: supplier.id },
      data: { supplierId: foreign.id },
    });
    const quotesBefore = await env.prisma.quote.count({ where: { businessId: a.id } });
    expect((await failure(svc.quotes.revise(a.id, quote.id))).status).toBe(404);
    expect(await env.prisma.quote.count({ where: { businessId: a.id } })).toBe(quotesBefore);

    await svc.quotes.updateStatus(a.id, quote.id, QuoteStatus.ACCEPTED);
    expect((await failure(svc.invoices.convertFromQuote(a.id, quote.id))).status).toBe(404);
    expect(await env.prisma.invoice.count({ where: { quoteId: quote.id } })).toBe(0);
  });
});
}
