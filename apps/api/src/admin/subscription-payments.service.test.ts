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
  ledger?: { coversFrom: Date; interval: string; voidedAt: Date | null }[];
} = {}) {
  const created: Record<string, unknown>[] = [];
  const subscriptionWrites: Record<string, unknown>[] = [];

  const tx = {
    subscriptionPayment: {
      // The whole ledger the recompute reads — voided rows included, because
      // the ANCHOR comes from all payments while the duration comes only from
      // the ones that still stand.
      findMany: vi.fn().mockResolvedValue(opts.ledger ?? []),
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

  const MONTH = 31 * 86_400_000;

  it("returns paid-through to the start when the only payment is voided", async () => {
    const { svc, subscriptionWrites } = build({
      payment,
      subscription: { businessId: "biz-1", renewsAt: coversUntil },
      ledger: [{ coversFrom, interval: "monthly", voidedAt: new Date() }],
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
        { coversFrom, interval: "monthly", voidedAt: new Date() },
        { coversFrom: secondFrom, interval: "monthly", voidedAt: null },
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
      ledger: [{ coversFrom, interval: "monthly", voidedAt: new Date() }],
    });
    await svc.void("sp-1", "admin-1");
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ details: expect.objectContaining({ renewsAt: expect.any(String) }) }),
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
