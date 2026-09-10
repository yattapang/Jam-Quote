import { describe, expect, it, vi } from "vitest";
import { BadRequestException, NotFoundException } from "@nestjs/common";
import { SubscriptionPaymentsService } from "./subscription-payments.service.js";

const PRICING = {
  freeQuotesPerMonth: 3,
  proMonthlyPriceCents: 200_000,
  proAnnualPriceCents: 2_000_000,
  currency: "JMD",
};

function build(opts: {
  business?: unknown;
  subscription?: unknown;
  payment?: unknown;
  /** Unvoided payments the recompute should see AFTER the operation. */
  /**
   * `paidAt` is part of the shape now: the recompute reads it because money
   * cannot buy a period that was already over when it arrived. Defaulted to
   * `coversFrom` — the ordinary case, where a term is paid for as it begins.
   */
  ledger?: {
    id?: string;
    paidAt?: Date;
    coversFrom: Date;
    coversUntil?: Date;
    interval: string;
    voidedAt: Date | null;
  }[];
} = {}) {
  const created: Record<string, unknown>[] = [];
  const subscriptionWrites: Record<string, unknown>[] = [];

  const tx = {
    subscriptionPayment: {
      // The whole ledger the recompute reads — voided rows included, because
      // the ANCHOR comes from all payments while the duration comes only from
      // the ones that still stand.
      findMany: vi.fn().mockResolvedValue(
        (opts.ledger ?? []).map((r) => ({ paidAt: r.coversFrom, ...r })),
      ),
      create: vi.fn().mockImplementation((args: { data: Record<string, unknown> }) => {
        created.push(args.data);
        return { id: "sp-1", ...args.data };
      }),
      update: vi.fn().mockImplementation((args: { data: Record<string, unknown> }) => ({
        id: "sp-1",
        ...args.data,
      })),
    },
    subscription: {
      upsert: vi.fn().mockImplementation((args: Record<string, unknown>) => {
        subscriptionWrites.push(args);
        return {};
      }),
      update: vi.fn().mockImplementation((args: Record<string, unknown>) => {
        subscriptionWrites.push(args);
        return {};
      }),
      updateMany: vi.fn().mockImplementation((args: Record<string, unknown>) => {
        subscriptionWrites.push(args);
        return {};
      }),
    },
  };

  const prisma = {
    business: {
      findUnique: vi.fn().mockResolvedValue(
        "business" in opts ? opts.business : { id: "biz-1", name: "Blackwood" },
      ),
    },
    subscription: { findUnique: vi.fn().mockResolvedValue(opts.subscription ?? null) },
    subscriptionPayment: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue(opts.payment ?? null),
    },
    $transaction: vi.fn().mockImplementation(async (fn: (t: unknown) => unknown) => fn(tx)),
  };
  const pricing = { get: vi.fn().mockResolvedValue(PRICING) };
  const audit = { record: vi.fn() };

  const svc = new SubscriptionPaymentsService(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    prisma as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    pricing as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    audit as any,
  );
  return { svc, prisma, tx, audit, created, subscriptionWrites };
}

describe("recording a payment advances the term", () => {
  it("charges the standard monthly price when no amount is given", async () => {
    const { svc, created } = build();
    await svc.record("biz-1", { method: "CASH" }, "admin-1");
    expect(created[0]!.amountCents).toBe(200_000);
  });

  it("charges the annual price on an annual term", async () => {
    const { svc, created } = build();
    await svc.record("biz-1", { method: "CASH", interval: "annual" }, "admin-1");
    expect(created[0]!.amountCents).toBe(2_000_000);
  });

  it("honours a negotiated price over the list price", async () => {
    const { svc, created } = build({
      subscription: { businessId: "biz-1", interval: "monthly", priceCents: 150_000, renewsAt: null },
    });
    await svc.record("biz-1", { method: "CASH" }, "admin-1");
    expect(created[0]!.amountCents).toBe(150_000);
  });

  it("does NOT let a short payment redefine the agreed rate", async () => {
    // The amount recorded is what arrived; the agreed price is untouched, so a
    // short payment stays visible as one.
    const { svc, created, subscriptionWrites } = build({
      subscription: { businessId: "biz-1", interval: "monthly", priceCents: 200_000, renewsAt: null },
    });
    await svc.record("biz-1", { method: "CASH", amountCents: 50_000 }, "admin-1");
    expect(created[0]!.amountCents).toBe(50_000);
    expect(JSON.stringify(subscriptionWrites)).not.toContain('"priceCents":50000');
  });

  it("upgrades a free tenant — the payment IS the upgrade", async () => {
    const { svc, subscriptionWrites } = build({
      subscription: { businessId: "biz-1", plan: "free", interval: "monthly", renewsAt: null },
    });
    await svc.record("biz-1", { method: "CASH" }, "admin-1");
    expect(JSON.stringify(subscriptionWrites)).toContain('"plan":"pro"');
  });

  it("extends from the EXISTING renewal when paying early, so no days are lost", async () => {
    const future = new Date(Date.now() + 10 * 86_400_000);
    const { svc, created } = build({
      subscription: { businessId: "biz-1", interval: "monthly", renewsAt: future, priceCents: null },
    });
    await svc.record("biz-1", { method: "CASH" }, "admin-1");
    // The new term starts where the old one ended, not today.
    expect((created[0]!.coversFrom as Date).getTime()).toBe(future.getTime());
  });

  it("starts from today when the term has already lapsed", async () => {
    // They should not be billed for the month they spent lapsed.
    const past = new Date(Date.now() - 40 * 86_400_000);
    const { svc, created } = build({
      subscription: { businessId: "biz-1", interval: "monthly", renewsAt: past, priceCents: null },
    });
    await svc.record("biz-1", { method: "CASH" }, "admin-1");
    expect((created[0]!.coversFrom as Date).getTime()).toBeGreaterThan(past.getTime());
  });

  it("refuses a business that does not exist", async () => {
    const { svc } = build({ business: null });
    await expect(svc.record("nope", { method: "CASH" }, "a")).rejects.toBeInstanceOf(NotFoundException);
  });

  it("audits the amount and the term it bought", async () => {
    const { svc, audit } = build();
    await svc.record("biz-1", { method: "BANK_TRANSFER" }, "admin-9");
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ actorUserId: "admin-9", action: "subscription.payment.record" }),
    );
  });
});

describe("voiding a payment", () => {
  const coversFrom = new Date("2026-08-01T00:00:00.000Z");
  const coversUntil = new Date("2026-09-01T00:00:00.000Z");
  const payment = { id: "sp-1", businessId: "biz-1", amountCents: 200_000, coversFrom, coversUntil, voidedAt: null };


  it("returns paid-through to the start when the only payment is voided", async () => {
    const { svc, subscriptionWrites } = build({
      payment,
      subscription: { businessId: "biz-1", renewsAt: coversUntil },
      ledger: [{ id: "sp-1", coversFrom, coversUntil, interval: "monthly", voidedAt: new Date() }],
    });
    await svc.void("sp-1", "admin-1");
    expect(JSON.stringify(subscriptionWrites)).toContain(coversFrom.toISOString());
  });

  it("voiding the FIRST of two consecutive months shortens the term by one", async () => {
    // The reported bug. Two months bought back to back: 01 Aug -> 01 Sep and
    // 01 Sep -> 01 Oct. Voiding the first must leave ONE month of cover from
    // where the run began — 01 Sep — not the second payment's untouched
    // 01 Oct end date, which is what anchoring to the survivor would give.
    const secondFrom = coversUntil;
    const secondUntil = new Date("2026-10-01T00:00:00.000Z");
    const { svc, subscriptionWrites } = build({
      payment,
      subscription: { businessId: "biz-1", renewsAt: secondUntil },
      ledger: [
        { id: "sp-1", coversFrom, coversUntil, interval: "monthly", voidedAt: new Date() },
        { id: "sp-2", coversFrom: secondFrom, coversUntil: secondUntil, interval: "monthly", voidedAt: null },
      ],
    });

    await svc.void("sp-1", "admin-1");

    const written = JSON.stringify(subscriptionWrites);
    expect(written).toContain(coversUntil.toISOString());
    expect(written).not.toContain(secondUntil.toISOString());
  });

  it("records what the term became, not merely that it moved", async () => {
    const { svc, audit } = build({
      payment,
      subscription: { businessId: "biz-1", renewsAt: coversUntil },
      ledger: [{ id: "sp-1", coversFrom, coversUntil, interval: "monthly", voidedAt: new Date() }],
    });
    await svc.void("sp-1", "admin-1");
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ details: expect.objectContaining({ renewsAt: expect.any(String) }) }),
    );
  });

  it("moves the surviving payment onto the outstanding period", async () => {
    // The client paid for one month. After voiding the first of two, that
    // money should cover the EARLIEST unpaid month — otherwise the ledger row
    // claims a period nothing paid for, while the subscription says something
    // different.
    const secondFrom = coversUntil;
    const secondUntil = new Date("2026-10-01T00:00:00.000Z");
    const { svc, tx } = build({
      payment,
      subscription: { businessId: "biz-1", renewsAt: secondUntil },
      ledger: [
        { id: "sp-1", coversFrom, coversUntil, interval: "monthly", voidedAt: new Date() },
        { id: "sp-2", coversFrom: secondFrom, coversUntil: secondUntil, interval: "monthly", voidedAt: null },
      ],
    });

    await svc.void("sp-1", "admin-1");

    // sp-2 is rewritten from the run's start, not left where it was.
    expect(tx.subscriptionPayment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "sp-2" },
        data: { coversFrom, coversUntil },
      }),
    );
  });

  it("refuses to void twice", async () => {
    const { svc } = build({ payment: { ...payment, voidedAt: new Date() } });
    await expect(svc.void("sp-1", "a")).rejects.toBeInstanceOf(BadRequestException);
  });

  it("refuses a payment that does not exist", async () => {
    const { svc } = build({ payment: null });
    await expect(svc.void("nope", "a")).rejects.toBeInstanceOf(NotFoundException);
  });
});


/**
 * Paying after a lapse restores the tenant — it does not revert them the same day.
 *
 * `reallocateTerms` chains every surviving payment from the earliest `coversFrom`,
 * which is right for consecutive renewals and wrong across a gap. A tenant who paid
 * in January, lapsed, and paid again in August had that August payment rewritten
 * back into the gap: `renewsAt` came out as March — five months in the PAST. So the
 * tenant read PAST_DUE the moment they paid, the next sweep reverted them to free
 * and emailed them about it, and recovering from one lapse took as many payments as
 * months missed.
 *
 * The rule that fixes it without breaking void re-anchoring: a term may START
 * before the payment date but may not END before it. Voiding leaves a survivor a
 * term ending exactly at its own payment date, which is allowed; a six-month-old
 * gap ends long before, which is not.
 *
 * The old ledger fixtures had no `paidAt` at all, which is why nothing here could
 * tell the two cases apart.
 */
describe("recording a payment after a lapse", () => {
  const JAN = new Date("2026-01-01T00:00:00.000Z");
  const FEB = new Date("2026-02-01T00:00:00.000Z");
  const AUG = new Date("2026-08-01T00:00:00.000Z");
  const SEP = new Date("2026-09-01T00:00:00.000Z");

  it("does not rewrite the new payment back into the gap", async () => {
    const { svc, subscriptionWrites } = build({
      subscription: { businessId: "biz-1", renewsAt: FEB },
      ledger: [
        // Paid in January, covered January, then lapsed.
        { id: "sp-1", paidAt: JAN, coversFrom: JAN, coversUntil: FEB, interval: "monthly", voidedAt: null },
        // Paid in August, seven months later.
        { id: "sp-2", paidAt: AUG, coversFrom: AUG, coversUntil: SEP, interval: "monthly", voidedAt: null },
      ],
    });

    await svc.record("biz-1", { method: "CASH" }, "admin-1");

    const written = JSON.stringify(subscriptionWrites);
    // September — a month of cover from when the money arrived.
    expect(written).toContain(SEP.toISOString());
    // NOT March, which is what chaining from January produced.
    expect(written).not.toContain("2026-03-01");
  });

  it("leaves renewsAt in the FUTURE, so the sweep does not revert them", async () => {
    // The consequence that made this urgent rather than untidy. A renewsAt in the
    // past reads as PAST_DUE immediately and the next sweep reverts the plan.
    const { svc, subscriptionWrites } = build({
      subscription: { businessId: "biz-1", renewsAt: FEB },
      ledger: [
        { id: "sp-1", paidAt: JAN, coversFrom: JAN, coversUntil: FEB, interval: "monthly", voidedAt: null },
        { id: "sp-2", paidAt: AUG, coversFrom: AUG, coversUntil: SEP, interval: "monthly", voidedAt: null },
      ],
    });

    await svc.record("biz-1", { method: "CASH" }, "admin-1");

    const renewsAt = subscriptionWrites
      .map((w) => JSON.stringify(w))
      .join(" ")
      .match(/2026-\d\d-\d\d/g);
    expect(renewsAt, "a renewsAt should have been written").not.toBeNull();
    for (const d of renewsAt!) expect(new Date(d).getTime()).toBeGreaterThan(AUG.getTime());
  });

  it("still chains two CONSECUTIVE months contiguously", async () => {
    // The behaviour that must survive: paying early, before cover runs out, extends
    // from the existing end rather than from the payment date.
    const { svc, subscriptionWrites } = build({
      subscription: { businessId: "biz-1", renewsAt: FEB },
      ledger: [
        { id: "sp-1", paidAt: JAN, coversFrom: JAN, coversUntil: FEB, interval: "monthly", voidedAt: null },
        // Paid mid-January for the February month — early, so no gap.
        {
          id: "sp-2",
          paidAt: new Date("2026-01-20T00:00:00.000Z"),
          coversFrom: FEB,
          coversUntil: new Date("2026-03-01T00:00:00.000Z"),
          interval: "monthly",
          voidedAt: null,
        },
      ],
    });

    await svc.record("biz-1", { method: "CASH" }, "admin-1");

    // The property, not a literal date. An earlier version of this asserted
    // "2026-03-01" and failed on 2026-03-04, because `nextTermEnd` advances by
    // calendar month from a base that February makes 31 days long — arithmetic
    // this test has no business encoding.
    //
    // What matters is that cover was EXTENDED from the existing term end rather
    // than restarted at the payment date: chaining from 1 Feb lands in March,
    // while restarting from the 20 Jan payment would land in February.
    const written = JSON.stringify(subscriptionWrites);
    const renewsAt = new Date(written.match(/"renewsAt":"([^"]+)"/)![1]!);
    expect(renewsAt.getTime()).toBeGreaterThan(FEB.getTime());
    expect(renewsAt.getUTCMonth()).toBe(2); // March
  });
});
