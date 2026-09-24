/**
 * Does the limiter hold — including when requests arrive at the same moment?
 *
 * Against real Postgres, because the entire correctness claim is about one atomic SQL
 * statement. A mocked store would happily agree with whatever the code believes, and
 * the interesting failure — two concurrent callers both spending the last token — is
 * invisible without a database that actually locks rows.
 *
 * Time is injected rather than slept, so refill is proved in milliseconds and the
 * result is deterministic. A limiter whose refill can only be observed by waiting is a
 * limiter nobody tests properly.
 *
 * WHAT IT DOES NOT PROVE
 *
 * - NOT true multi-connection contention. PGlite is a single connection and serialises
 *   queries, so the concurrency test below proves the STATEMENT grants exactly the
 *   capacity for interleaved calls — it does not prove two Postgres backends racing for
 *   the same row. The argument for that is the statement's shape (one
 *   INSERT … ON CONFLICT, so the row lock does the serialising) plus Postgres's own
 *   guarantees, not this test. Overstating it would be worse than omitting it.
 * - Nothing about limits across several API instances, beyond the state being shared at
 *   all — which is the argument for putting it here rather than in memory.
 * - Nothing about an attacker rotating IP addresses. That is what the per-email
 *   dimension is for, and neither dimension stops a large botnet with many addresses;
 *   that needs upstream help and is stated in ADR 0016 rather than pretended away.
 * - Nothing about cleaning up old rows. An absent bucket is a full one, so nothing
 *   breaks — but the table grows until housekeeping exists, which is owed.
 */
import { APP_ROLE, applyMigrations } from "@pryvis/db/test-support";
import { PGlite } from "@electric-sql/pglite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  InvalidRateLimitError,
  PostgresRateLimiter,
  type RateLimitStore,
  emailKey,
  ipKey,
} from "./rate-limiter.js";

/** Three tokens, refilling one per second — small numbers make the arithmetic legible. */
const RULE = { capacity: 3, refillPerSecond: 1 } as const;

let db: PGlite;
let clock: Date;
let limiter: PostgresRateLimiter;

function store(pg: PGlite): RateLimitStore {
  return {
    async $queryRawUnsafe<T>(query: string, ...values: unknown[]) {
      return (await pg.query<T>(query, values)).rows;
    },
    async $executeRawUnsafe(query: string, ...values: unknown[]) {
      return (await pg.query(query, values)).affectedRows ?? 0;
    },
  };
}

beforeEach(async () => {
  db = new PGlite();
  // F12: this suite used to replay the migrations by hand and create NO unprivileged role, so the
  // limiter was the one subject never exercised as the identity the policies are written for.
  // Nobody noticed, because the file looked correct on its own.
  await applyMigrations(db);
  await db.exec(`SET ROLE ${APP_ROLE};`);
  clock = new Date("2026-09-23T12:00:00.000Z");
  limiter = new PostgresRateLimiter(store(db), () => clock);
});

afterEach(async () => {
  await db.close();
});

function advance(seconds: number) {
  clock = new Date(clock.getTime() + seconds * 1000);
}

describe("spending tokens", () => {
  it("allows up to the capacity, then refuses", async () => {
    for (let attempt = 1; attempt <= RULE.capacity; attempt += 1) {
      const decision = await limiter.consume("k", RULE);
      expect(decision.allowed, `attempt ${attempt}`).toBe(true);
    }

    const refused = await limiter.consume("k", RULE);
    expect(refused.allowed).toBe(false);
  });

  it("says how long to wait, and never says zero", async () => {
    // Zero would invite a tight retry loop, which is the thing being prevented.
    for (let i = 0; i < RULE.capacity; i += 1) await limiter.consume("k", RULE);

    const refused = await limiter.consume("k", RULE);
    expect(refused.allowed).toBe(false);
    if (refused.allowed) return;
    expect(refused.retryAfterSeconds).toBeGreaterThanOrEqual(1);
  });

  it("reports the tokens left, so a caller can warn before it bites", async () => {
    const first = await limiter.consume("k", RULE);
    expect(first).toEqual({ allowed: true, tokensLeft: 2 });
  });
});

describe("refilling", () => {
  it("grants another attempt once enough time has passed", async () => {
    for (let i = 0; i < RULE.capacity; i += 1) await limiter.consume("k", RULE);
    expect((await limiter.consume("k", RULE)).allowed).toBe(false);

    advance(1);

    expect((await limiter.consume("k", RULE)).allowed).toBe(true);
    // And only one: the refill is a rate, not a reset.
    expect((await limiter.consume("k", RULE)).allowed).toBe(false);
  });

  it("never refills beyond the capacity, however long the wait", async () => {
    // Without the LEAST(), a bucket left alone for a day would grant a day's worth of
    // attempts at once — which is precisely the burst a limiter exists to prevent.
    await limiter.consume("k", RULE);
    advance(86_400);

    for (let i = 0; i < RULE.capacity; i += 1) {
      expect((await limiter.consume("k", RULE)).allowed, `attempt ${i + 1}`).toBe(true);
    }
    expect((await limiter.consume("k", RULE)).allowed).toBe(false);
  });

  it("is not fooled by a clock that goes backwards", async () => {
    // Clocks do move backwards — NTP corrections, a host migration. A negative gap
    // must refill nothing rather than DRAINING the bucket or granting attempts.
    await limiter.consume("k", RULE);
    clock = new Date(clock.getTime() - 60_000);

    expect((await limiter.consume("k", RULE)).allowed).toBe(true);
    expect((await limiter.consume("k", RULE)).allowed).toBe(true);
    expect((await limiter.consume("k", RULE)).allowed).toBe(false);
  });
});

describe("keys are independent", () => {
  it("limits one key without touching another", async () => {
    for (let i = 0; i < RULE.capacity; i += 1) await limiter.consume("a", RULE);

    expect((await limiter.consume("a", RULE)).allowed).toBe(false);
    expect((await limiter.consume("b", RULE)).allowed).toBe(true);
  });

  it("builds distinct keys per dimension, and does not store the email", async () => {
    const key = emailKey("signin", "owner@example.com");

    expect(key).not.toContain("owner@example.com");
    expect(key).not.toContain("example");
    expect(key).toMatch(/^signin:email:[0-9a-f]{64}$/);
    expect(key).not.toBe(emailKey("signin", "someone.else@example.com"));
    expect(ipKey("signin", "203.0.113.4")).toBe("signin:ip:203.0.113.4");
  });
});

describe("concurrency", () => {
  it("grants exactly the capacity when every request arrives at once", async () => {
    // Read-then-write would let several of these read "1 token left" and all spend it,
    // so the limit would be whatever the concurrency happened to be. This also notices
    // if the refill expression in the UPDATE and the one in the WHERE drift apart.
    //
    // HONEST LIMIT: PGlite serialises on one connection, so this proves the statement
    // is correct under interleaving, not that two Postgres backends cannot race. The
    // defence against that is the statement's shape — a single INSERT … ON CONFLICT,
    // where the row lock does the serialising.
    const attempts = 20;
    const decisions = await Promise.all(
      Array.from({ length: attempts }, () => limiter.consume("burst", RULE)),
    );

    const allowed = decisions.filter((d) => d.allowed).length;
    expect(allowed).toBe(RULE.capacity);
    expect(decisions.length - allowed).toBe(attempts - RULE.capacity);
  });
});

describe("a cost or rule the limiter cannot honour", () => {
  it("refuses a zero cost, which always succeeds and therefore limits nothing (F9)", async () => {
    // The reviewer's finding, executed: on an exhausted capacity-3 bucket, consume(key, rule, 0)
    // was allowed 1000 times out of 1000, because spending nothing always succeeds. The limiter's
    // own tests never passed a cost at all, so this waited for its first caller.
    for (let i = 0; i < RULE.capacity; i += 1) await limiter.consume("k", RULE);
    expect((await limiter.consume("k", RULE)).allowed).toBe(false);

    await expect(limiter.consume("k", RULE, 0)).rejects.toThrow(InvalidRateLimitError);
    await expect(limiter.consume("k", RULE, -5)).rejects.toThrow(InvalidRateLimitError);
    await expect(limiter.consume("k", RULE, Number.NaN)).rejects.toThrow(InvalidRateLimitError);
  });

  it("refuses a cost larger than the bucket can ever hold", async () => {
    // Otherwise the caller is refused forever and told to retry at a time that will never come.
    await expect(limiter.consume("k", RULE, RULE.capacity + 1)).rejects.toThrow(
      InvalidRateLimitError,
    );
  });

  it("allows a fractional cost only when it is positive and payable", async () => {
    // Fractions are legitimate — a cheap operation costing half a token — but 0.0 is not, and the
    // bucket's arithmetic is fractional by design.
    const decision = await limiter.consume("fractional", { ...RULE }, 0.5);
    expect(decision).toEqual({ allowed: true, tokensLeft: 2.5 });
  });

  it("refuses a rule that is not a limit", async () => {
    // A zero refill is a permanent lockout with no way back; a zero capacity refuses everything
    // forever. Both are programming errors, and both used to be accepted silently.
    await expect(
      limiter.consume("k", { capacity: 0, refillPerSecond: 1 }),
    ).rejects.toThrow(InvalidRateLimitError);
    await expect(
      limiter.consume("k", { capacity: 3, refillPerSecond: 0 }),
    ).rejects.toThrow(InvalidRateLimitError);
  });
});

describe("reset", () => {
  it("puts a bucket back to full", async () => {
    // Called when the limited action SUCCEEDS, so yesterday's fumbling never counts
    // against today.
    for (let i = 0; i < RULE.capacity; i += 1) await limiter.consume("k", RULE);
    expect((await limiter.consume("k", RULE)).allowed).toBe(false);

    await limiter.reset("k");

    for (let i = 0; i < RULE.capacity; i += 1) {
      expect((await limiter.consume("k", RULE)).allowed).toBe(true);
    }
  });

  it("is harmless on a bucket that does not exist", async () => {
    await expect(limiter.reset("never-seen")).resolves.toBeUndefined();
  });
});
