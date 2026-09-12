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

});

/**
 * GUARD: everything the unauthenticated route writes, on every model, by any
 * method, is inside an allowed set — so the quote's money is not reachable
 * through a share token.
 *
 * Why a behavioural test and not a type (doctrine rung 1): the natural type
 * would hand `decideByShareToken` a client narrowed to `quote.update` with
 * `data: Pick<..., decision fields>`. It cannot hold today because the method
 * reaches the database through `this.prisma` — the full PrismaService — and
 * through two private helpers that also legitimately write (a project row and
 * the quote's `projectId`). Narrowing it means extracting the route into a
 * function over a `Pick`ed client, which is a change to quotes.service.ts and
 * still falls to one `as any` or a reach back to `this.prisma`. This test
 * holds the fact against the real code path instead.
 *
 * The double RECORDS every call before doing anything else, and THROWS on any
 * method it does not model. Recording first matters: both helpers swallow
 * exceptions (`notifyDecision` swallows everything), so a throw alone would be
 * silently eaten — the recorded list is what the assertions read.
 *
 * What the allowed set is (the real route, not the idealised one):
 *   - quote.update, where { id: <this quote> }, data keys ⊆ decision fields
 *   - quote.update, where { id: <this quote> }, data keys exactly { projectId }
 *   - project.create, data keys ⊆ { businessId, clientId, name, stage }, with
 *     businessId equal to the quote's own business
 * Reads are modelled for exactly what the route reads; any other method, on
 * any model or on the client itself ($transaction, $executeRaw…), is a
 * violation.
 *
 * What it does NOT prove: writes that bypass `this.prisma` entirely (a second
 * PrismaClient, a direct pg connection, or a call into an injected service that
 * owns its own client — BusinessService and PricingService are `{}` here, so
 * such a call inside a swallowing try/catch would go unrecorded); branches not
 * reached with these inputs (e.g. a quote that already has a projectId, or a
 * business with no addressable email); and the VALUES written to the allowed
 * fields, which the tests above cover.
 */
vi.mock("resend", () => ({
  Resend: class {
    emails = { send: vi.fn(() => Promise.resolve({})) };
  },
}));

const DECISION_FIELDS = ["decidedAt", "decidedByName", "declineReason", "status"];
const PROJECT_FIELDS = ["businessId", "clientId", "name", "stage"];

type Call = { target: string; args: any[] };

function recordingPrisma(quote: Record<string, unknown>) {
  const calls: Call[] = [];
  const row = {
    id: "q1",
    businessId: "b1",
    projectId: null,
    number: "Q-0001",
    clientId: "c1",
    totalCents: 100_00,
    declineReason: null,
    ...quote,
  };
  // Reads the route actually makes. Everything else is unmodelled.
  const reads: Record<string, (args: any) => unknown> = {
    "quote.findFirst": () => row,
    "quote.findUnique": () => row,
    "business.findUnique": () => ({
      name: "Acme",
      billingContactEmail: "owner@example.com",
      users: [],
    }),
  };
  const writes: Record<string, (args: any) => unknown> = {
    "quote.update": () => ({}),
    "project.create": () => ({ id: "p1" }),
  };

  const client: any = new Proxy(
    {},
    {
      get(_t, prop) {
        if (typeof prop !== "string" || prop === "then") return undefined;
        if (prop === "$transaction") {
          // Modelled, not refused: a transaction is a wrapper, and what it
          // WRITES is the question. The callback gets this same recording
          // client, so writes made through `tx` land in `calls` like any other;
          // the array form's operations were already recorded when built.
          return (arg: any) => {
            calls.push({ target: "$transaction", args: [] });
            return typeof arg === "function" ? arg(client) : Promise.all(arg);
          };
        }
        if (prop.startsWith("$")) {
          return (...args: any[]) => {
            calls.push({ target: prop, args });
            throw new Error(`unmodelled prisma client method: ${prop}`);
          };
        }
        return new Proxy(
          {},
          {
            get(_m, method) {
              if (typeof method !== "string" || method === "then") return undefined;
              const target = `${prop}.${method}`;
              return (...args: any[]) => {
                calls.push({ target, args });
                const impl = reads[target] ?? writes[target];
                if (!impl) throw new Error(`unmodelled prisma method: ${target}`);
                return Promise.resolve(impl(args[0]));
              };
            },
          },
        );
      },
    },
  );

  const violations = () =>
    calls
      .filter((c) => !(c.target in reads) && c.target !== "$transaction")
      .filter((c) => {
        const a = c.args[0] ?? {};
        const keys = Object.keys(a.data ?? {}).sort();
        const onThisQuote =
          Object.keys(a.where ?? {}).join() === "id" && a.where.id === row.id;
        if (c.target === "quote.update" && onThisQuote) {
          if (keys.length > 0 && keys.every((k) => DECISION_FIELDS.includes(k))) return false;
          if (keys.join() === "projectId") return false;
        }
        if (
          c.target === "project.create" &&
          keys.every((k) => PROJECT_FIELDS.includes(k)) &&
          a.data.businessId === row.businessId
        ) {
          return false;
        }
        return true;
      })
      .map((c) => `${c.target} ${JSON.stringify(c.args)}`);

  const decisionWrites = () =>
    calls.filter(
      (c) =>
        c.target === "quote.update" &&
        Object.keys(c.args[0]?.data ?? {}).includes("status") &&
        c.args[0]?.where?.id === row.id,
    );

  return { client, calls, violations, decisionWrites };
}

describe("QuotesService.decideByShareToken — the whole write set", () => {
  const cases: Array<["ACCEPT" | "DECLINE", string | undefined]> = [
    ["ACCEPT", undefined],
    ["DECLINE", "Too expensive right now"],
  ];

  for (const [decision, reason] of cases) {
    it(`writes nothing outside the allowed set on ${decision}`, async () => {
      const prev = process.env.RESEND_API_KEY;
      // Set so notifyDecision runs its whole body rather than returning early —
      // a write hidden after that early return would otherwise go unobserved.
      process.env.RESEND_API_KEY = "test-key";
      try {
        const db = recordingPrisma({ status: QuoteStatus.SENT });
        const svc = new QuotesService(db.client, {} as any, {} as any);
        await svc.decideByShareToken("tok", decision, "Marcia", reason);

        // The recorder found its subject: the decision write itself, once.
        expect(db.decisionWrites()).toHaveLength(1);
        // ...and the notification path was actually walked.
        expect(db.calls.some((c) => c.target === "business.findUnique")).toBe(true);
        if (decision === "ACCEPT") {
          expect(db.calls.some((c) => c.target === "project.create")).toBe(true);
        }

        expect(db.violations()).toEqual([]);
      } finally {
        if (prev === undefined) delete process.env.RESEND_API_KEY;
        else process.env.RESEND_API_KEY = prev;
      }
    });
  }
});
