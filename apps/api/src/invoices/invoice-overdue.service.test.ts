import { describe, expect, it, vi } from "vitest";
import { InvoiceOverdueService } from "./invoice-overdue.service.js";

const NOW = new Date("2026-08-20T09:00:00.000Z");

function build(opts: { businesses?: unknown[]; marked?: number } = {}) {
  const businessUpdates: Record<string, unknown>[] = [];
  const prisma = {
    invoice: { updateMany: vi.fn().mockResolvedValue({ count: opts.marked ?? 0 }) },
    business: {
      findMany: vi.fn().mockResolvedValue(opts.businesses ?? []),
      update: vi.fn().mockImplementation((args: Record<string, unknown>) => {
        businessUpdates.push(args);
        return {};
      }),
    },
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const svc = new InvoiceOverdueService(prisma as any);
  return { svc, prisma, businessUpdates };
}

const overdueInvoice = (over: Record<string, unknown> = {}) => ({
  number: "INV-0001",
  totalCents: 500_000,
  paidCents: 100_000,
  dueDate: new Date("2026-08-01T00:00:00.000Z"),
  ...over,
});

describe("marking invoices overdue", () => {
  it("targets only INVOICED and PARTIAL past their due date", async () => {
    // PAID for the obvious reason; DRAFT because it was never sent to anyone,
    // so it cannot be late.
    const { svc, prisma } = build();
    await svc.run(NOW);
    const where = prisma.invoice.updateMany.mock.calls[0]![0].where;
    expect(where.status.in).toEqual(["INVOICED", "PARTIAL"]);
    // Start of today, NOT `now`: an invoice due today is not late.
    // Today's JAMAICA date at UTC midnight — the same representation dueDate
    // is stored in. Not 05:00Z, which would make an invoice due today overdue
    // five hours early.
    expect(where.dueDate.lt).toEqual(new Date("2026-08-20T00:00:00.000Z"));
  });

  it("never touches an invoice with NO due date", async () => {
    // There is no date for it to be past, and inventing one would put payment
    // terms the business never agreed to into their figures.
    const { svc, prisma } = build();
    await svc.run(NOW);
    expect(prisma.invoice.updateMany.mock.calls[0]![0].where.dueDate.not).toBeNull();
  });

  it("does not mark an invoice due TODAY as overdue", async () => {
    // The client has until the end of the day. Comparing against the current
    // instant marked it late the moment the sweep ran on its due date, which
    // would have a contractor chasing someone who is not yet late.
    const { svc, prisma } = build();
    await svc.run(NOW);
    const cutoff = prisma.invoice.updateMany.mock.calls[0]![0].where.dueDate.lt as Date;
    // Due today, stored the way the invoice builder stores it.
    const dueToday = new Date("2026-08-20T00:00:00.000Z");
    expect(dueToday.getTime() < cutoff.getTime()).toBe(false);
  });

  it("does not roll the day over at 7pm Jamaica, when UTC has already", async () => {
    // 00:15Z on the 20th is 7:15pm on the 19th in Jamaica. An invoice due the
    // 19th still has hours left and must not be overdue. Caught on live data.
    const { svc, prisma } = build();
    await svc.run(new Date("2026-08-20T00:15:00.000Z"));
    const cutoff = prisma.invoice.updateMany.mock.calls[0]![0].where.dueDate.lt as Date;
    expect(cutoff).toEqual(new Date("2026-08-19T00:00:00.000Z"));
  });

  it("reports how many it marked", async () => {
    const { svc } = build({ marked: 3 });
    expect((await svc.run(NOW)).markedOverdue).toBe(3);
  });
});

describe("the digest goes to the contractor", () => {
  const business = (over: Record<string, unknown> = {}) => ({
    id: "biz-1",
    name: "Blackwood",
    billingContactEmail: "bills@blackwood.jm",
    users: [{ email: "owner@blackwood.jm", role: "OWNER" }],
    invoices: [overdueInvoice()],
    ...over,
  });

  it("only considers businesses not already told today", async () => {
    const { svc, prisma } = build({ businesses: [] });
    await svc.run(NOW);
    const where = prisma.business.findMany.mock.calls[0]![0].where;
    // The API sleeps, so the sweep can run several times in one morning and
    // must not send three identical emails.
    expect(JSON.stringify(where.OR)).toContain("lastOverdueDigestOn");
  });

  it("stamps the date even when the send fails", async () => {
    // A bounced digest retried every hour for a week is worse than one missed
    // day, and the figures are on the dashboard regardless.
    const { svc, businessUpdates } = build({ businesses: [business()] });
    await svc.run(NOW);
    expect(businessUpdates[0]).toMatchObject({
      where: { id: "biz-1" },
      data: { lastOverdueDigestOn: new Date("2026-08-20T00:00:00.000Z") },
    });
  });

  it("skips a business with no reachable address rather than crashing", async () => {
    const { svc, businessUpdates } = build({
      businesses: [business({ billingContactEmail: null, users: [] })],
    });
    const result = await svc.run(NOW);
    expect(result.digestsSent).toBe(0);
    // Not stamped either — nothing was attempted, so tomorrow should try again
    // once they have added an address.
    expect(businessUpdates).toHaveLength(0);
  });

  it("falls back past the billing contact to any addressable user", async () => {
    // Matches the subscription sweep: a tenant whose only account holder is an
    // ADMIN must still be reachable.
    const { svc, businessUpdates } = build({
      businesses: [
        business({ billingContactEmail: null, users: [{ email: "admin@x.jm", role: "ADMIN" }] }),
      ],
    });
    await svc.run(NOW);
    expect(businessUpdates).toHaveLength(1);
  });

  it("one business failing does not stop the ones behind it", async () => {
    const { svc, businessUpdates } = build({
      businesses: [
        business({ id: "broken", billingContactEmail: null, users: [] }),
        business({ id: "fine" }),
      ],
    });
    await svc.run(NOW);
    expect(businessUpdates).toHaveLength(1);
    expect(businessUpdates[0]).toMatchObject({ where: { id: "fine" } });
  });
});
