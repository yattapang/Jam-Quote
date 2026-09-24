/**
 * CORE: rate-limit — how often an unauthenticated caller may ask.
 *
 * Owns:        the token-bucket rule, and the one atomic statement that enforces it.
 * Trusted by:  sign-in today; registration, password reset and anything costly next.
 * Never does:  store an email address, or tell the caller anything about an account.
 *
 * WHY THIS EXISTS AT ALL
 *
 * Sign-in costs about 67 MB and 150 ms by design (ADR 0014) and is reachable without
 * credentials. That is a lever: a few hundred concurrent sign-in attempts would
 * exhaust a 512 MB instance without guessing a single password. The expensive hash
 * that protects the passwords is also what makes the endpoint worth protecting.
 *
 * WHY A TOKEN BUCKET RATHER THAN A FIXED WINDOW
 *
 * A fixed window ("5 per minute") allows ten attempts across a window boundary —
 * five at 11:59:59 and five at 12:00:00 — which is exactly when a script will arrive.
 * A token bucket refills continuously, so there is no boundary to aim at, and it
 * permits a small honest burst (a person mistyping twice) while still converging on
 * the long-run rate.
 *
 * WHY ONE SQL STATEMENT
 *
 * Read-then-write would let two concurrent requests both read "1 token left" and both
 * spend it. The refill, the check and the decrement happen in a single
 * INSERT … ON CONFLICT … WHERE, so concurrent callers serialise on the row and the
 * limit holds. There is a test that fires many requests at once and asserts exactly
 * the capacity is granted — without it, this claim would be a comment.
 */
import { createHash } from "node:crypto";

/** What a limiter is asked. `cost` is in tokens; most callers spend one. */
export interface RateLimitRule {
  /** The most tokens the bucket can hold — the size of an allowed burst. */
  readonly capacity: number;
  /** How fast it refills, in tokens per second. `capacity / windowSeconds` for a rate. */
  readonly refillPerSecond: number;
}

export type RateLimitDecision =
  | { readonly allowed: true; readonly tokensLeft: number }
  | { readonly allowed: false; readonly retryAfterSeconds: number };

export interface RateLimiter {
  consume(key: string, rule: RateLimitRule, cost?: number): Promise<RateLimitDecision>;
  /** Puts a bucket back to full. Used when a legitimate action succeeds. */
  reset(key: string): Promise<void>;
}

/**
 * The rules, in one place so they can be reviewed as a set rather than found one at a
 * time. Numbers are deliberately conservative: a locked-out contractor phones us, and
 * that is a cheaper failure than an exhausted instance or a guessed password.
 */
export const RATE_LIMITS = {
  /**
   * Per email address. Ten attempts, refilling one every thirty seconds.
   *
   * Tuned for a real person who has forgotten which password they used: several tries
   * in a row are fine, a script grinding through a wordlist is not. Reset on a
   * successful sign-in, so yesterday's fumbling never counts against today.
   */
  signInPerEmail: { capacity: 10, refillPerSecond: 1 / 30 },

  /**
   * Per IP address. Higher, because an office, a phone network or a shared connection
   * legitimately puts several people behind one address — but far below what it takes
   * to exhaust the instance.
   */
  signInPerIp: { capacity: 30, refillPerSecond: 1 / 10 },
} as const satisfies Record<string, RateLimitRule>;

/**
 * Builds the key for an email-dimension limit.
 *
 * The address is HASHED. Storing it would turn this table into a list of every email
 * anyone has ever typed into our login form — personal data we have no reason to hold
 * (Rule 5), and a mailing list for whoever gets a dump. The hash is unsalted, so it is
 * reversible by guessing a known address; it defeats casual disclosure, not a
 * determined attacker, and that limit is stated rather than implied.
 */
export function emailKey(action: string, normalisedEmail: string): string {
  const digest = createHash("sha256").update(normalisedEmail).digest("hex");
  return `${action}:email:${digest}`;
}

export function ipKey(action: string, ip: string): string {
  return `${action}:ip:${ip}`;
}

/**
 * Thrown when a caller asks for something the limiter cannot honestly enforce.
 *
 * A programming error, not a caller error: it means the code asked for a limit that does not
 * limit. Loud and immediate beats a bucket that quietly grants everything.
 */
export class InvalidRateLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidRateLimitError";
  }
}

/**
 * F9 (independent review, 2026-09-24): `consume` validated neither the cost nor the rule, and a
 * cost of ZERO was granted 1000 times out of 1000 on an exhausted bucket — because spending
 * nothing always succeeds. A fractional cost multiplies the capacity by the same logic.
 *
 * Nothing reaches it with a bad value today, and the limiter's own tests never passed a cost at
 * all, so this was a hole waiting for its first caller. Validated here rather than at the call
 * sites, because the guarantee belongs to the limiter.
 */
function assertUsableCost(cost: number, rule: RateLimitRule): void {
  if (!Number.isFinite(cost) || cost <= 0) {
    throw new InvalidRateLimitError(
      `A rate-limit cost must be a positive number; got ${cost}. Spending zero or less always ` +
        `succeeds, which is a limiter that does not limit.`,
    );
  }
  if (cost > rule.capacity) {
    // Otherwise the caller is refused forever: the bucket can never hold enough, so the refusal
    // is permanent and `retryAfterSeconds` is a promise that will not come true.
    throw new InvalidRateLimitError(
      `A cost of ${cost} can never be paid from a bucket of capacity ${rule.capacity}, so this ` +
        `caller would be refused forever.`,
    );
  }
}

function assertUsableRule(rule: RateLimitRule): void {
  if (!Number.isFinite(rule.capacity) || rule.capacity <= 0) {
    throw new InvalidRateLimitError(`A rate-limit capacity must be positive; got ${rule.capacity}.`);
  }
  if (!Number.isFinite(rule.refillPerSecond) || rule.refillPerSecond <= 0) {
    // A zero refill is a permanent lockout once the bucket empties, with no way back.
    throw new InvalidRateLimitError(
      `A refill rate must be positive; got ${rule.refillPerSecond}. A bucket that never refills ` +
        `locks the caller out permanently.`,
    );
  }
}

/** The narrow query surface this needs. Structural, as elsewhere in core. */
export interface RateLimitStore {
  $queryRawUnsafe<T>(query: string, ...values: unknown[]): Promise<T[]>;
  $executeRawUnsafe(query: string, ...values: unknown[]): Promise<number>;
}

interface ConsumeRow {
  tokens: number;
}

interface PeekRow {
  tokens: number;
}

export class PostgresRateLimiter implements RateLimiter {
  constructor(
    private readonly db: RateLimitStore,
    /**
     * Injected, and passed INTO the SQL rather than using now(): a test must be able
     * to move time forward to prove refill, and a limiter whose refill is only
     * observable by sleeping is a limiter nobody tests properly.
     */
    private readonly now: () => Date = () => new Date(),
  ) {}

  async consume(key: string, rule: RateLimitRule, cost = 1): Promise<RateLimitDecision> {
    assertUsableRule(rule);
    assertUsableCost(cost, rule);

    const at = this.now().toISOString();

    // One statement. The refill expression appears twice — once to compute the new
    // value, once in the WHERE that decides whether there was enough — because
    // Postgres has no way to name it in an ON CONFLICT UPDATE. Duplicated
    // deliberately, and the two copies must stay identical; the concurrency test is
    // what notices if they drift.
    const refilled = `LEAST(
        $2::double precision,
        rate_limit_bucket.tokens
          + GREATEST(0, EXTRACT(EPOCH FROM ($4::timestamptz - rate_limit_bucket.updated_at)))
            * $3::double precision
      )`;

    const rows = await this.db.$queryRawUnsafe<ConsumeRow>(
      `INSERT INTO rate_limit_bucket (key, tokens, updated_at)
       VALUES ($1, $2::double precision - $5::double precision, $4::timestamptz)
       ON CONFLICT (key) DO UPDATE
         SET tokens = ${refilled} - $5::double precision,
             updated_at = $4::timestamptz
         WHERE ${refilled} >= $5::double precision
       RETURNING tokens`,
      key,
      rule.capacity,
      rule.refillPerSecond,
      at,
      cost,
    );

    const row = rows[0];
    if (row) return { allowed: true, tokensLeft: Math.max(0, row.tokens) };

    // No row came back, so the WHERE refused: the bucket did not hold `cost`. Read it
    // to say how long until it will. This is a second statement, but only on the
    // refused path, where an extra query is not the bottleneck.
    const peek = await this.db.$queryRawUnsafe<PeekRow>(
      `SELECT LEAST(
                $2::double precision,
                tokens + GREATEST(0, EXTRACT(EPOCH FROM ($3::timestamptz - updated_at)))
                         * $4::double precision
              ) AS tokens
         FROM rate_limit_bucket
        WHERE key = $1`,
      key,
      rule.capacity,
      at,
      rule.refillPerSecond,
    );

    const available = peek[0]?.tokens ?? 0;
    const shortfall = Math.max(0, cost - available);
    // Rounded up, and never zero: telling a caller to retry in 0 seconds invites a
    // tight loop, which is the thing being prevented.
    const retryAfterSeconds = Math.max(1, Math.ceil(shortfall / rule.refillPerSecond));

    return { allowed: false, retryAfterSeconds };
  }

  /**
   * Refills a bucket completely, by deleting it — an absent bucket is a full one, so
   * this needs no knowledge of the rule that was being applied.
   *
   * Called when the thing being limited SUCCEEDS. Without it, a contractor who
   * mistypes their password six times and then gets it right would carry those six
   * failures for three minutes, which teaches people the product is broken.
   */
  async reset(key: string): Promise<void> {
    await this.db.$executeRawUnsafe(`DELETE FROM rate_limit_bucket WHERE key = $1`, key);
  }
}
