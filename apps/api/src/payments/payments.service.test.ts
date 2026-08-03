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
  it("records a cash payment and marks the invoice partial", async () => {
    const invoice = { id: "i1", number: "INV-0007", totalCents: 100_000, paidCents: 0 };
    const tx = {
      payment: { create: vi.fn().mockResolvedValue({}) },
      invoice: { update: vi.fn().mockResolvedValue({}) },
    };
    const prisma = {
      invoice: { findFirst: vi.fn().mockResolvedValue(invoice) },
      $transaction: vi.fn(async (cb: (tx: unknown) => unknown) => cb(tx)),
    };
    const svc = new PaymentsService(prisma as any, makeWiPay() as any);

    await svc.recordManualPayment({
      businessId: "biz-1",
      invoiceId: "i1",
      amountCents: 50_000,
      method: PaymentMethod.CASH,
    });

    expect(prisma.invoice.findFirst).toHaveBeenCalledWith({
      where: { id: "i1", businessId: "biz-1" },
    });
    expect(tx.invoice.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ paidCents: 50_000, status: "PARTIAL" }),
      }),
    );
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
