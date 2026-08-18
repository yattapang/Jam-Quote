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
} = {}) {
  const created: Record<string, unknown>[] = [];
  const subscriptionWrites: Record<string, unknown>[] = [];

  const tx = {
    subscriptionPayment: {
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

  it("retracts the term when nothing has happened since", async () => {
    // This is what makes "void and re-record" safe for a mis-keyed amount —
    // without it, re-recording would extend the term a second time.
    const { svc, tx } = build({ payment, subscription: { businessId: "biz-1", renewsAt: coversUntil } });
    await svc.void("sp-1", "admin-1");
    expect(tx.subscription.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { renewsAt: coversFrom } }),
    );
  });

  it("leaves the term alone when the dates have moved on", async () => {
    // A later payment or a staff edit. Silently rewinding someone else's
    // change would be worse than leaving a deliberate correction to a human.
    const later = new Date("2026-10-01T00:00:00.000Z");
    const { svc, tx } = build({ payment, subscription: { businessId: "biz-1", renewsAt: later } });
    await svc.void("sp-1", "admin-1");
    expect(tx.subscription.update).not.toHaveBeenCalled();
  });

  it("records whether the term was retracted — someone will need to explain it later", async () => {
    const { svc, audit } = build({ payment, subscription: { businessId: "biz-1", renewsAt: coversUntil } });
    await svc.void("sp-1", "admin-1");
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ details: expect.objectContaining({ termRetracted: true }) }),
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
