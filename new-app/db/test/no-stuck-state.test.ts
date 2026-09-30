/**
 * No sequence of financial writes can leave an issue stuck, above its ceiling, or wrongly totalled.
 *
 * ## WHY THIS FILE EXISTS
 *
 * Every other test in this package asserts one scenario someone thought of. K6 of the J4 re-review
 * was a scenario nobody thought of: revision 1 accepted, revision 2 accepted and invoiced, revision 3
 * sealed — and revision 2's ceiling fell to 0 with money still invoiced against it. Each unit test was
 * right on its own terms; the defect lived in a SEQUENCE. It was found by a random walk over the
 * writes, and this file is that walk, committed so the claim is executed rather than asserted.
 *
 * ## THE ORACLE IS INDEPENDENT OF THE CODE UNDER TEST (finding L3)
 *
 * The first version judged its results with `issue_balance_apply()` and `issue_ceiling_minor()` — the
 * functions it was testing. The second re-review planted credits subtracted twice (150,000 billed
 * against a 100,000 ceiling) and the original J10 defect (230,000 of live ceiling on one quote): both
 * left it green. So each issue is now re-derived HERE, in TypeScript, from the raw rows — which
 * invoices count, what their credits and voids do, whether the issue is superseded or withdrawn, and
 * what its ceiling is — and the database's functions and cached balance must agree with that, and
 * with PRD R1.24 (net billed never above the ceiling), and J10 (at most one live ceiling per quote).
 *
 * This is a second implementation of the rules in `issue_balance_apply()` and `issue_ceiling_minor()`,
 * deliberately. Two implementations that disagree is the finding; the risk is that both are wrong the
 * same way. Where each rule comes from, honestly (finding N8): supersession, withdrawal and the ceiling
 * are from the PRD's words (R1.15, R1.15c, R1.22b, R1.24); the netting of credits and voids is from
 * `docs/design/scope-reduction.md` §3 — the PRD delegates it to `issue_balance_apply()` and does not
 * state it — and the per-invoice floor at zero is K1's decision in that design, which the SQL also
 * implements. So a defect in the design's netting rule would be shared by both, and is not caught.
 *
 * ## WHAT IT DOES
 *
 * For each run: a fresh quote, then sixteen writes chosen by a seeded generator — seal a revision (half
 * of them with 15% tax, so a ceiling that dropped the tax would disagree; finding N6), accept, invoice,
 * credit part of an invoice, credit ALL that is left on one, void, record a variation (negative ones
 * included), withdraw, and the whole wrong-document remedy (fully credit every invoice on an accepted
 * issue, then withdraw it; findings N7, K4, L1) — each write in its own transaction, refusals expected.
 * Afterwards, every issue with a balance row must:
 *
 *   * let `issue_balance_apply()` run. If it raises with nothing new written, every future write on the
 *     issue raises too: that is the definition of stuck;
 *   * have `issue_ceiling_minor()` and the cached balance equal to the oracle's figures;
 *   * have net billed at or below the oracle's ceiling.
 *
 * The generator is deterministic (a fixed-seed linear congruential sequence), so a failure reproduces
 * exactly, and biased towards the newest revision because that is where the states that matter are made.
 *
 * ## HOW IT WAS PROVED (Rule 1.5)
 *
 * Planted, each on the live migration, each restored byte-identical: the K6 guard picking the earliest
 * revision instead of the live one; credits subtracted twice (L3's W2); supersession removed from the
 * ceiling (L3's W1, the original J10 defect). The commit that added the oracle records the results.
 * **It does NOT catch K6's twin** (a variation on a superseded revision): the only harm left from that
 * is a quote the guard wrongly blocks, which is neither stuck nor mis-totalled. The twin and L2 are held
 * by their own tests in `documents-core.test.ts`.
 *
 * ## WHAT THIS DOES NOT PROVE (Rule 21.4)
 *
 * - **Only the sequences the generator reaches.** A random walk is not exhaustive. The counts it asserts
 *   below are there so a generator that quietly stops reaching the interesting states fails instead of
 *   passing on nothing — including withdrawal after money has moved, which the first version reached zero
 *   times (L3).
 * - **Not concurrency.** Writes are serial on one PGlite connection.
 * - **One tenant, small amounts, no declines and no issue numbering.** A defect that needs a declined
 *   acceptance or a numbered issue is outside this walk.
 * - **Not the locks.** One connection cannot race; `concurrency.pg.test.ts` does that against real
 *   PostgreSQL.
 * - **Not a defect both implementations share.** If the PRD's rule itself is wrong, both agree.
 */
import { APP_ROLE, applyMigrations, asSuperuser } from "@pryvis/db/test-support";
import { PGlite } from "@electric-sql/pglite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const TENANT = "11111111-1111-4111-8111-111111111111";
const USER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CLIENT = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

const RUNS = 200;
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

/**
 * The oracle: one issue's figures, derived from raw rows by the PRD's rules, sharing no SQL with the
 * functions under test.
 *
 * - Net billed (R1.24, R1.25): each invoice not voided counts its amount less its credit notes, never
 *   below zero.
 * - Ceiling (R1.22b, R1.15c, R1.15): 0 if a later revision of the quote exists (superseded) or no
 *   accepted, un-withdrawn acceptance exists; otherwise the issue's sealed total plus every recorded
 *   variation.
 */
async function oracle(issueId: string) {
  const [issue] = await sql<{ quote_id: string; revision: number; total_minor: string }>(
    `SELECT quote_id, revision, total_minor FROM quote_issue WHERE id = $1`,
    [issueId],
  );
  const siblings = await sql<{ revision: number }>(
    `SELECT revision FROM quote_issue WHERE quote_id = $1`,
    [issue!.quote_id],
  );
  const superseded = siblings.some((s) => s.revision > issue!.revision);

  const acceptances = await sql<{ id: string; outcome: string }>(
    `SELECT id, outcome FROM acceptance WHERE issue_id = $1`,
    [issueId],
  );
  const withdrawn = new Set(
    (await sql<{ acceptance_id: string }>(`SELECT acceptance_id FROM acceptance_withdrawal`)).map(
      (w) => w.acceptance_id,
    ),
  );
  const live = acceptances.some((a) => a.outcome === "accepted" && !withdrawn.has(a.id));

  const variations = (
    await sql<{ amount_minor: string }>(`SELECT amount_minor FROM variation WHERE issue_id = $1`, [issueId])
  ).reduce((sum, v) => sum + Number(v.amount_minor), 0);

  const invoices = await sql<{ id: string; amount_minor: string }>(
    `SELECT id, amount_minor FROM invoice WHERE issue_id = $1`,
    [issueId],
  );
  const voided = new Set(
    (await sql<{ invoice_id: string }>(`SELECT invoice_id FROM invoice_void`)).map((v) => v.invoice_id),
  );
  const credits = await sql<{ invoice_id: string; amount_minor: string }>(
    `SELECT invoice_id, amount_minor FROM credit_note`,
  );
  let billed = 0;
  for (const inv of invoices) {
    if (voided.has(inv.id)) continue;
    const credited = credits
      .filter((c) => c.invoice_id === inv.id)
      .reduce((sum, c) => sum + Number(c.amount_minor), 0);
    billed += Math.max(0, Number(inv.amount_minor) - credited);
  }

  const ceiling = superseded || !live ? 0 : Number(issue!.total_minor) + variations;
  return { ceiling, billed, variations, invoiceCount: invoices.length };
}

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
  let fullCredits = 0;
  let withdrawalsAfterMoney = 0;
  let wrongDocumentWithdrawals = 0;
  let wrongDocumentWithVariation = 0;
  let taxedAcceptances = 0;
  const stuck: string[] = [];
  const disagreements: string[] = [];
  const overCeiling: string[] = [];
  const twoLiveCeilings: string[] = [];

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
    const acceptances: { id: string; issue: string }[] = [];
    let revision = 0;

    for (let write = 0; write < WRITES_PER_RUN; write++) {
      const issue = issues.length
        ? issues[issues.length - 1 - (next(3) === 0 ? next(issues.length) : 0)]!
        : "";
      const op = issues.length ? next(12) : 0;
      let ok = false;

      if (op <= 1) {
        const issueId = id();
        const subtotal = 50 + next(100);
        const taxed = next(2) === 0;
        const tax = taxed ? Math.floor((subtotal * 15) / 100) : 0;
        revision += 1;
        ok = await attempt(() =>
          sql(
            `INSERT INTO quote_issue
               (id, tenant_id, quote_id, revision, client_id, client_name, title, client_detail_level,
                currency, terms_text, tax_rate_basis_points, subtotal_minor, tax_minor, total_minor,
                sealed_at, sealed_by_user_id, catalog_synced_at)
             VALUES ($1, $2, $3, $4, $5, 'Delroy', 'Fence', 'itemised', 'JMD', 'Terms', $6, $7, $8, $9,
                     now(), $10, now())`,
            [issueId, TENANT, quote, revision, CLIENT, taxed ? 1500 : 0, subtotal, tax, subtotal + tax, USER],
          ),
        );
        if (ok) issues.push(issueId);
      } else if (op <= 3) {
        const acceptanceId = id();
        ok = await attempt(async () => {
          // Every acceptance records its own issue's render (R9), so render first, in one statement.
          await sql(
            `WITH r AS (
               INSERT INTO document_render (id, tenant_id, issue_id, storage_key, sha256, byte_size, settings)
               VALUES (gen_random_uuid(), $2, $3, 'test/render.pdf',
                       encode(sha256(gen_random_uuid()::text::bytea), 'hex'), 1, '{}')
               RETURNING id)
             INSERT INTO acceptance (id, tenant_id, issue_id, document_render_id, outcome, signer_name,
                                     consented_to_sign, occurred_at)
             SELECT $1, $2, $3, r.id, 'accepted', 'A Client', true, now() FROM r`,
            [acceptanceId, TENANT, issue],
          );
          await sql(`SELECT issue_balance_open($1)`, [issue]);
        });
        if (ok) {
          acceptances.push({ id: acceptanceId, issue });
          const [row] = await sql<{ tax: string }>(`SELECT tax_minor AS tax FROM quote_issue WHERE id = $1`, [issue]);
          if (Number(row!.tax) > 0) taxedAcceptances += 1;
        }
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
        const chosen = acceptances[next(acceptances.length)]!;
        const hadMoney = (await oracle(chosen.issue)).invoiceCount > 0;
        ok = await attempt(() =>
          sql(
            `INSERT INTO acceptance_withdrawal (id, tenant_id, acceptance_id, reason,
                                                withdrawn_by_user_id)
             VALUES ($1, $2, $3, 'walk', $4)`,
            [id(), TENANT, chosen.id, USER],
          ),
        );
        if (ok && hadMoney) withdrawalsAfterMoney += 1;
      } else if (op === 10 && invoices.length) {
        // Credit ALL that is left on one invoice: the wrong-document remedy's first step (K4, L1).
        const target = invoices[next(invoices.length)]!;
        const [left] = await sql<{ left: string }>(
          `SELECT i.amount_minor - COALESCE((SELECT SUM(c.amount_minor) FROM credit_note c
                                              WHERE c.invoice_id = i.id), 0) AS left
             FROM invoice i WHERE i.id = $1`,
          [target],
        );
        if (Number(left!.left) > 0) {
          ok = await attempt(() =>
            sql(
              `INSERT INTO credit_note (id, tenant_id, invoice_id, amount_minor, reason, issued_at)
               VALUES ($1, $2, $3, $4, 'walk: full', now())`,
              [id(), TENANT, target, left!.left],
            ),
          );
          if (ok) fullCredits += 1;
        }
      } else if (op === 11 && acceptances.length) {
        // The wrong-document remedy end to end (K4, L1): fully credit every invoice still billed on an
        // accepted issue, then withdraw its acceptance. Several writes, each in its own transaction.
        const chosen = acceptances[next(acceptances.length)]!;
        const open = await sql<{ id: string; left: string }>(
          `SELECT i.id, i.amount_minor - COALESCE((SELECT SUM(c.amount_minor) FROM credit_note c
                                                    WHERE c.invoice_id = i.id), 0) AS left
             FROM invoice i
            WHERE i.issue_id = $1
              AND NOT EXISTS (SELECT 1 FROM invoice_void z WHERE z.invoice_id = i.id)`,
          [chosen.issue],
        );
        for (const inv of open) {
          if (Number(inv.left) <= 0) continue;
          if (
            await attempt(() =>
              sql(
                `INSERT INTO credit_note (id, tenant_id, invoice_id, amount_minor, reason, issued_at)
                 VALUES ($1, $2, $3, $4, 'walk: wrong document', now())`,
                [id(), TENANT, inv.id, inv.left],
              ),
            )
          ) {
            succeeded += 1;
          }
        }
        const expected = await oracle(chosen.issue);
        ok = await attempt(() =>
          sql(
            `INSERT INTO acceptance_withdrawal (id, tenant_id, acceptance_id, reason,
                                                withdrawn_by_user_id)
             VALUES ($1, $2, $3, 'walk: wrong document', $4)`,
            [id(), TENANT, chosen.id, USER],
          ),
        );
        if (ok && expected.invoiceCount > 0) {
          wrongDocumentWithdrawals += 1;
          if (expected.variations !== 0 || (await sql(`SELECT 1 FROM variation WHERE issue_id = $1`, [chosen.issue])).length > 0) {
            wrongDocumentWithVariation += 1;
          }
        }
      }
      if (ok) succeeded += 1;
    }

    // J10, judged on the DATABASE's ceilings. The first version counted the oracle's, which cannot hold
    // two live ceilings by construction — so the check was vacuous, and a plant of the original J10
    // defect left it at zero. Found by reading the plant's output, not the assertion's result.
    let liveInQuote = 0;
    for (const issue of issues) {
      const [live] = await sql<{ c: string }>(`SELECT issue_ceiling_minor($1) AS c`, [issue]);
      if (Number(live!.c) > 0) liveInQuote += 1;
    }
    for (const issue of issues) {
      const expected = await oracle(issue);
      if ((await sql(`SELECT 1 FROM issue_balance WHERE issue_id = $1`, [issue])).length === 0) continue;
      examined += 1;
      if (!(await attempt(() => sql(`SELECT issue_balance_apply($1)`, [issue])))) stuck.push(issue);

      const [row] = await sql<{ invoiced: string; variations: string; ceiling: string }>(
        `SELECT b.invoiced_total_minor AS invoiced, b.variations_total_minor AS variations,
                issue_ceiling_minor($1) AS ceiling
           FROM issue_balance b WHERE b.issue_id = $1`,
        [issue],
      );
      if (expected.billed > 0) invoicedIssues += 1;
      if (
        Number(row!.ceiling) !== expected.ceiling ||
        Number(row!.invoiced) !== expected.billed ||
        Number(row!.variations) !== expected.variations
      ) {
        disagreements.push(`${issue}: db ${JSON.stringify(row)} oracle ${JSON.stringify(expected)}`);
      }
      if (expected.billed > expected.ceiling) overCeiling.push(issue);
    }
    if (liveInQuote > 1) twoLiveCeilings.push(quote);
  }

  return {
    succeeded,
    examined,
    invoicedIssues,
    fullCredits,
    withdrawalsAfterMoney,
    wrongDocumentWithdrawals,
    wrongDocumentWithVariation,
    taxedAcceptances,
    stuck,
    disagreements,
    overCeiling,
    twoLiveCeilings,
  };
}

describe("K6 and L3 · no sequence of financial writes leaves an issue stuck, over its ceiling, or mis-totalled", () => {
  for (const seed of [1, 2]) {
    it(`seed ${seed}: ${RUNS} runs of ${WRITES_PER_RUN} writes, judged by an independent oracle`, async () => {
      const result = await walk(seed);
      // Printed on purpose: a guard states the size of what it examined (Rule 21.1).
      console.log(
        `walk seed ${seed}:`,
        JSON.stringify({
          ...result,
          stuck: result.stuck.length,
          disagreements: result.disagreements.length,
          overCeiling: result.overCeiling.length,
          twoLiveCeilings: result.twoLiveCeilings.length,
        }),
      );

      // The set examined, asserted so a generator that stops reaching the interesting states fails
      // rather than passing on nothing (Rule 21.1). Measured 2026-09-27 after the N6/N7 changes, seeds 1
      // and 2: 1,326-1,364 successful writes, 274-297 issues examined, 23-28 still billed at the end,
      // 13-18 single full credits, 5-8 other withdrawals after money, 26-27 wrong-document remedies run
      // to the end (10-13 of them with a variation present), 135-145 acceptances of a taxed issue. Floors
      // sit at about half the lower value, so they fail on a broken generator and not on noise. The
      // wrong-document floors also fail if the remedy itself stops working (K4 or L1 reverted), because
      // then no such withdrawal succeeds — the walk's only way to see those two decisions.
      expect(result.succeeded).toBeGreaterThan(650);
      expect(result.examined).toBeGreaterThan(135);
      expect(result.invoicedIssues).toBeGreaterThan(10);
      expect(result.fullCredits).toBeGreaterThan(6);
      expect(result.withdrawalsAfterMoney).toBeGreaterThan(2);
      expect(result.wrongDocumentWithdrawals).toBeGreaterThan(12);
      expect(result.wrongDocumentWithVariation).toBeGreaterThan(4);
      expect(result.taxedAcceptances).toBeGreaterThan(60);

      expect(result.stuck).toEqual([]);
      expect(result.disagreements).toEqual([]);
      expect(result.overCeiling).toEqual([]);
      expect(result.twoLiveCeilings).toEqual([]);
    }, 240_000);
  }
});
