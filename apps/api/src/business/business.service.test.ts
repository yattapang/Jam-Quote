import { describe, expect, it, vi } from "vitest";
import { NotFoundException } from "@nestjs/common";
import { BusinessService } from "./business.service.js";

interface FakeBusiness {
  id: string;
  quotePrefix: string;
  invoicePrefix: string;
  nextQuoteSeq: number;
  nextInvoiceSeq: number;
}

function withTransaction(business: FakeBusiness) {
  const tx = {
    business: {
      findUnique: vi.fn().mockResolvedValue(business),
      update: vi.fn().mockResolvedValue({}),
    },
  };
  const prisma = {
    $transaction: vi.fn(async (cb: (tx: unknown) => unknown) => cb(tx)),
    business: { findUnique: vi.fn().mockResolvedValue(business) },
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { svc: new BusinessService(prisma as any), prisma, tx };
}

const business: FakeBusiness = {
  id: "b1",
  quotePrefix: "QT-",
  invoicePrefix: "INV-",
  nextQuoteSeq: 142,
  nextInvoiceSeq: 7,
};

describe("BusinessService.reserveQuoteNumber", () => {
  it("formats the padded number and bumps the counter", async () => {
    const { svc, tx } = withTransaction(business);
    const number = await svc.reserveQuoteNumber("b1");
    expect(number).toBe("QT-0142");
    expect(tx.business.update).toHaveBeenCalledWith({
      where: { id: "b1" },
      data: { nextQuoteSeq: 143 },
    });
  });
});

describe("BusinessService.reserveInvoiceNumber", () => {
  it("formats the padded invoice number and bumps its own counter", async () => {
    const { svc, tx } = withTransaction(business);
    const number = await svc.reserveInvoiceNumber("b1");
    expect(number).toBe("INV-0007");
    expect(tx.business.update).toHaveBeenCalledWith({
      where: { id: "b1" },
      data: { nextInvoiceSeq: 8 },
    });
  });
});

describe("BusinessService.findById", () => {
  it("throws NotFound when the business does not exist", async () => {
    const prisma = { business: { findUnique: vi.fn().mockResolvedValue(null) } };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const svc = new BusinessService(prisma as any);
    await expect(svc.findById("missing")).rejects.toBeInstanceOf(NotFoundException);
  });
});
