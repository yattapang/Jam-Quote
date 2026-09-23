import { describe, expect, it, vi } from "vitest";
import { QuoteStatus } from "@jamquote/core";
import { QuoteExpiryService } from "./quote-expiry.service.js";

/* eslint-disable @typescript-eslint/no-explicit-any */

describe("QuoteExpiryService.expireOverdueQuotes", () => {
  it("expires only SENT/VIEWED quotes whose validUntil has passed, and returns the count", async () => {
    const prisma = {
      quote: {
        updateMany: vi.fn().mockResolvedValue({ count: 3 }),
      },
    };
    const svc = new QuoteExpiryService(prisma as any);
    const now = new Date("2026-07-12T00:00:00.000Z");

    const count = await svc.expireOverdueQuotes(now);

    expect(prisma.quote.updateMany).toHaveBeenCalledWith({
      where: {
        status: { in: [QuoteStatus.SENT, QuoteStatus.VIEWED] },
        validUntil: { lt: now },
      },
      data: { status: QuoteStatus.EXPIRED },
    });
    expect(count).toBe(3);
  });

  it("defaults `now` to the current time when not provided", async () => {
    const prisma = {
      quote: {
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
    };
    const svc = new QuoteExpiryService(prisma as any);

    await svc.expireOverdueQuotes();

    const call = prisma.quote.updateMany.mock.calls[0]?.[0];
    expect(call.where.status).toEqual({ in: [QuoteStatus.SENT, QuoteStatus.VIEWED] });
    expect(call.where.validUntil.lt).toBeInstanceOf(Date);
    expect(call.data).toEqual({ status: QuoteStatus.EXPIRED });
  });
});
