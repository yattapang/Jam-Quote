import { describe, expect, it, vi } from "vitest";
import { BadRequestException } from "@nestjs/common";
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
