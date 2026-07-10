import { describe, expect, it, vi } from "vitest";
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

const successPayload = {
  order_id: "INV-0007",
  total: "1000.00",
  transaction_id: "wipay-tx-1",
  status: "success",
};

describe("PaymentsService.handleWiPayCallback", () => {
  it("ignores an unverified callback without touching the database", async () => {
    const wipay = makeWiPay({ verifyCallback: vi.fn().mockReturnValue(false) });
    const prisma = { invoice: { findFirst: vi.fn() } };
    const svc = new PaymentsService(prisma as any, wipay as any);

    await svc.handleWiPayCallback(successPayload);
    expect(prisma.invoice.findFirst).not.toHaveBeenCalled();
  });

  it("credits the invoice when a pending payment is transitioned", async () => {
    const invoice = { id: "i1", number: "INV-0007", totalCents: 100_000, paidCents: 0 };
    const tx = {
      payment: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      invoice: { update: vi.fn().mockResolvedValue({}) },
    };
    const prisma = {
      invoice: { findFirst: vi.fn().mockResolvedValue(invoice) },
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
    const invoice = { id: "i1", number: "INV-0007", totalCents: 100_000, paidCents: 100_000 };
    const tx = {
      payment: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
      invoice: { update: vi.fn().mockResolvedValue({}) },
    };
    const prisma = {
      invoice: { findFirst: vi.fn().mockResolvedValue(invoice) },
      $transaction: vi.fn(async (cb: (tx: unknown) => unknown) => cb(tx)),
    };
    const svc = new PaymentsService(prisma as any, makeWiPay() as any);

    await svc.handleWiPayCallback(successPayload);
    expect(tx.invoice.update).not.toHaveBeenCalled();
  });
});

describe("PaymentsService.recordManualPayment", () => {
  it("records a cash payment and marks the invoice partial", async () => {
    const invoice = { id: "i1", number: "INV-0007", totalCents: 100_000, paidCents: 0 };
    const tx = {
      payment: { create: vi.fn().mockResolvedValue({}) },
      invoice: { update: vi.fn().mockResolvedValue({}) },
    };
    const prisma = {
      invoice: { findUnique: vi.fn().mockResolvedValue(invoice) },
      $transaction: vi.fn(async (cb: (tx: unknown) => unknown) => cb(tx)),
    };
    const svc = new PaymentsService(prisma as any, makeWiPay() as any);

    await svc.recordManualPayment({
      invoiceId: "i1",
      amountCents: 50_000,
      method: PaymentMethod.CASH,
    });

    expect(tx.invoice.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ paidCents: 50_000, status: "PARTIAL" }),
      }),
    );
  });
});
