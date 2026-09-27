/**
 * No sequence of financial writes can leave an issue stuck, or above its ceiling.
 *
 * ## WHY THIS FILE EXISTS
 *
 * Every other test in this package asserts one scenario someone thought of. K6 of the J4 re-review
 * was a scenario nobody thought of: revision 1 accepted, revision 2 accepted and invoiced, revision 3
 * sealed — and revision 2's ceiling fell to 0 with money still invoiced against it, so every later
 * write on it raised. The J4 design had claimed that no stuck state could be entered. Each unit test
 * was right on its own terms; the defect lived in a SEQUENCE. It was found by a random walk over the
 * writes, and this file is that walk, committed so the claim is executed rather than asserted.
 *
 * ## WHAT IT DOES
 *
 * For each run: a fresh quote, then sixteen writes chosen by a seeded generator — seal a revision,
 * accept, invoice, credit, void, record a variation (negative ones included), withdraw — each in its
 * own transaction, refusals expected and ignored. Afterwards, for every issue with a balance row:
 *
 *   * `issue_balance_apply()` must succeed. If it raises with nothing new written, every future write
 *     on that issue raises too: that is the definition of stuck.
 *   * the invoiced figure must not exceed the ceiling (PRD R1.24), at rest.
 *
 * The generator is deterministic (a fixed-seed linear congruential sequence), so a failure reproduces
 * exactly, and it is biased towards the newest revision because that is where the states that matter
 * are made.
 *
 * ## HOW IT WAS PROVED (Rule 1.5)
 *
 * With K6's fix reverted (the guard back to the first accepted revision), seed 1 found 7 stuck issues
 * and seed 2 found 8, each also above its ceiling; with the fix, 0. **It does NOT catch K6's twin** (a
 * variation on a superseded revision): that leaves a quote that can never be revised again, which is
 * neither stuck nor over the ceiling. The twin is held by its own test in `documents-core.test.ts`.
 *
 * ## WHAT THIS DOES NOT PROVE (Rule 21.4)
 *
 * - **Only the sequences the generator reaches.** A random walk is not exhaustive. The counts it
 *   asserts below are there so a generator that quietly stops reaching accepted, invoiced issues
 *   fails instead of passing on nothing.
 * - **Not concurrency.** Writes are serial on one PGlite connection.
 * - **One tenant, small amounts, no declines and no issue numbering.** A defect that needs a
 *   declined acceptance or a numbered issue is outside this walk.
 */
import { APP_ROLE, applyMigrations, asSuperuser } from "@pryvis/db/test-support";
import { PGlite } from "@electric-sql/pglite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const TENANT = "11111111-1111-4111-8111-111111111111";
const USER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CLIENT = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

const RUNS = 120;
const WRITES_PER_RUN = 16;

let db: PGlite;
let ids: number;

function id(): string {
  ids += 1;
  return `f0000000-0000-4000-8000-${String(ids).padStart(12, "0")}`;
}

async function sql<T = Record<string, unknown>>(query: string, params: unknown[] = []) {
  return (await db.query<T>(query, params)).rows;
}

/** One write, in its own transaction. A refusal is an expected outcome, not a failure. */
async function attempt(work: () => Promise<unknown>): Promise<boolean> {
  await db.exec("BEGIN");
  try {
    await work();
    await db.exec("COMMIT");
    return true;
  } catch {
    await db.exec("ROLLBACK");
    return false;
  }
}

beforeEach(async () => {
  ids = 0;
  db = new PGlite();
  await applyMigrations(db);
  await db.query(
    `INSERT INTO tenant (id, name, country_code, currency, updated_at)
     VALUES ($1, 'Delroy Construction', 'JM', 'JMD', now())`,
    [TENANT],
  );
  await db.query(
    `INSERT INTO app_user (id, tenant_id, email, role, session_version, updated_at)
     VALUES ($1, $2, 'delroy@example.com', 'owner', 0, now())`,
    [USER, TENANT],
  );
  await db.query(
    `INSERT INTO client (id, tenant_id, name, updated_at) VALUES ($1, $2, 'A Client', now())`,
    [CLIENT, TENANT],
  );
  await db.exec(`SET ROLE ${APP_ROLE};`);
  await db.query(`SELECT set_config('app.tenant_id', $1, false)`, [TENANT]);
});

afterEach(async () => {
  await db.close();
});

/** Runs the walk for one seed and returns what it examined and what it found. */
async function walk(seed: number) {
  let state = seed;
  const next = (n: number) => {
    state = (state * 1103515245 + 12345) % 2147483648;
    return Math.floor(state / 65536) % n;
  };

  let succeeded = 0;
  let examined = 0;
  let invoicedIssues = 0;
  const stuck: string[] = [];
  const overCeiling: string[] = [];

  for (let run = 0; run < RUNS; run++) {
    const quote = id();
    await asSuperuser(db, () =>
      sql(
        `INSERT INTO quote (id, tenant_id, client_id, title, currency, updated_at)
         VALUES ($1, $2, $3, 'Fence', 'JMD', now())`,
        [quote, TENANT, CLIENT],
      ),
    );
    const issues: string[] = [];
    const invoices: string[] = [];
    const acceptances: string[] = [];
    let revision = 0;

    for (let write = 0; write < WRITES_PER_RUN; write++) {
      const issue = issues.length
        ? issues[issues.length - 1 - (next(3) === 0 ? next(issues.length) : 0)]!
        : "";
      const op = issues.length ? next(10) : 0;
      let ok = false;

      if (op <= 1) {
        const issueId = id();
        const total = String(50 + next(100));
        revision += 1;
        ok = await attempt(() =>
          sql(
            `INSERT INTO quote_issue
               (id, tenant_id, quote_id, revision, client_id, client_name, title, client_detail_level,
                currency, terms_text, tax_rate_basis_points, subtotal_minor, tax_minor, total_minor,
                sealed_at, sealed_by_user_id, catalog_synced_at)
             VALUES ($1, $2, $3, $4, $5, 'Delroy', 'Fence', 'itemised', 'JMD', 'Terms', 0, $6, 0, $6,
                     now(), $7, now())`,
            [issueId, TENANT, quote, revision, CLIENT, total, USER],
          ),
        );
        if (ok) issues.push(issueId);
      } else if (op <= 3) {
        const acceptanceId = id();
        ok = await attempt(async () => {
          await sql(
            `INSERT INTO acceptance (id, tenant_id, issue_id, outcome, signer_name, consented_to_sign,
                                     occurred_at)
             VALUES ($1, $2, $3, 'accepted', 'A Client', true, now())`,
            [acceptanceId, TENANT, issue],
          );
          await sql(`SELECT issue_balance_open($1)`, [issue]);
        });
        if (ok) acceptances.push(acceptanceId);
      } else if (op <= 5) {
        const invoiceId = id();
        ok = await attempt(() =>
          sql(
            `INSERT INTO invoice (id, tenant_id, issue_id, kind, amount_minor, currency, issued_at)
             VALUES ($1, $2, $3, 'progress', $4, 'JMD', now())`,
            [invoiceId, TENANT, issue, String(1 + next(80))],
          ),
        );
        if (ok) invoices.push(invoiceId);
      } else if (op === 6 && invoices.length) {
        ok = await attempt(() =>
          sql(
            `INSERT INTO credit_note (id, tenant_id, invoice_id, amount_minor, reason, issued_at)
             VALUES ($1, $2, $3, $4, 'walk', now())`,
            [id(), TENANT, invoices[next(invoices.length)], String(1 + next(60))],
          ),
        );
      } else if (op === 7 && invoices.length) {
        ok = await attempt(() =>
          sql(
            `INSERT INTO invoice_void (id, tenant_id, invoice_id, reason, voided_by_user_id)
             VALUES ($1, $2, $3, 'walk', $4)`,
            [id(), TENANT, invoices[next(invoices.length)], USER],
          ),
        );
      } else if (op === 8) {
        ok = await attempt(() =>
          sql(
            `INSERT INTO variation (id, tenant_id, issue_id, description, amount_minor,
                                    recorded_by_user_id, occurred_at)
             VALUES ($1, $2, $3, 'walk', $4, $5, now())`,
            [id(), TENANT, issue, String(next(80) - 40), USER],
          ),
        );
      } else if (op === 9 && acceptances.length) {
        ok = await attempt(() =>
          sql(
            `INSERT INTO acceptance_withdrawal (id, tenant_id, acceptance_id, reason,
                                                withdrawn_by_user_id)
             VALUES ($1, $2, $3, 'walk', $4)`,
            [id(), TENANT, acceptances[next(acceptances.length)], USER],
          ),
        );
      }
      if (ok) succeeded += 1;
    }

    for (const issue of issues) {
      if ((await sql(`SELECT 1 FROM issue_balance WHERE issue_id = $1`, [issue])).length === 0) continue;
      examined += 1;
      if (!(await attempt(() => sql(`SELECT issue_balance_apply($1)`, [issue])))) stuck.push(issue);
      const [row] = await sql<{ invoiced: string; ceiling: string }>(
        `SELECT b.invoiced_total_minor AS invoiced, issue_ceiling_minor($1) AS ceiling
           FROM issue_balance b WHERE b.issue_id = $1`,
        [issue],
      );
      if (Number(row!.invoiced) > 0) invoicedIssues += 1;
      if (Number(row!.invoiced) > Number(row!.ceiling)) overCeiling.push(issue);
    }
  }

  return { succeeded, examined, invoicedIssues, stuck, overCeiling };
}

describe("K6 · no sequence of financial writes leaves an issue stuck or above its ceiling", () => {
  for (const seed of [1, 2]) {
    it(`seed ${seed}: ${RUNS} runs of ${WRITES_PER_RUN} writes`, async () => {
      const result = await walk(seed);

      // The set examined, asserted so a generator that stops reaching the interesting states fails
      // rather than passing on nothing (Rule 21.1). Measured on 2026-09-27 across both seeds, with and
      // without the K6 fix: 877-914 successful writes, 194-211 issues examined, 50-55 of them with money
      // invoiced. The floors sit well below that so they fail on a broken generator, not on noise — the
      // first version put the last one at 50 and a K6 plant turned it red for the wrong reason.
      expect(result.succeeded).toBeGreaterThan(600);
      expect(result.examined).toBeGreaterThan(150);
      expect(result.invoicedIssues).toBeGreaterThan(35);

      expect(result.stuck).toEqual([]);
      expect(result.overCeiling).toEqual([]);
    }, 180_000);
  }
});
