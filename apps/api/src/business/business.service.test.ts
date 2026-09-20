import { describe, expect, it, vi } from "vitest";
import { NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { BusinessService } from "./business.service.js";

interface FakeBusiness {
  id: string;
  quotePrefix: string;
  invoicePrefix: string;
  nextQuoteSeq: number;
  nextInvoiceSeq: number;
}

/** A fake `business.update` that behaves like Postgres's atomic
 * `SET x = x + 1`: each call applies its increment to SHARED state
 * immediately, in call order, and returns the row as it stands right after
 * — exactly what a real `{ increment: 1 }` update does. This is what lets
 * the race test below tell an atomic implementation from a
 * read-modify-write one: a `findUnique` then literal `seq + 1` shape would
 * have both concurrent calls read the pre-increment value and compute the
 * same result. */
function fakePrisma(initial: FakeBusiness) {
  const state = { ...initial };
  const update = vi.fn(
    ({ data }: { data: Record<string, { increment: number } | undefined> }) => {
      for (const [field, value] of Object.entries(data)) {
        if (value && typeof value === "object" && "increment" in value) {
          const stateRecord = state as unknown as Record<string, number>;
          stateRecord[field] = (stateRecord[field] ?? 0) + value.increment;
        }
      }
      return Promise.resolve({ ...state });
    },
  );
  const prisma = { business: { update } };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { svc: new BusinessService(prisma as any), prisma, state };
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
    const { svc, prisma } = fakePrisma(business);
    const number = await svc.reserveQuoteNumber("b1");
    expect(number).toBe("QT-0142");
    // Atomic increment, not a literal computed-in-JS value: proves the fix
    // for the read-modify-write race (defect 2) is actually in place.
    expect(prisma.business.update).toHaveBeenCalledWith({
      where: { id: "b1" },
      data: { nextQuoteSeq: { increment: 1 } },
    });
  });

  it("throws NotFound when the business row is gone (Prisma P2025)", async () => {
    const prisma = {
      business: {
        update: vi.fn().mockRejectedValue(
          new Prisma.PrismaClientKnownRequestError("No record", {
            code: "P2025",
            clientVersion: "test",
          }),
        ),
      },
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const svc = new BusinessService(prisma as any);
    await expect(svc.reserveQuoteNumber("missing")).rejects.toBeInstanceOf(NotFoundException);
  });

  it("never hands out the same number to two concurrent reservations", async () => {
    const { svc } = fakePrisma(business);
    const [a, b] = await Promise.all([svc.reserveQuoteNumber("b1"), svc.reserveQuoteNumber("b1")]);
    expect(new Set([a, b]).size).toBe(2);
  });
});

describe("BusinessService.reserveInvoiceNumber", () => {
  it("formats the padded invoice number and bumps its own counter", async () => {
    const { svc, prisma } = fakePrisma(business);
    const number = await svc.reserveInvoiceNumber("b1");
    expect(number).toBe("INV-0007");
    expect(prisma.business.update).toHaveBeenCalledWith({
      where: { id: "b1" },
      data: { nextInvoiceSeq: { increment: 1 } },
    });
  });

  it("never hands out the same number to two concurrent reservations", async () => {
    const { svc } = fakePrisma(business);
    const [a, b] = await Promise.all([
      svc.reserveInvoiceNumber("b1"),
      svc.reserveInvoiceNumber("b1"),
    ]);
    expect(new Set([a, b]).size).toBe(2);
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
