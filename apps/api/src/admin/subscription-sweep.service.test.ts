import { describe, expect, it, vi } from "vitest";
import { SubscriptionSweepService } from "./subscription-sweep.service.js";

const PRICING = {
  freeQuotesPerMonth: 3,
  proMonthlyPriceCents: 200_000,
  proAnnualPriceCents: 2_000_000,
  currency: "JMD",
};

const NOW = new Date("2026-08-18T12:00:00.000Z");
const inDays = (n: number) => new Date(NOW.getTime() + n * 86_400_000);

function build(opts: {
  businesses?: unknown[];
  alreadySent?: { kind: string }[];
  /** Make the notice INSERT fail, as a unique-constraint clash would. */
  noticeInsertFails?: boolean;
  mailFails?: boolean;
} = {}) {
  const noticeCreates: Record<string, unknown>[] = [];
  const subscriptionUpdates: Record<string, unknown>[] = [];
  const sweepRuns: Record<string, unknown>[] = [];

  const prisma = {
    business: { findMany: vi.fn().mockResolvedValue(opts.businesses ?? []) },
    subscriptionNotice: {
      findMany: vi.fn().mockResolvedValue(opts.alreadySent ?? []),
      create: vi.fn().mockImplementation((args: { data: Record<string, unknown> }) => {
        if (opts.noticeInsertFails) throw new Error("unique violation");
        noticeCreates.push(args.data);
        return args.data;
      }),
    },
    subscription: {
      update: vi.fn().mockImplementation((args: Record<string, unknown>) => {
        subscriptionUpdates.push(args);
        return {};
      }),
    },
    subscriptionSweepRun: {
      create: vi.fn().mockImplementation((args: { data: Record<string, unknown> }) => {
        sweepRuns.push(args.data);
        return args.data;
      }),
      findMany: vi.fn().mockResolvedValue([]),
    },
  };
  const pricing = { get: vi.fn().mockResolvedValue(PRICING) };
  const mailer = { send: vi.fn().mockResolvedValue(!opts.mailFails) };

  const svc = new SubscriptionSweepService(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    prisma as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    pricing as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mailer as any,
  );
  return { svc, prisma, mailer, noticeCreates, subscriptionUpdates, sweepRuns };
}

const tenant = (renewsAt: Date, over: Record<string, unknown> = {}) => ({
  id: "biz-1",
  name: "Blackwood",
  billingContactEmail: "bills@blackwood.jm",
  users: [{ email: "owner@blackwood.jm" }],
  subscription: { plan: "pro", interval: "monthly", priceCents: null, renewsAt },
  ...over,
});

describe("the sweep sends reminders", () => {
  it("sends the 14-day notice and records it against the term", async () => {
    const { svc, mailer, noticeCreates } = build({ businesses: [tenant(inDays(14))] });
    const result = await svc.run("manual", NOW);

    expect(result.noticesSent).toBe(1);
    expect(mailer.send).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "RENEWAL_14", to: "bills@blackwood.jm" }),
    );
    // periodEnd scopes the notice to THIS term, so the same kind can go again
    // next term.
    expect(noticeCreates[0]).toMatchObject({ kind: "RENEWAL_14", periodEnd: inDays(14) });
  });

  it("sends nothing when the renewal is far off", async () => {
    const { svc, mailer } = build({ businesses: [tenant(inDays(60))] });
    expect((await svc.run("manual", NOW)).noticesSent).toBe(0);
    expect(mailer.send).not.toHaveBeenCalled();
  });

  it("falls back to the owner when no billing contact is set", async () => {
    // Without this a reminder goes nowhere and looks delivered.
    const { svc, mailer } = build({
      businesses: [tenant(inDays(3), { billingContactEmail: null })],
    });
    await svc.run("manual", NOW);
    expect(mailer.send).toHaveBeenCalledWith(
      expect.objectContaining({ to: "owner@blackwood.jm" }),
    );
  });

  it("counts a tenant with no reachable address as a failure, not a send", async () => {
    const { svc, mailer } = build({
      businesses: [tenant(inDays(3), { billingContactEmail: null, users: [] })],
    });
    const result = await svc.run("manual", NOW);
    expect(mailer.send).not.toHaveBeenCalled();
    expect(result).toMatchObject({ noticesSent: 0, failures: 1 });
  });

  it("does not repeat a notice already recorded for this term", async () => {
    const { svc, mailer } = build({
      businesses: [tenant(inDays(14))],
      alreadySent: [{ kind: "RENEWAL_14" }],
    });
    await svc.run("manual", NOW);
    expect(mailer.send).not.toHaveBeenCalled();
  });

  it("claims the notice BEFORE sending, so a lost write cannot double-send", async () => {
    // A clash means another run owns it. That is a no-op, not a failure —
    // counting it as one would make a healthy second sweep look broken.
    const { svc, mailer } = build({
      businesses: [tenant(inDays(14))],
      noticeInsertFails: true,
    });
    const result = await svc.run("manual", NOW);
    expect(mailer.send).not.toHaveBeenCalled();
    expect(result).toMatchObject({ noticesSent: 0, failures: 0 });
  });

  it("reports a bounced send as a failure", async () => {
    const { svc } = build({ businesses: [tenant(inDays(3))], mailFails: true });
    expect((await svc.run("manual", NOW)).failures).toBe(1);
  });
});

describe("the sweep reverts a lapsed term", () => {
  it("sets the plan to free and NOTHING else", async () => {
    // Non-payment is not misconduct. Business.deletedAt — suspension — must be
    // untouched: the tenant keeps every record, and invoicing and payment
    // collection keep working at the free quota.
    const { svc, subscriptionUpdates } = build({ businesses: [tenant(inDays(-1))] });
    const result = await svc.run("manual", NOW);

    expect(result.reverted).toBe(1);
    expect(subscriptionUpdates[0]).toEqual({
      where: { businessId: "biz-1" },
      data: { plan: "free" },
    });
    expect(JSON.stringify(subscriptionUpdates)).not.toContain("deletedAt");
  });

  it("sends REVERTED, which is decided before the plan drops", async () => {
    // Order matters: once the plan reads "free" dueNotices correctly returns
    // nothing, so computing after the revert would never send this at all.
    const { svc, mailer } = build({ businesses: [tenant(inDays(-1))] });
    await svc.run("manual", NOW);
    expect(mailer.send).toHaveBeenCalledWith(expect.objectContaining({ kind: "REVERTED" }));
  });

  it("does not revert a term that has not ended", async () => {
    const { svc, subscriptionUpdates } = build({ businesses: [tenant(inDays(1))] });
    expect((await svc.run("manual", NOW)).reverted).toBe(0);
    expect(subscriptionUpdates).toHaveLength(0);
  });
});

describe("every run is recorded", () => {
  it("writes a run row even when nothing was due", async () => {
    // "No reminders sent" and "the sweep has not run in weeks" look identical
    // in a console otherwise — and on a host that sleeps, the second is real.
    const { svc, sweepRuns } = build({ businesses: [] });
    await svc.run("cron", NOW);
    expect(sweepRuns[0]).toMatchObject({ trigger: "cron", noticesSent: 0, reverted: 0 });
  });

  it("records which trigger fired it", async () => {
    const { svc, sweepRuns } = build({ businesses: [] });
    await svc.run("boot", NOW);
    expect(sweepRuns[0]).toMatchObject({ trigger: "boot" });
  });

  it("one tenant failing does not stop the ones behind it", async () => {
    const { svc, mailer } = build({
      businesses: [
        tenant(inDays(3), { id: "broken", subscription: null }),
        tenant(inDays(3), { id: "fine" }),
      ],
    });
    const result = await svc.run("manual", NOW);
    expect(mailer.send).toHaveBeenCalledTimes(1);
    expect(result.noticesSent).toBe(1);
  });
});
