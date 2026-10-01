/**
 * Guards: two properties of the trigger functions, read from PostgreSQL's catalogue.
 *
 * WHY THIS EXISTS (findings W1, W13 and W10, 2026-10-01)
 *
 * 1. A check that runs AFTER its row is written must REFUSE a row it cannot see, never skip it. Row
 *    security makes "cannot see" something the writer controls: `RETURNING set_config('app.tenant_id',
 *    '', false)`, or a `set_config` before COMMIT, clears the tenant after the row passed its own policy
 *    and before an AFTER or deferred check runs. Two triggers skipped such a row, and both were executed
 *    as bypasses: evidence on a decline (W1) and a sealed issue whose lines did not add up (W13).
 * 2. Every function that takes both the per-quote lock and the per-issue lock takes the quote lock FIRST
 *    (W10). The order is what keeps those two from forming a cycle; it was stated in a migration and
 *    held by nothing.
 *
 * WHAT IT DOES NOT PROVE (Rule 21.4)
 *
 * - Half 1 matches the two spellings of a skip that occurred (`CONTINUE WHEN NOT FOUND`, and
 *   `IF NOT FOUND THEN RETURN`). A skip written another way — `IF v_x IS NULL THEN RETURN NULL` — passes.
 *   The executed tests in `documents-core.test.ts` (W1, W13) are what prove those two triggers refuse.
 * - Half 2 reads the order of the CALLS in a function's source, not the order PostgreSQL acquires the
 *   locks at run time; a call inside a branch counts where it is written. The response trigger takes its
 *   quote lock in a separate trigger, so for it this checks that trigger fires first (name order).
 * - Neither half covers BEFORE triggers' visibility: those run before the row's own policy check, so a
 *   tenant cleared earlier fails that check instead (stated in `20260927190000_rereview_fixes`).
 */
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { applyMigrations } from "./harness.js";

type Fn = { trigger: string; table: string; timing: "BEFORE" | "AFTER"; fn: string; src: string };

let db: PGlite;
let fns: Fn[];

beforeAll(async () => {
  db = new PGlite();
  await applyMigrations(db);
  fns = (
    await db.query<Fn>(`
      SELECT t.tgname AS trigger, c.relname AS "table",
             CASE WHEN (t.tgtype & 2) = 2 THEN 'BEFORE' ELSE 'AFTER' END AS timing,
             p.proname AS fn, p.prosrc AS src
        FROM pg_trigger t
        JOIN pg_class c ON c.oid = t.tgrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
        JOIN pg_proc p ON p.oid = t.tgfoid
       WHERE n.nspname = 'public' AND NOT t.tgisinternal
       ORDER BY c.relname, t.tgname`)
  ).rows;
});

afterAll(async () => {
  await db.close();
});

describe("an AFTER or deferred check refuses a row it cannot see (W1, W13)", () => {
  const SKIP = /CONTINUE\s+WHEN\s+NOT\s+FOUND|IF\s+NOT\s+FOUND\s+THEN\s+RETURN/i;

  it("found AFTER triggers to check at all", () => {
    // The two that once skipped, so an empty read cannot pass as "nothing skips".
    const after = new Set(fns.filter((f) => f.timing === "AFTER").map((f) => f.fn));
    expect(after).toContain("quote_issue_subtotal_matches_lines");
    expect(after).toContain("acceptance_evidence_rules");
  });

  it("finds no AFTER trigger function that skips on NOT FOUND", () => {
    const skipping = fns
      .filter((f) => f.timing === "AFTER" && SKIP.test(f.src))
      .map((f) => `${f.table}.${f.trigger} → ${f.fn}()`);
    expect(skipping).toEqual([]);
  });
});

describe("the quote lock is taken before the issue lock (W10)", () => {
  it("in every function that takes both", async () => {
    const both = (
      await db.query<{ name: string; src: string }>(`
        SELECT p.proname AS name, p.prosrc AS src FROM pg_proc p
          JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public'
           AND p.prosrc LIKE '%quote_money_lock%' AND p.prosrc LIKE '%acceptance_issue_lock(%'`)
    ).rows;
    // The evidence rules and the withdrawal guard, at least — so an empty read fails.
    expect(both.map((f) => f.name)).toEqual(
      expect.arrayContaining(["acceptance_evidence_rules", "acceptance_withdrawal_guard"]),
    );
    const reversed = both
      .filter((f) => f.src.indexOf("acceptance_issue_lock(") < f.src.indexOf("quote_money_lock"))
      .map((f) => f.name);
    expect(reversed).toEqual([]);
  });

  it("for a response, whose quote lock is its own trigger, which therefore fires first", () => {
    const onAcceptance = fns
      .filter((f) => f.table === "acceptance" && f.timing === "BEFORE")
      .map((f) => f.trigger);
    // PostgreSQL fires same-timing triggers in name order.
    expect(onAcceptance.indexOf("acceptance_quote_lock")).toBeGreaterThanOrEqual(0);
    expect(onAcceptance.indexOf("acceptance_quote_lock")).toBeLessThan(onAcceptance.indexOf("acceptance_response_rules"));
  });
});
