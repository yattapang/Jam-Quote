/**
 * Guard: every function reads the real tables, never a temporary table of the same name.
 *
 * WHY THIS EXISTS (findings Y1, Y2 and Y7, 2026-10-01)
 *
 * PostgreSQL searches the session's temporary schema first for tables unless `pg_temp` is placed in the
 * search path. No function pinned its path, so a role that could create a temp table could shadow what any
 * trigger read: an empty temp `invoice` let a 9,000,000 invoice past a ceiling of 1,000 (Y7, reopening J2).
 * Migration `20260927210000_pin_search_path` pins every function and revokes TEMPORARY from PUBLIC.
 *
 * WHAT IT CHECKS
 *
 * 1. Every function in the public schema carries `search_path=pg_catalog, public, pg_temp` — including one
 *    a later migration re-creates with CREATE OR REPLACE, which silently drops the setting.
 * 2. (Layer two — the application role cannot create a temporary table — is in `concurrency.pg.test.ts`:
 *    PGlite's `template1` never grants TEMPORARY, so a test here would pass without the revoke.)
 *
 * WHAT IT DOES NOT PROVE
 *
 * - Anything about procedures, aggregates, or functions outside `public`: the pin loop in the migration and
 *   this guard both cover plain functions in `public` only. The fourth re-review attached an unpinned
 *   trigger function from another schema to `invoice` and this stayed green (Z3). None exists today.
 * - That the pin is the right one for a function that needs another schema: none does today.
 * - That production's role lacks TEMPORARY: that role is provisioned outside the migrations
 *   (`docs/THREAT-MODEL.md` §4g). This checks the test role, created like it is meant to be.
 * - The executed attacks — shadowing `invoice`, `quote_issue`, `acceptance` and `pg_roles` — are in
 *   `documents-core.test.ts`, block "Y".
 */
import { PGlite } from "@electric-sql/pglite";
import { applyMigrations } from "@pryvis/db/test-support";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const PIN = "search_path=pg_catalog, public, pg_temp";

let db: PGlite;

beforeAll(async () => {
  db = new PGlite();
  await applyMigrations(db);
});

afterAll(async () => {
  await db.close();
});

describe("every function's search path is pinned, temp schema last (Y1, Y2, Y7)", () => {
  it("finds no function in the public schema without the pin", async () => {
    const fns = (
      await db.query<{ name: string; config: string[] | null }>(`
        SELECT p.oid::regprocedure::text AS name, p.proconfig AS config
          FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public' AND p.prokind = 'f'`)
    ).rows;
    // The ceiling's own function, at least, so an empty read cannot pass.
    expect(fns.map((f) => f.name)).toContain("issue_balance_apply(uuid)");
    // 20 on 2026-10-01; a floor below it, so a read that lost most of them fails.
    expect(fns.length).toBeGreaterThanOrEqual(15);
    const unpinned = fns.filter((f) => !(f.config ?? []).includes(PIN)).map((f) => f.name);
    expect(unpinned).toEqual([]);
  });

  // Layer two (no TEMPORARY for ordinary roles) is tested in `concurrency.pg.test.ts`, on real PostgreSQL:
  // PGlite runs in `template1`, where PUBLIC never has TEMPORARY, so a test here passed without the revoke
  // (found by planting the revoke away, 2026-10-01).
});
