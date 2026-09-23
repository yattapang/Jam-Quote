import { describe, expect, it, vi } from "vitest";
import { BadRequestException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { InvoiceStatus } from "@jamquote/core";
import { InvoicesService } from "./invoices.service.js";

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Retention release: sign-off, not payment.
 *
 * The rule worth protecting is that releasing changes only WHEN the money is
 * due — it must never touch paidCents. A release that quietly recorded a
 * payment would show a contractor as settled for money still sitting in the
 * client's account.
 */
function harness(invoice: Record<string, unknown>) {
  const stored: any = { id: "inv1", businessId: "b1", lineItems: [], sections: [], ...invoice };
  const prisma = {
    invoice: {
      findFirst: vi.fn(() => Promise.resolve(stored)),
      update: vi.fn((args: any) => {
        Object.assign(stored, args.data);
        return Promise.resolve(stored);
      }),
    },
  };
  const svc = new InvoicesService(prisma as any, {} as any);
  return { svc, prisma, stored };
}

describe("InvoicesService.setRetentionReleased", () => {
  it("stamps a release date without touching what has been paid", async () => {
    const { svc, prisma, stored } = harness({
      status: InvoiceStatus.INVOICED,
      retentionCents: 50_000,
      retentionReleasedAt: null,
      paidCents: 450_000,
    });

    await svc.setRetentionReleased("b1", "inv1", true);

    const data = prisma.invoice.update.mock.calls[0]?.[0].data;
    expect(data.retentionReleasedAt).toBeInstanceOf(Date);
    // Releasing is not a payment. If this ever grows a paidCents write, the
    // invoice will report money that never arrived.
    expect(data).not.toHaveProperty("paidCents");
    expect(stored.paidCents).toBe(450_000);
  });

  it("can be undone, because sign-off gets clicked early", async () => {
    const { svc, prisma } = harness({
      status: InvoiceStatus.INVOICED,
      retentionCents: 50_000,
      retentionReleasedAt: new Date(),
      paidCents: 0,
    });

    await svc.setRetentionReleased("b1", "inv1", false);

    expect(prisma.invoice.update.mock.calls[0]?.[0].data.retentionReleasedAt).toBeNull();
  });

  it("refuses when no retention is held", async () => {
    const { svc, prisma } = harness({
      status: InvoiceStatus.INVOICED,
      retentionCents: 0,
      retentionReleasedAt: null,
      paidCents: 0,
    });

    await expect(svc.setRetentionReleased("b1", "inv1", true)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(prisma.invoice.update).not.toHaveBeenCalled();
  });

  it("refuses on a draft, which the client has never been given", async () => {
    const { svc, prisma } = harness({
      status: InvoiceStatus.DRAFT,
      retentionCents: 50_000,
      retentionReleasedAt: null,
      paidCents: 0,
    });

    await expect(svc.setRetentionReleased("b1", "inv1", true)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(prisma.invoice.update).not.toHaveBeenCalled();
  });
});

/**
 * The retention SNAPSHOT, and what happens when the draft it was taken from moves.
 *
 * `retentionCents` is a snapshot on purpose: once an invoice is issued, the held
 * amount is what the client was told, and editing the project's percentage later
 * must not restate a document they already hold.
 *
 * But a snapshot taken at conversion and never refreshed goes stale the moment the
 * DRAFT it belongs to is edited — and a draft is exactly what is still meant to be
 * editable. A review found the amount computed from the pre-edit total while both
 * screens went on labelling it with the percentage, so the figure and its label
 * disagreed on a finalized document.
 */
describe("the retention snapshot follows a draft's total", () => {
  function build(existing: Record<string, unknown>) {
    const tx = {
      invoiceLineItem: { deleteMany: vi.fn(), createMany: vi.fn(), create: vi.fn() },
      invoiceSection: { deleteMany: vi.fn(), create: vi.fn() },
      invoice: { update: vi.fn().mockResolvedValue({}) },
    };
    const prisma = {
      $transaction: vi.fn(async (cb: (t: unknown) => unknown) => cb(tx)),
      client: {
        findFirst: vi.fn(({ where }: { where: { businessId?: string } }) =>
          Promise.resolve(where.businessId === "b1" ? { id: "cl1", businessId: "b1" } : null),
        ),
      },
      invoice: { findFirst: vi.fn().mockResolvedValue(existing) },
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const svc = new InvoicesService(prisma as any, {} as any);
    return { svc, tx };
  }

  const draft = {
    id: "inv1",
    businessId: "b1",
    status: InvoiceStatus.DRAFT,
    clientId: "cl1",
    quoteId: null,
    projectId: null,
    number: "INV-0001",
    issueDate: new Date("2026-09-01T12:00:00.000Z"),
    dueDate: null,
    terms: null,
    detailLevel: "SUMMARY",
    gctRate: new Prisma.Decimal("15.00"),
    discountPct: new Prisma.Decimal("0.00"),
    depositCents: 0,
    subtotalCents: 10_000_000,
    gctCents: 0,
    totalCents: 10_000_000,
    paidCents: 0,
    // 10% of the original $100,000.
    retentionPct: new Prisma.Decimal("10.00"),
    retentionCents: 1_000_000,
    retentionReleasedAt: null,
    sections: [],
    lineItems: [],
  };

  it("re-snapshots the held amount when the lines change", async () => {
    // Double the total: 10% of $200,000 is $20,000, not the $10,000 taken at
    // conversion. Leaving it stale made the invoice hold 5% under a "10%" label.
    const { svc, tx } = build(draft);
    await svc.update("b1", "inv1", {
      lineItems: [
        {
          category: "MATERIAL",
          description: "Blockwork",
          quantity: 1,
          rateUnit: "UNIT",
          unitPriceCents: 20_000_000,
          gctTreatment: "EXEMPT",
        },
      ],
      sections: [],
      discountPct: 0,
      depositCents: 0,
    } as never);

    const data = tx.invoice.update.mock.calls[0]?.[0].data;
    expect(data.totalCents).toBe(20_000_000);
    expect(data.retentionCents).toBe(2_000_000);
  });

  it("leaves the held amount alone on an invoice with no retention agreed", async () => {
    // null pct is "not agreed", which is a different fact from 0% — and neither
    // should acquire a retention amount from an edit.
    const { svc, tx } = build({ ...draft, retentionPct: null, retentionCents: 0 });
    await svc.update("b1", "inv1", { discountPct: 5 } as never);
    expect(tx.invoice.update.mock.calls[0]?.[0].data.retentionCents).toBeUndefined();
  });

  it("lets a due date be CLEARED, not only set", async () => {
    // `input.dueDate ?? existing.dueDate` meant an explicit null was discarded, so
    // a due date could be added and never removed — two lines below a comment
    // explaining exactly why that is wrong for a nullable field.
    const { svc, tx } = build({ ...draft, dueDate: new Date("2026-10-01T00:00:00.000Z") });
    await svc.update("b1", "inv1", { dueDate: null } as never);
    expect(tx.invoice.update.mock.calls[0]?.[0].data.dueDate).toBeNull();
  });
});
