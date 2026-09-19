/**
 * FLOW 5 — subscription: record a payment, switch plan, void, and check that the
 * ledger, the Subscription row, the admin console (tenants + financials) and the
 * renewal sweep all agree on `renewsAt`. Real services, real Postgres; only the
 * mailer is a stub (it is Resend).
 *
 * The clock starts at 23:30 on 30 January IN JAMAICA, which is already 31 January in
 * UTC. A term computed on the UTC calendar ends 28 Feb; on Jamaica's calendar the
 * contractor paid on the 30th, so a month later is 28 Feb 23:30 local = 1 Mar 04:30Z.
 * The expected instants below are worked by hand, not produced by core.
 */
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { recordSubscriptionPaymentSchema, setTenantPlanSchema } from "../admin/admin.dto.js";
import { type Integration } from "./fixture.js";

let env: Integration;
afterEach(() => {
  vi.useRealTimers();
});

const DAY = 86_400_000;
const at = (iso: string) => vi.setSystemTime(new Date(iso));

/** Every place renewsAt is read from, for one business. */
async function renewsAtEverywhere(businessId: string) {
  const { svc, prisma } = env;
  const sub = await prisma.subscription.findUnique({ where: { businessId } });
  const tenantRow = (await svc.admin.tenants(true)).find((t) => t.id === businessId);
  const upcoming = (await svc.admin.financials()).upcomingRenewals.find((r) => r.businessId === businessId);
  const ledger = await prisma.subscriptionPayment.findFirst({
    where: { businessId, voidedAt: null },
    orderBy: { coversUntil: "desc" },
  });
  return {
    subscription: sub?.renewsAt?.toISOString() ?? null,
    adminTenants: tenantRow?.renewsAt ? new Date(tenantRow.renewsAt).toISOString() : null,
    adminUpcoming: upcoming ? upcoming.renewsAt.toISOString() : "not listed",
    ledger: ledger?.coversUntil.toISOString() ?? null,
  };
}

/** What the sweep sends, and for which term, at `now`. */
async function sweepAt(now: string) {
  env.mailer.send.mockClear();
  const result = await env.svc.sweep.run("manual", new Date(now));
  const calls = env.mailer.send.mock.calls as unknown as [{ kind: string; renewsAt: Date }][];
  return { result, sent: calls.map(([p]) => ({ kind: p.kind, renewsAt: p.renewsAt.toISOString() })) };
}


/** Registered by flows.integration.test.ts, which owns the one shared database. */
export function subscriptionFlow(shared: () => Integration): void {
  beforeAll(() => {
    env = shared();
  });

describe("subscription renewsAt agrees across ledger, admin console and sweep", () => {
  it("payment -> switch to annual -> second payment -> void, from a Jamaica late-evening start", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const { svc } = env;
    const { a } = await env.tenants();
    const staff = await env.staffUser();

    // 23:30 on 30 Jan in Jamaica.
    at("2026-01-31T04:30:00.000Z");
    const first = await svc.subscriptionPayments.record(
      a.id,
      recordSubscriptionPaymentSchema.parse({ method: "BANK_TRANSFER", amountCents: 250_000 }),
      staff,
    );
    // 28 Feb 23:30 Jamaica (clamped from the 30th), NOT 28 Feb 04:30Z.
    const monthEnd = "2026-03-01T04:30:00.000Z";
    expect(first.coversUntil.toISOString()).toBe(monthEnd);
    expect(await renewsAtEverywhere(a.id)).toEqual({
      subscription: monthEnd,
      adminTenants: monthEnd,
      adminUpcoming: monthEnd,
      ledger: monthEnd,
    });

    // The sweep reads the same term: three days out it sends RENEWAL_3 for it...
    const early = await sweepAt(new Date(Date.parse(monthEnd) - 2 * DAY).toISOString());
    expect(early.sent).toEqual([{ kind: "RENEWAL_3", renewsAt: monthEnd }]);
    // ...and reverts nobody before the term ends.
    expect(early.result.reverted).toBe(0);

    // Switch to annual. Paid-for time is kept: renewsAt does not move.
    await svc.admin.setTenantPlan(a.id, setTenantPlanSchema.parse({ plan: "pro", interval: "annual" }), staff);
    expect((await renewsAtEverywhere(a.id)).subscription).toBe(monthEnd);

    // An annual payment the next day extends from the paid-through date, in Jamaica
    // months: 28 Feb 23:30 local + 12 = 28 Feb 2027 23:30 local.
    at("2026-02-01T15:00:00.000Z");
    await svc.subscriptionPayments.record(
      a.id,
      recordSubscriptionPaymentSchema.parse({ method: "CASH", amountCents: 2_400_000 }),
      staff,
    );
    const yearEnd = "2027-03-01T04:30:00.000Z";
    expect(await renewsAtEverywhere(a.id)).toEqual({
      subscription: yearEnd,
      adminTenants: yearEnd,
      adminUpcoming: "not listed", // beyond the console's 60-day window
      ledger: yearEnd,
    });

    // Void the monthly payment. The annual one is re-anchored on the first term's
    // start: 30 Jan 23:30 local + 12 months = 30 Jan 2027 23:30 local.
    await svc.subscriptionPayments.void(first.id, staff);
    const reallocated = "2027-01-31T04:30:00.000Z";
    expect(await renewsAtEverywhere(a.id)).toEqual({
      subscription: reallocated,
      adminTenants: reallocated,
      adminUpcoming: "not listed",
      ledger: reallocated,
    });

    // The sweep agrees with the console: RENEWAL_30 (annual only) inside 30 days of it...
    const annualNotice = await sweepAt(new Date(Date.parse(reallocated) - 20 * DAY).toISOString());
    expect(annualNotice.sent).toEqual([{ kind: "RENEWAL_30", renewsAt: reallocated }]);
    // ...and the console's PAST_DUE and the sweep's revert flip at the same instant.
    // Both read core's `daysUntil` (Math.ceil), so a term is not past due until a full
    // day after renewsAt — a day's grace, the same on both sides.
    for (const offset of [-60_000, 60_000, DAY - 60_000]) {
      const t = new Date(Date.parse(reallocated) + offset).toISOString();
      at(t);
      expect((await svc.admin.financials()).pastDueCount, `console at ${t}`).toBe(0);
      expect((await sweepAt(t)).result.reverted, `sweep at ${t}`).toBe(0);
    }
    const lapsed = new Date(Date.parse(reallocated) + DAY + 60_000).toISOString();
    at(lapsed);
    expect((await svc.admin.financials()).pastDueCount).toBe(1);
    const after = await sweepAt(lapsed);
    expect(after.result.reverted).toBe(1);
    expect(after.sent).toEqual([{ kind: "REVERTED", renewsAt: reallocated }]);
    expect((await env.prisma.subscription.findUnique({ where: { businessId: a.id } }))?.plan).toBe("free");
  });
});
}
