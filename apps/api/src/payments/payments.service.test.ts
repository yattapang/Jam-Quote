import { describe, expect, it, vi } from "vitest";
import { NotFoundException } from "@nestjs/common";
import { PaymentMethod } from "@jamquote/core";
import { PaymentsService } from "./payments.service.js";

/* eslint-disable @typescript-eslint/no-explicit-any */

function makeWiPay(overrides: Partial<Record<string, any>> = {}) {
  return {
    verifyCallback: vi.fn().mockReturnValue(true),
    isSuccessful: vi.fn().mockReturnValue(true),
    createPaymentRequest: vi.fn(),
    ...overrides,
  };
}

// order_id carries the invoice's UUID, never its per-tenant number.
const INVOICE_ID = "3f2b1a90-0000-4000-8000-000000000007";

const successPayload = {
  order_id: INVOICE_ID,
  total: "1000.00",
  transaction_id: "wipay-tx-1",
  status: "success",
};

describe("PaymentsService.handleWiPayCallback", () => {
  it("ignores an unverified callback without touching the database", async () => {
    const wipay = makeWiPay({ verifyCallback: vi.fn().mockReturnValue(false) });
    const prisma = { invoice: { findUnique: vi.fn() } };
    const svc = new PaymentsService(prisma as any, wipay as any);

    await svc.handleWiPayCallback(successPayload);
    expect(prisma.invoice.findUnique).not.toHaveBeenCalled();
  });

  // Regression guard. order_id used to carry the invoice NUMBER, resolved via
  // findFirst({ where: { number } }). Numbers are unique only within a business
  // (@@unique([businessId, number])) and every tenant starts at INV-0001, so a
  // callback could credit a different tenant's invoice. Resolution must use the
  // globally-unique id.
  it("resolves the invoice by id, never by number", async () => {
    const invoice = { id: INVOICE_ID, number: "INV-0007", totalCents: 100_000, paidCents: 0 };
    const tx = {
      payment: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      invoice: { update: vi.fn().mockResolvedValue({}) },
    };
    const prisma = {
      invoice: { findUnique: vi.fn().mockResolvedValue(invoice) },
      $transaction: vi.fn(async (cb: (tx: unknown) => unknown) => cb(tx)),
    };
    const svc = new PaymentsService(prisma as any, makeWiPay() as any);

    await svc.handleWiPayCallback(successPayload);

    expect(prisma.invoice.findUnique).toHaveBeenCalledWith({ where: { id: INVOICE_ID } });
  });

  it("credits nothing when order_id is a bare invoice number matching no id", async () => {
    const prisma = {
      invoice: { findUnique: vi.fn().mockResolvedValue(null) },
      $transaction: vi.fn(),
    };
    const svc = new PaymentsService(prisma as any, makeWiPay() as any);

    await svc.handleWiPayCallback({ ...successPayload, order_id: "INV-0001" });

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("ignores a callback carrying no order_id", async () => {
    const prisma = { invoice: { findUnique: vi.fn() }, $transaction: vi.fn() };
    const svc = new PaymentsService(prisma as any, makeWiPay() as any);

    await svc.handleWiPayCallback({ ...successPayload, order_id: "" });

    expect(prisma.invoice.findUnique).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("credits the invoice when a pending payment is transitioned", async () => {
    const invoice = { id: INVOICE_ID, number: "INV-0007", totalCents: 100_000, paidCents: 0 };
    const tx = {
      payment: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      invoice: { update: vi.fn().mockResolvedValue({}) },
    };
    const prisma = {
      invoice: { findUnique: vi.fn().mockResolvedValue(invoice) },
      $transaction: vi.fn(async (cb: (tx: unknown) => unknown) => cb(tx)),
    };
    const svc = new PaymentsService(prisma as any, makeWiPay() as any);

    await svc.handleWiPayCallback(successPayload);

    expect(tx.invoice.update).toHaveBeenCalledTimes(1);
    expect(tx.invoice.update).toHaveBeenCalledWith(
      expect.objectContaining({
        // 1000.00 * 100 = 100,000 cents → fully paid
        data: expect.objectContaining({ paidCents: 100_000, status: "PAID" }),
      }),
    );
  });

  it("is idempotent: a replayed callback (no pending row) does not double-count", async () => {
    const invoice = { id: INVOICE_ID, number: "INV-0007", totalCents: 100_000, paidCents: 100_000 };
    const tx = {
      payment: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
      invoice: { update: vi.fn().mockResolvedValue({}) },
    };
    const prisma = {
      invoice: { findUnique: vi.fn().mockResolvedValue(invoice) },
      $transaction: vi.fn(async (cb: (tx: unknown) => unknown) => cb(tx)),
    };
    const svc = new PaymentsService(prisma as any, makeWiPay() as any);

    await svc.handleWiPayCallback(successPayload);
    expect(tx.invoice.update).not.toHaveBeenCalled();
  });
});

describe("PaymentsService.recordManualPayment", () => {
  /** tx mock whose invoice.update returns the post-increment figures, the way
   * a real atomic increment does. */
  function paymentHarness(opts: { totalCents: number; paidAfter: number }) {
    const tx = {
      payment: { create: vi.fn().mockResolvedValue({}) },
      invoice: {
        update: vi
          .fn()
          .mockResolvedValue({ paidCents: opts.paidAfter, totalCents: opts.totalCents }),
      },
    };
    const prisma = {
      invoice: { findFirst: vi.fn().mockResolvedValue({ id: "i1" }) },
      $transaction: vi.fn(async (cb: (tx: unknown) => unknown) => cb(tx)),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return { svc: new PaymentsService(prisma as any, makeWiPay() as any), prisma, tx };
  }

  it("records a cash payment and marks the invoice partial", async () => {
    const { svc, prisma, tx } = paymentHarness({ totalCents: 100_000, paidAfter: 50_000 });

    await svc.recordManualPayment({
      businessId: "biz-1",
      invoiceId: "i1",
      amountCents: 50_000,
      method: PaymentMethod.CASH,
    });

    expect(prisma.invoice.findFirst).toHaveBeenCalledWith({
      where: { id: "i1", businessId: "biz-1" },
      select: { id: true },
    });
    expect(tx.invoice.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { paidCents: { increment: 50_000 } } }),
    );
    expect(tx.invoice.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: "PARTIAL" } }),
    );
  });

  it("adds to paidCents atomically rather than overwriting it", async () => {
    // The old version computed `invoice.paidCents + amount` from a row read
    // BEFORE the transaction opened. Two payments recorded at once — the
    // contractor on a phone and the office on a laptop, or a WiPay callback
    // landing mid-entry — would each start from the same stale figure and the
    // second write would erase the first, on money a real customer owes.
    const { svc, tx } = paymentHarness({ totalCents: 100_000, paidAfter: 30_000 });

    await svc.recordManualPayment({
      businessId: "biz-1",
      invoiceId: "i1",
      amountCents: 20_000,
      method: PaymentMethod.CASH,
    });

    const incrementCall = tx.invoice.update.mock.calls.find(
      (c) => (c[0] as { data: Record<string, unknown> }).data.paidCents,
    );
    expect(incrementCall).toBeTruthy();
    // An increment instruction, never a computed absolute value.
    expect((incrementCall?.[0] as { data: { paidCents: unknown } }).data.paidCents).toEqual({
      increment: 20_000,
    });
  });

  it("marks the invoice PAID off the post-increment total, not a prediction", async () => {
    const { svc, tx } = paymentHarness({ totalCents: 100_000, paidAfter: 100_000 });

    await svc.recordManualPayment({
      businessId: "biz-1",
      invoiceId: "i1",
      amountCents: 60_000,
      method: PaymentMethod.BANK_TRANSFER,
    });

    expect(tx.invoice.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: "PAID" } }),
    );
  });

  it("stores the reference and the date the payment actually happened", async () => {
    // A payment taken on site last week has to be recordable with its real
    // date, or the customer's statement and the contractor's book disagree.
    const { svc, tx } = paymentHarness({ totalCents: 100_000, paidAfter: 10_000 });
    const paidAt = new Date("2026-08-01T10:00:00Z");

    await svc.recordManualPayment({
      businessId: "biz-1",
      invoiceId: "i1",
      amountCents: 10_000,
      method: PaymentMethod.CASH,
      reference: "cheque 00412",
      paidAt,
    });

    expect(tx.payment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ providerRef: "cheque 00412", paidAt }),
    });
  });

  it("throws NotFound (not the other tenant's invoice) when the invoice belongs to a different business", async () => {
    const prisma = {
      // findFirst scoped to businessId finds nothing for a cross-tenant id.
      invoice: { findFirst: vi.fn().mockResolvedValue(null) },
      $transaction: vi.fn(),
    };
    const svc = new PaymentsService(prisma as any, makeWiPay() as any);

    await expect(
      svc.recordManualPayment({
        businessId: "biz-attacker",
        invoiceId: "i1-belongs-to-biz-1",
        amountCents: 50_000,
        method: PaymentMethod.CASH,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});

describe("PaymentsService.startCardPayment", () => {
  it("scopes the invoice lookup to businessId and starts the WiPay request", async () => {
    const invoice = {
      id: "i1",
      number: "INV-0007",
      totalCents: 100_000,
      paidCents: 0,
      client: null,
    };
    const wipay = makeWiPay({
      createPaymentRequest: vi
        .fn()
        .mockResolvedValue({ paymentUrl: "https://wipay.example/pay/1", providerRef: "ref-1" }),
    });
    const prisma = {
      invoice: { findFirst: vi.fn().mockResolvedValue(invoice) },
      payment: { create: vi.fn().mockResolvedValue({}) },
    };
    const svc = new PaymentsService(prisma as any, wipay as any);

    const result = await svc.startCardPayment("biz-1", "i1");

    expect(prisma.invoice.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "i1", businessId: "biz-1" } }),
    );
    expect(result).toEqual({ paymentUrl: "https://wipay.example/pay/1" });

    // The provider must receive the globally-unique invoice id. Sending
    // invoice.number here is what let a callback reconcile against another
    // tenant's identically-numbered invoice.
    expect(wipay.createPaymentRequest).toHaveBeenCalledWith(
      expect.objectContaining({ orderId: invoice.id }),
    );
  });

  it("throws NotFound for a cross-tenant invoiceId instead of leaking another tenant's invoice", async () => {
    const prisma = {
      invoice: { findFirst: vi.fn().mockResolvedValue(null) },
    };
    const svc = new PaymentsService(prisma as any, makeWiPay() as any);

    await expect(svc.startCardPayment("biz-attacker", "i1-belongs-to-biz-1")).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});

describe("PaymentsService.voidPayment", () => {
  function voidHarness(opts: {
    payment?: { id: string; amountCents: number; invoiceId: string } | null;
    paidAfter?: number;
    totalCents?: number;
  }) {
    const tx = {
      payment: { update: vi.fn().mockResolvedValue({}) },
      invoice: {
        update: vi.fn().mockResolvedValue({
          paidCents: opts.paidAfter ?? 0,
          totalCents: opts.totalCents ?? 100_000,
        }),
      },
    };
    const prisma = {
      payment: { findFirst: vi.fn().mockResolvedValue(opts.payment ?? null) },
      $transaction: vi.fn(async (cb: (tx: unknown) => unknown) => cb(tx)),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return { svc: new PaymentsService(prisma as any, makeWiPay() as any), prisma, tx };
  }

  const PAYMENT = { id: "pay-1", amountCents: 40_000, invoiceId: "i1" };

  it("scopes the lookup through the invoice's business — Payment has no businessId", async () => {
    const { svc, prisma } = voidHarness({ payment: PAYMENT, paidAfter: 10_000 });
    await svc.voidPayment("biz-1", "pay-1");
    expect(prisma.payment.findFirst).toHaveBeenCalledWith({
      where: { id: "pay-1", deletedAt: null, invoice: { businessId: "biz-1" } },
      select: { id: true, amountCents: true, invoiceId: true },
    });
  });

  it("soft-deletes rather than removing the row", async () => {
    // The surviving row is the record of what was corrected, and the tombstone
    // an offline client needs.
    const { svc, tx } = voidHarness({ payment: PAYMENT, paidAfter: 10_000 });
    await svc.voidPayment("biz-1", "pay-1");
    expect(tx.payment.update).toHaveBeenCalledWith({
      where: { id: "pay-1" },
      data: { deletedAt: expect.any(Date) },
    });
  });

  it("takes the amount back off the invoice atomically", async () => {
    const { svc, tx } = voidHarness({ payment: PAYMENT, paidAfter: 10_000 });
    await svc.voidPayment("biz-1", "pay-1");
    expect(tx.invoice.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { paidCents: { decrement: 40_000 } } }),
    );
  });

  it("returns a fully-voided invoice to INVOICED, never to DRAFT", async () => {
    // DRAFT would make an invoice the customer has already received editable
    // again — and a draft could not have had a payment in the first place.
    const { svc, tx } = voidHarness({ payment: PAYMENT, paidAfter: 0 });
    await svc.voidPayment("biz-1", "pay-1");
    expect(tx.invoice.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: "INVOICED" } }),
    );
  });

  it("drops a PAID invoice back to PARTIAL when only one of several payments is voided", async () => {
    const { svc, tx } = voidHarness({ payment: PAYMENT, paidAfter: 60_000, totalCents: 100_000 });
    await svc.voidPayment("biz-1", "pay-1");
    expect(tx.invoice.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: "PARTIAL" } }),
    );
  });

  it("refuses another tenant's payment", async () => {
    const { svc, tx } = voidHarness({ payment: null });
    await expect(svc.voidPayment("biz-1", "pay-x")).rejects.toBeInstanceOf(NotFoundException);
    expect(tx.invoice.update).not.toHaveBeenCalled();
  });

  it("refuses to void the same payment twice", async () => {
    // findFirst filters deletedAt: null, so an already-voided payment is not
    // found — decrementing a second time would understate what was paid.
    const { svc, tx } = voidHarness({ payment: null });
    await expect(svc.voidPayment("biz-1", "pay-1")).rejects.toBeInstanceOf(NotFoundException);
    expect(tx.payment.update).not.toHaveBeenCalled();
  });
});
