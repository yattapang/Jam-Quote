/**
 * Guards: db/policies/ describes what the migrations actually applied, and every
 * tenant-owned table has a policy.
 *
 * Two failure modes this holds shut, both of which are the reason the readable
 * copy exists at all:
 *
 * 1. Someone edits db/policies/001-tenant-isolation.sql to fix or improve the
 *    isolation rule, feels done, and never writes the migration. The file now
 *    documents a control that is not in any database.
 * 2. Someone adds a tenant-owned table in a migration and forgets the policy. The
 *    table has a tenant_id column, looks isolated, and is readable by every
 *    tenant.
 *
 * WHAT THESE GUARDS DO NOT PROVE
 *
 * - Not that the policy is *correct*. `tenant-isolation.test.ts` executes it.
 * - Not that a later migration cannot DROP a policy: this checks that a table with
 *   a tenant column ends up with a policy after every migration has run, so a drop
 *   with no replacement is caught, but a policy replaced by a weaker one is only
 *   caught by the behavioural test above.
 * - Nothing about tables outside the public schema.
 */
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { applyMigrations, MIGRATIONS_DIR, migrationNames, migrationSql } from "./harness.js";

const POLICY_FILE = "001-tenant-isolation.sql";
const BEGIN = `-- >>> BEGIN db/policies/${POLICY_FILE}`;
const END = `-- <<< END db/policies/${POLICY_FILE}`;

describe("the readable policy file and the applied migrations agree", () => {
  it("embeds db/policies/001-tenant-isolation.sql verbatim in a migration", async () => {
    const authoritative = (
      await readFile(join(MIGRATIONS_DIR, "..", "policies", POLICY_FILE), "utf8")
    ).trim();

    const embedded: string[] = [];
    for (const name of await migrationNames()) {
      const sql = await migrationSql(name);
      const start = sql.indexOf(BEGIN);
      if (start === -1) continue;
      const stop = sql.indexOf(END, start);
      expect(
        stop,
        `${name} opens the policy block but never closes it — the marker pair is what makes this guard able to read the block, so a missing END means the guard is checking nothing`,
      ).toBeGreaterThan(start);
      embedded.push(sql.slice(start + BEGIN.length, stop).trim());
    }

    // Prove the guard found its subject. A guard that silently matched nothing is
    // a guard that passes forever (Rule 8).
    expect(
      embedded.length,
      "no migration embeds the policy block, so this guard was comparing nothing",
    ).toBeGreaterThan(0);

    // The LAST embedded copy is what the database ends up with.
    expect(embedded.at(-1)).toBe(authoritative);
  });
});

describe("every tenant-owned table is covered by a policy", () => {
  it("finds no table with a tenant_id column and no row-level security", async () => {
    const db = new PGlite();
    try {
      await applyMigrations(db);

      // Discovery, not a hand-written list (Rule 8): the guard asks the database
      // which tables carry a tenant column, so a table added next year is
      // included without anyone remembering to add it here.
      const tenantOwned = await db.query<{ table_name: string }>(`
        SELECT c.relname AS table_name
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        JOIN pg_attribute a ON a.attrelid = c.oid
        WHERE n.nspname = 'public'
          AND c.relkind = 'r'
          AND a.attname = 'tenant_id'
          AND a.attnum > 0
          AND NOT a.attisdropped
        ORDER BY c.relname
      `);

      // The tenant table itself is tenant-owned without having a tenant_id — it
      // IS the tenant — so it is named explicitly. Every other table must be
      // discovered by the query above.
      //
      // EXEMPTIONS are listed here, with a reason each, and nowhere else. An
      // exemption is a hole in the isolation rule; it should be hard to add and
      // impossible to add silently.
      const EXEMPT: Record<string, string> = {
        app_session:
          "Read before any tenant is known, because it is what establishes app.tenant_id. " +
          "A policy requiring a tenant would make it unreadable exactly when it is needed. " +
          "Kept safe by being thin (ids, a version, timestamps — no name, email or document) " +
          "and by the fact that every read after it, including the user's own role, happens " +
          "under RLS with the tenant this row supplied.",
      };

      const mustBeProtected = ["tenant", ...tenantOwned.rows.map((r) => r.table_name)].filter(
        (table) => !(table in EXEMPT),
      );

      // Each exemption must still exist. A stale exemption is worse than none: it
      // silently covers whatever table later takes that name.
      const exemptFound = await db.query<{ table_name: string }>(
        `SELECT c.relname AS table_name FROM pg_class c
         JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname = ANY($1)`,
        [Object.keys(EXEMPT)],
      );
      expect(
        exemptFound.rows.map((r) => r.table_name).sort(),
        "an exemption names a table that does not exist — remove it before it covers a future table of that name",
      ).toEqual(Object.keys(EXEMPT).sort());

      expect(
        mustBeProtected.length,
        "the discovery query found no tenant-owned tables, so this guard proved nothing",
      ).toBeGreaterThan(1);

      const state = await db.query<{
        table_name: string;
        rls_enabled: boolean;
        rls_forced: boolean;
        policy_count: number;
      }>(
        `
        SELECT c.relname       AS table_name,
               c.relrowsecurity AS rls_enabled,
               c.relforcerowsecurity AS rls_forced,
               (SELECT count(*) FROM pg_policy p WHERE p.polrelid = c.oid)::int AS policy_count
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname = ANY($1)
        `,
        [mustBeProtected],
      );

      expect(state.rows.map((r) => r.table_name).sort()).toEqual([...mustBeProtected].sort());

      for (const row of state.rows) {
        expect(row.rls_enabled, `${row.table_name} has no row-level security`).toBe(true);
        // FORCE matters as much as ENABLE: without it the table's owner — which
        // is the role that ran the migrations — is exempt from the policy, so
        // isolation would be switched on and doing nothing for exactly the
        // connection that matters.
        expect(
          row.rls_forced,
          `${row.table_name} has RLS enabled but not FORCED, so its owner bypasses it`,
        ).toBe(true);
        expect(row.policy_count, `${row.table_name} has RLS but no policy`).toBeGreaterThan(0);
      }
    } finally {
      await db.close();
    }
  });
});
