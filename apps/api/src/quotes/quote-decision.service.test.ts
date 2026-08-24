import { describe, expect, it, vi } from "vitest";
import { BadRequestException, NotFoundException } from "@nestjs/common";
import { QuoteStatus } from "@jamquote/core";
import { QuotesService } from "./quotes.service.js";

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * The client's accept/decline, over the one UNAUTHENTICATED write in the API.
 *
 * These tests are about what an anonymous caller holding a token can and
 * cannot do. The token is the credential, so the guarantees have to come from
 * the method itself: only a quote actually sent can be decided, only once, and
 * nothing about the quote's money can be touched through this path.
 */
function harness(quote: Record<string, unknown> | null) {
  const updates: any[] = [];
  const prisma = {
    quote: {
      findFirst: vi.fn(() =>
        Promise.resolve(
          quote ? { id: "q1", businessId: "b1", projectId: null, ...quote } : null,
        ),
      ),
      update: vi.fn((args: any) => {
        updates.push(args.data);
        return Promise.resolve({});
      }),
    },
    project: { create: vi.fn(() => Promise.resolve({ id: "p1" })) },
  };
  const svc = new QuotesService(prisma as any, {} as any, {} as any);
  return { svc, prisma, updates };
}

describe("QuotesService.decideByShareToken", () => {
  it("accepts a quote the client has been sent", async () => {
    const { svc, updates } = harness({ status: QuoteStatus.SENT });
    const out = await svc.decideByShareToken("tok", "ACCEPT", "  Marcia Brown  ");

    expect(out.status).toBe(QuoteStatus.ACCEPTED);
    expect(updates[0].status).toBe(QuoteStatus.ACCEPTED);
    expect(updates[0].decidedByName).toBe("Marcia Brown");
    expect(updates[0].decidedAt).toBeInstanceOf(Date);
  });

  it("accepts one the client has already opened", async () => {
    const { svc } = harness({ status: QuoteStatus.VIEWED });
    await expect(svc.decideByShareToken("tok", "ACCEPT", "Marcia")).resolves.toEqual({
      status: QuoteStatus.ACCEPTED,
    });
  });

  it("records a decline with its reason", async () => {
    const { svc, updates } = harness({ status: QuoteStatus.VIEWED });
    await svc.decideByShareToken("tok", "DECLINE", "Marcia", "Too expensive right now");

    expect(updates[0].status).toBe(QuoteStatus.DECLINED);
    expect(updates[0].declineReason).toBe("Too expensive right now");
  });

  it("does not keep a decline reason on an acceptance", async () => {
    const { svc, updates } = harness({ status: QuoteStatus.SENT });
    await svc.decideByShareToken("tok", "ACCEPT", "Marcia", "leftover text");
    expect(updates[0].declineReason).toBeNull();
  });

  it("refuses a second answer, so a decision cannot be flipped through the link", async () => {
    // The commonest real cause is two people opening the same link. The record
    // of what was agreed is the entire point, so the public path never
    // overwrites it — the contractor changes it themselves if need be.
    const { svc, prisma } = harness({ status: QuoteStatus.ACCEPTED });
    await expect(svc.decideByShareToken("tok", "DECLINE", "Someone")).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(prisma.quote.update).not.toHaveBeenCalled();
  });

  it("refuses once the quote has been invoiced", async () => {
    const { svc, prisma } = harness({ status: QuoteStatus.INVOICED });
    await expect(svc.decideByShareToken("tok", "ACCEPT", "Marcia")).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(prisma.quote.update).not.toHaveBeenCalled();
  });

  it("treats a DRAFT exactly like an unknown token", async () => {
    // Any difference between the two lets an anonymous caller probe which
    // tokens are real — the same rule findByShareToken follows.
    const draft = harness({ status: QuoteStatus.DRAFT });
    const missing = harness(null);
    await expect(draft.svc.decideByShareToken("tok", "ACCEPT", "X")).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(missing.svc.decideByShareToken("tok", "ACCEPT", "X")).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it("never writes anything but the decision fields", async () => {
    // The quote's money must not be reachable through an unauthenticated
    // route. If this ever grows another key, that is a security change and
    // should be argued for explicitly.
    const { svc, updates } = harness({ status: QuoteStatus.SENT });
    await svc.decideByShareToken("tok", "ACCEPT", "Marcia");
    expect(Object.keys(updates[0]).sort()).toEqual([
      "decidedAt",
      "decidedByName",
      "declineReason",
      "status",
    ]);
  });
});
