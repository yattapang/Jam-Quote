import { describe, expect, it, vi } from "vitest";
import { InvoiceOverdueService } from "./invoice-overdue.service.js";

const NOW = new Date("2026-08-20T09:00:00.000Z");

function build(
  opts: { businesses?: unknown[]; marked?: number; candidates?: unknown[]; stamped?: unknown[] } = {},
) {
  const businessUpdates: Record<string, unknown>[] = [];
  const prisma = {
    invoice: {
      // The sweep now READS the candidates its date filter selects and decides in
      // TS which are actually late, because an invoice is late only if something
      // is unpaid of what is DUE NOW — and due-now is the total less retention
      // still held, which a single updateMany cannot express.
      // Two reads now: the past-due candidates, then the rows already stamped
      // OVERDUE so the sweep can take settled ones back out. The second answer is
      // empty unless a test supplies `stamped`.
      findMany: vi.fn().mockImplementation(({ where }: { where: { status?: unknown } }) =>
        Promise.resolve(
          JSON.stringify(where.status) === JSON.stringify("OVERDUE")
            ? (opts.stamped ?? [])
            : (opts.candidates ?? [
          {
            id: "inv-late",
            totalCents: 500_000,
            paidCents: 100_000,
            retentionCents: 0,
            retentionReleasedAt: null,
              },
            ]),
        ),
      ),
      update: vi.fn().mockResolvedValue({}),
      updateMany: vi.fn().mockResolvedValue({ count: opts.marked ?? 0 }),
    },
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
  // Part of the select now: the digest reports what is CHASEABLE, and retention
  // still held is not arrears.
  retentionCents: 0,
  retentionReleasedAt: null,
  dueDate: new Date("2026-08-01T00:00:00.000Z"),
  ...over,
});

describe("marking invoices overdue", () => {
  it("does NOT mark an invoice whose only unpaid balance is retention still held", async () => {
    // The defect. $100,000 invoice, 10% held, $90,000 paid: fully settled for now.
    // Comparing the payment against the TOTAL left it PARTIAL, the sweep flipped
    // it to OVERDUE in critical red, and the nightly digest told the contractor to
    // chase a client for money the contract says they may keep.
    const { svc, prisma } = build({
      candidates: [
        {
          id: "inv-retention",
          totalCents: 10_000_000,
          paidCents: 9_000_000,
          retentionCents: 1_000_000,
          retentionReleasedAt: null,
        },
      ],
    });
    await svc.run(NOW);
    expect(prisma.invoice.updateMany).not.toHaveBeenCalled();
  });

  it("DOES mark it once the retention has been released and still not paid", async () => {
    // Release is the moment the held money becomes payable. After that, unpaid is
    // unpaid and late is late.
    const { svc, prisma } = build({
      candidates: [
        {
          id: "inv-released",
          totalCents: 10_000_000,
          paidCents: 9_000_000,
          retentionCents: 1_000_000,
          retentionReleasedAt: new Date("2026-08-15T00:00:00.000Z"),
        },
      ],
    });
    await svc.run(NOW);
    // The write repeats every filter clause as well as the id list — narrowing it
    // to the ids alone let a payment landing mid-sweep be stamped back to OVERDUE.
    expect(prisma.invoice.updateMany.mock.calls[0]?.[0].where).toMatchObject({
      id: { in: ["inv-released"] },
      status: { in: ["INVOICED", "PARTIAL"] },
    });
  });

  it("marks a genuinely late invoice, so the guard above is not just switching it off", async () => {
    const { svc, prisma } = build();
    await svc.run(NOW);
    expect(prisma.invoice.updateMany.mock.calls[0]?.[0].where).toMatchObject({
      id: { in: ["inv-late"] },
      status: { in: ["INVOICED", "PARTIAL"] },
    });
  });

  it("targets only INVOICED and PARTIAL past their due date", async () => {
    // PAID for the obvious reason; DRAFT because it was never sent to anyone,
    // so it cannot be late.
    const { svc, prisma } = build();
    await svc.run(NOW);
    const where = prisma.invoice.findMany.mock.calls[0]![0].where;
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
    expect(prisma.invoice.findMany.mock.calls[0]![0].where.dueDate.not).toBeNull();
  });

  it("does not mark an invoice due TODAY as overdue", async () => {
    // The client has until the end of the day. Comparing against the current
    // instant marked it late the moment the sweep ran on its due date, which
    // would have a contractor chasing someone who is not yet late.
    const { svc, prisma } = build();
    await svc.run(NOW);
    const cutoff = prisma.invoice.findMany.mock.calls[0]![0].where.dueDate.lt as Date;
    // Due today, stored the way the invoice builder stores it.
    const dueToday = new Date("2026-08-20T00:00:00.000Z");
    expect(dueToday.getTime() < cutoff.getTime()).toBe(false);
  });

  it("does not roll the day over at 7pm Jamaica, when UTC has already", async () => {
    // 00:15Z on the 20th is 7:15pm on the 19th in Jamaica. An invoice due the
    // 19th still has hours left and must not be overdue. Caught on live data.
    const { svc, prisma } = build();
    await svc.run(new Date("2026-08-20T00:15:00.000Z"));
    const cutoff = prisma.invoice.findMany.mock.calls[0]![0].where.dueDate.lt as Date;
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

describe("taking invoices back OUT of overdue", () => {
  it("clears OVERDUE when nothing is actually due any more", async () => {
    // The reverse direction, which the first version did not have. The sweep only
    // READS invoices in INVOICED and PARTIAL, so anything already stamped OVERDUE
    // stayed there for ever — including every row marked before retention was part
    // of the question. This doubles as the repair for them, rather than a one-off
    // script nobody runs twice.
    const { svc, prisma } = build({
      candidates: [],
      stamped: [
        {
          id: "inv-stuck",
          totalCents: 10_000_000,
          paidCents: 9_000_000,
          retentionCents: 1_000_000,
          retentionReleasedAt: null,
        },
      ],
    });
    await svc.run(NOW);
    // PARTIAL, not PAID: money HAS been received, and PAID is written by the
    // payment path from the post-increment truth. Two writers guessing at PAID
    // would eventually disagree about the same invoice.
    expect(prisma.invoice.update).toHaveBeenCalledWith({
      where: { id: "inv-stuck" },
      data: { status: "PARTIAL" },
    });
  });

  it("leaves a genuinely overdue invoice stamped", async () => {
    const { svc, prisma } = build({
      candidates: [],
      stamped: [
        {
          id: "inv-really-late",
          totalCents: 10_000_000,
          paidCents: 0,
          retentionCents: 0,
          retentionReleasedAt: null,
        },
      ],
    });
    await svc.run(NOW);
    expect(prisma.invoice.update).not.toHaveBeenCalled();
  });

  it("returns an unpaid-from-the-start invoice to INVOICED, not PARTIAL", async () => {
    const { svc, prisma } = build({
      candidates: [],
      stamped: [
        {
          id: "inv-nothing-paid",
          totalCents: 1_000_000,
          paidCents: 0,
          retentionCents: 1_000_000,
          retentionReleasedAt: null,
        },
      ],
    });
    await svc.run(NOW);
    expect(prisma.invoice.update.mock.calls[0]?.[0].data.status).toBe("INVOICED");
  });
});
