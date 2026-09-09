import { NotFoundException } from "@nestjs/common";
import { Prisma, QuoteDetailLevel, QuoteStatus } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { QuotesService } from "./quotes.service.js";

/**
 * `findByShareToken` end to end, through a fake Prisma.
 *
 * **Nothing called this method.** The disclosure guards read it as text, and the
 * contract check was exercised only against a hand-written literal — so the
 * function that now decides whether every share link in the platform returns a
 * document or a 500 had no test of its success path at all. An independent review
 * called that the highest risk in the fix, and it was right: fail-closed is only
 * safe if you know the closed case is the exceptional one.
 *
 * So this asserts a realistic payload PASSES, using the field types Prisma
 * actually hands back — `Prisma.Decimal` for the rates, `Date` for the timestamps,
 * `Decimal` for a line quantity. Those are the values `assertPublicShape`
 * serializes and validates, and getting any of them wrong in the contract would
 * take down every share link at once.
 */

function quoteRow(over: Record<string, unknown> = {}) {
  return {
    id: "qt_1",
    number: "Q-0007",
    status: QuoteStatus.SENT,
    validUntil: new Date("2026-10-01T00:00:00.000Z"),
    terms: "50% deposit before work begins",
    detailLevel: QuoteDetailLevel.SUMMARY,
    gctRate: new Prisma.Decimal("15.00"),
    discountPct: new Prisma.Decimal("0.00"),
    depositCents: 0,
    subtotalCents: 100_000,
    gctCents: 15_000,
    totalCents: 115_000,
    firstViewedAt: null,
    lineItems: [
      {
        id: "li_1",
        category: "MATERIAL",
        description: "Cement, 20 bags",
        // A Decimal, because quantity is a Decimal column. Serializes to "2.5",
        // which is why the contract types it as a string.
        quantity: new Prisma.Decimal("2.5"),
        rateUnit: "UNIT",
        unitLabel: null,
        unitPriceCents: 40_000,
        gctTreatment: "STANDARD",
      },
    ],
    sections: [
      {
        id: "sec_1",
        title: "Groundworks",
        lineItems: [
          {
            id: "li_2",
            category: "LABOUR",
            description: "Mason, blockwork",
            quantity: new Prisma.Decimal("3"),
            rateUnit: "DAY",
            unitLabel: "day",
            unitPriceCents: 800_000,
            gctTreatment: "EXEMPT",
          },
        ],
      },
    ],
    client: { firstName: "Marcia", lastName: "Brown" },
    business: {
      name: "Blackwood Construction",
      addressLine: "1 Hope Road",
      town: "Kingston",
      parish: "St Andrew",
      trn: "123-456-789",
    },
    ...over,
  };
}

function build(row: unknown) {
  const prisma = {
    quote: {
      findFirst: vi.fn().mockResolvedValue(row),
      update: vi.fn().mockResolvedValue({}),
    },
  };
  // prisma, businessService, pricingService — neither of the latter two is
  // reached on this path, which is worth knowing in itself: the anonymous read
  // touches no numbering and no plan gate.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const svc = new QuotesService(prisma as any, {} as any, {} as any);
  return { svc, prisma };
}

describe("findByShareToken — the anonymous read", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns a realistic quote, and the contract check does NOT reject it", async () => {
    // The happy path of the guard that now gates every share link. If the wire
    // contract and the real payload ever disagree — a new enum member, a column
    // widened to Decimal — this fails here rather than in front of a client.
    const { svc } = build(quoteRow());
    const view = await svc.findByShareToken("tok_1");

    expect(view.number).toBe("Q-0007");
    expect(view.clientName).toBe("Marcia Brown");
    expect(view.business.name).toBe("Blackwood Construction");
    expect(view.lineItems).toHaveLength(1);
    expect(view.sections[0]?.lineItems).toHaveLength(1);
  });

  it("carries the totals as integer cents, unchanged", async () => {
    const { svc } = build(quoteRow());
    const view = await svc.findByShareToken("tok_1");
    expect(view.subtotalCents).toBe(100_000);
    expect(view.gctCents).toBe(15_000);
    expect(view.totalCents).toBe(115_000);
  });

  it("advances SENT to VIEWED on a first read", async () => {
    const { svc, prisma } = build(quoteRow());
    await svc.findByShareToken("tok_1");
    const data = prisma.quote.update.mock.calls[0]?.[0].data;
    expect(data.status).toBe(QuoteStatus.VIEWED);
    expect(data.firstViewedAt).toBeInstanceOf(Date);
  });

  it("never drags an ACCEPTED quote backwards when the client reopens the link", async () => {
    const { svc, prisma } = build(quoteRow({ status: QuoteStatus.ACCEPTED }));
    await svc.findByShareToken("tok_1");
    expect(prisma.quote.update.mock.calls[0]?.[0].data.status).toBeUndefined();
  });

  it("records nothing on a second read", async () => {
    const { svc, prisma } = build(quoteRow({ firstViewedAt: new Date("2026-09-01T00:00:00.000Z") }));
    await svc.findByShareToken("tok_1");
    expect(prisma.quote.update).not.toHaveBeenCalled();
  });

  it("gives a DRAFT and an unknown token the SAME answer", async () => {
    // The response must not confirm which tokens are real.
    const draft = build(quoteRow({ status: QuoteStatus.DRAFT }));
    const unknown = build(null);
    await expect(draft.svc.findByShareToken("tok_1")).rejects.toThrow(NotFoundException);
    await expect(unknown.svc.findByShareToken("tok_x")).rejects.toThrow(NotFoundException);
    await expect(draft.svc.findByShareToken("tok_1")).rejects.toThrow("Quote not found");
    await expect(unknown.svc.findByShareToken("tok_x")).rejects.toThrow("Quote not found");
  });

  it("does not mark a quote VIEWED when the response is refused", async () => {
    // The write used to happen before the response was built and validated, so a
    // fail-closed 500 still marked the quote VIEWED for a client who saw nothing —
    // and firstViewedAt is meant to be evidence that a link landed.
    const { svc, prisma } = build(quoteRow({ totalCents: "115000" as unknown as number }));
    await expect(svc.findByShareToken("tok_1")).rejects.toThrow(/temporarily unavailable/);
    expect(prisma.quote.update).not.toHaveBeenCalled();
  });
});
