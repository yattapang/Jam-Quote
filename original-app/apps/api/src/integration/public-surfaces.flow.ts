/**
 * FLOW 6 — the public share-token surfaces (quote view, quote decision, quote logo,
 * invoice view, invoice logo), driven through the REAL public controllers over the
 * real services and a real Postgres.
 *
 * Invariants:
 * - a token exposes only ITS document and ITS business's logo — never a sibling
 *   document of the same business, never another business;
 * - a draft's token, an unknown token, a withdrawn token and a deleted document's
 *   token all give the same 404, status AND message, on every route;
 * - no row id, no markup, no supplier id reaches the anonymous response.
 */
import { randomBytes } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { LineCategory, QuoteStatus, RateUnit } from "@jamquote/core";
import type { Response } from "express";
import { createQuoteSchema, quoteDecisionSchema } from "../quotes/quotes.dto.js";
import { createInvoiceSchema } from "../invoices/invoices.dto.js";
import { createClientSchema } from "../clients/clients.dto.js";
import { createSupplierSchema } from "../catalogs/catalogs.dto.js";
import { failure, type Integration } from "./fixture.js";

let env: Integration;

function fakeRes() {
  const res = {
    headers: {} as Record<string, string>,
    body: undefined as Buffer | undefined,
    setHeader(k: string, v: string) {
      res.headers[k] = v;
    },
    end(buf: Buffer) {
      res.body = buf;
    },
  };
  return res;
}

async function logoVia(kind: "quote" | "invoice", token: string): Promise<string> {
  const res = fakeRes();
  const ctl = kind === "quote" ? env.svc.publicQuotes : env.svc.publicInvoices;
  await ctl.logo(token, res as unknown as Response);
  return res.body!.toString();
}

async function world(businessId: string, tag: string) {
  const { svc } = env;
  await svc.business.setLogo(businessId, { bytes: Buffer.from(`LOGO-${tag}`), contentType: "image/png", width: 1, height: 1 });
  const client = await svc.clients.create(businessId, createClientSchema.parse({ firstName: `Client${tag}` }));
  const supplier = await svc.suppliers.create(businessId, createSupplierSchema.parse({ name: `Supplier ${tag}` }));
  const mk = (description: string) =>
    svc.quotes.create(
      businessId,
      createQuoteSchema.parse({
        clientId: client.id,
        lineItems: [
          {
            category: LineCategory.MATERIAL,
            description,
            quantity: 2,
            rateUnit: RateUnit.UNIT,
            unitPriceCents: 10_000,
            markupPct: 33.3,
            supplierId: supplier.id,
          },
        ],
      }),
    );
  const sent = await mk(`sent-${tag}`);
  const sibling = await mk(`sibling-${tag}`);
  const draft = await mk(`draft-${tag}`);
  for (const q of [sent, sibling]) {
    await svc.quotes.share(businessId, q.id);
    await svc.quotes.updateStatus(businessId, q.id, QuoteStatus.SENT);
  }
  const draftToken = (await svc.quotes.share(businessId, draft.id)).shareToken; // share does not refuse a draft
  const sentToken = (await svc.quotes.findOne(businessId, sent.id)).shareToken!;
  const siblingToken = (await svc.quotes.findOne(businessId, sibling.id)).shareToken!;

  await svc.quotes.updateStatus(businessId, sent.id, QuoteStatus.ACCEPTED);
  const invoice = await svc.invoices.finalize(businessId, (await svc.invoices.convertFromQuote(businessId, sent.id)).id);
  const invoiceToken = (await svc.invoices.share(businessId, invoice.id)).shareToken;
  const draftInvoice = await svc.invoices.create(
    businessId,
    createInvoiceSchema.parse({ lineItems: [{ category: LineCategory.OTHER, description: "d", quantity: 1, rateUnit: RateUnit.JOB, unitPriceCents: 1 }] }),
  );
  // `share` refuses a draft invoice; plant a token the way a legacy row could hold one.
  const draftInvoiceToken = randomBytes(32).toString("base64url");
  await env.prisma.invoice.update({ where: { id: draftInvoice.id }, data: { shareToken: draftInvoiceToken } });

  return { client, supplier, sent, sibling, draft, invoice, draftInvoice, sentToken, siblingToken, draftToken, invoiceToken, draftInvoiceToken };
}


/** Registered by flows.integration.test.ts, which owns the one shared database. */
export function publicSurfacesFlow(shared: () => Integration): void {
  beforeAll(() => {
    env = shared();
  });

describe("public share-token surfaces", () => {
  it("each token exposes only its own document and its own business's logo", async () => {
    const { a, b } = await env.tenants();
    const A = await world(a.id, "A");
    const B = await world(b.id, "B");
    const { svc } = env;

    const view = await svc.publicQuotes.findByToken(A.sentToken);
    expect(view.number).toBe(A.sent.number);
    expect(view.lineItems.map((l) => l.description)).toEqual(["sent-A"]);
    expect(view.business.name).toBe(a.name);
    const sibling = await svc.publicQuotes.findByToken(A.siblingToken);
    expect(sibling.lineItems.map((l) => l.description)).toEqual(["sibling-A"]);

    const inv = await svc.publicInvoices.findByToken(A.invoiceToken);
    expect(inv.number).toBe(A.invoice.number);
    expect(inv.totalCents).toBe(A.invoice.totalCents);

    expect(await logoVia("quote", A.sentToken)).toBe("LOGO-A");
    expect(await logoVia("invoice", A.invoiceToken)).toBe("LOGO-A");
    expect(await logoVia("quote", B.sentToken)).toBe("LOGO-B");
    expect(await logoVia("invoice", B.invoiceToken)).toBe("LOGO-B");

    // Nothing internal reaches the anonymous response.
    const internalIds = [a.id, b.id, ...Object.values(A), ...Object.values(B)]
      .map((v) => (typeof v === "object" && v && "id" in v ? (v as { id: string }).id : typeof v === "string" && v.length === 36 ? v : null))
      .filter((v): v is string => v !== null);
    for (const dump of [JSON.stringify(view), JSON.stringify(sibling), JSON.stringify(inv)]) {
      for (const id of internalIds) expect(dump).not.toContain(id);
      expect(dump).not.toMatch(/markupPct|supplierId|unitPriceCents|33\.3/);
    }
  });

  it("a draft, unknown, withdrawn or deleted token gets the same 404 as a bad token on every route", async () => {
    const { a } = await env.tenants();
    const A = await world(a.id, "A2");
    const { svc } = env;

    // Withdrawn: unshare the sibling, keep its old token.
    await svc.quotes.unshare(a.id, A.sibling.id);
    // Deleted: a shared draft soft-deleted.
    const deleted = await svc.quotes.create(a.id, createQuoteSchema.parse({ lineItems: [] }));
    const deletedToken = (await svc.quotes.share(a.id, deleted.id)).shareToken;
    await svc.quotes.remove(a.id, deleted.id);

    const decide = (t: string) => svc.publicQuotes.decide(t, quoteDecisionSchema.parse({ decision: "ACCEPT", name: "X" }));
    const quoteRoutes = {
      view: (t: string) => svc.publicQuotes.findByToken(t),
      decide,
      logo: (t: string) => logoVia("quote", t),
    };
    const invoiceRoutes = {
      view: (t: string) => svc.publicInvoices.findByToken(t),
      logo: (t: string) => logoVia("invoice", t),
    };

    const bad = randomBytes(32).toString("base64url");
    for (const [route, call] of Object.entries(quoteRoutes)) {
      const reference = await failure(call(bad));
      expect(reference.status, `quote ${route}`).toBe(404);
      for (const token of [A.draftToken, A.siblingToken, deletedToken, "", "x"]) {
        expect(await failure(call(token)), `quote ${route} ${token.slice(0, 6)}`).toEqual(reference);
      }
    }
    for (const [route, call] of Object.entries(invoiceRoutes)) {
      const reference = await failure(call(bad));
      expect(reference.status, `invoice ${route}`).toBe(404);
      for (const token of [A.draftInvoiceToken, "", "x"]) {
        expect(await failure(call(token)), `invoice ${route}`).toEqual(reference);
      }
    }

    // And none of those refusals changed the draft (no VIEWED, no decision).
    const draftAfter = await svc.quotes.findOne(a.id, A.draft.id);
    expect([draftAfter.status, draftAfter.firstViewedAt, draftAfter.decidedAt]).toEqual([QuoteStatus.DRAFT, null, null]);
  });
});
}
