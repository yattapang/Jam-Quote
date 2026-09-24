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
 * 2. Someone adds a table in a migration and forgets the policy — whether or not it has
 *    a tenant_id. The second guard below therefore asks about EVERY table: each one must
 *    be tenant-protected or named as an exemption with the reason it is safe. It used to
 *    ask only about tables carrying a tenant_id, which made a table without one
 *    invisible to it; the MFA tables made that gap concrete.
 *
 * F1 (independent review, 2026-09-24): this file used to COUNT policies and never read what they
 * said, so a table added later with `CREATE POLICY … USING (true)` passed while returning every
 * tenant's rows. Counting a control is not checking it. The fix is in two halves, and they only
 * work together:
 *
 *   1. `tenant-isolation.test.ts` proves the canonical expression actually isolates, behaviourally,
 *      against a real database — including on a table created inside the test, so the proof is not
 *      limited to the two tables that happened to exist when it was written.
 *   2. This file proves every tenant-owned table's policy IS that expression, character for
 *      character, and that it carries no others.
 *
 * Neither half is sufficient. Half 1 on its own says a good policy works somewhere; half 2 on its
 * own says every table shares an expression nobody has executed.
 *
 * WHAT THESE GUARDS DO NOT PROVE
 *
 * - Not that a policy nobody uses is harmless: a table could be reachable by a role these tests do
 *   not model. Real Postgres grants are not checked here (PGlite runs one cluster we build).
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

/**
 * The policy expression every tenant-owned table must carry, as Postgres prints it back.
 *
 * Postgres normalises what it stores: identifiers get quoted, `current_setting(...)` gains its
 * `::text` argument cast, and the literal `''` becomes `''::text`. So this is written in the form
 * `pg_get_expr` returns rather than the form the migration wrote, and it is built from the column
 * name so the tenant table (which compares `id`) and every other table (which compares
 * `tenant_id`) share one definition.
 */
function canonicalPolicyExpression(column: string): string {
  // Exactly as `pg_get_expr` prints it: the column unquoted, the NULLIF call parenthesised before
  // its cast, `current_setting`'s argument carrying `::text`, and the empty-string literal typed.
  // Written by copying what Postgres returned rather than by guessing — the first attempt guessed,
  // and the guard caught the guess, which is the right way round.
  return normalise(
    `(${column} = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid)`,
  );
}

/** Whitespace and case differences are not semantic here; anything else is. */
function normalise(expression: string | null): string {
  return (expression ?? "").replace(/\s+/g, " ").trim().toUpperCase();
}

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

describe("every table is either tenant-protected or exempt with a reason", () => {
  it("finds no table that is neither", async () => {
    const db = new PGlite();
    try {
      await applyMigrations(db);

      // STRENGTHENED on 2026-09-24. This guard used to ask only about tables carrying a
      // tenant_id, which meant a table WITHOUT one was invisible to it — the silent
      // case, and the worse one. Adding the MFA tables made that concrete: they hold
      // per-user credentials, have no tenant_id, and the old guard would have said
      // nothing at all.
      //
      // Now every table in the public schema must be one of two things, and there is no
      // third option: tenant-protected, or named here with a reason.
      const all = await db.query<{ table_name: string }>(`
        SELECT c.relname AS table_name
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relkind = 'r'
        ORDER BY c.relname
      `);

      // EXEMPTIONS live here and nowhere else, each with the reason it is safe. An
      // exemption is a hole in the isolation rule: it should be hard to add, impossible
      // to add silently, and readable as a list.
      /**
       * Tables whose history must never be rewritten, with the reason each is one.
       *
       * These are held to a STRICTER standard than the rest (see below), not excused from it.
       */
      const APPEND_ONLY: Record<string, string> = {
        audit_entry:
          "The audit trail (ADR 0020). Its whole value is that it cannot be edited, so the " +
          "absence of an UPDATE or DELETE policy is the control rather than an omission.",
      };

      const EXEMPT: Record<string, string> = {
        app_session:
          "Read before any tenant is known, because it is what establishes app.tenant_id. " +
          "A policy requiring a tenant would make it unreadable exactly when it is needed. " +
          "Thin by design (ids, a version, timestamps) and every read after it — including " +
          "the user's own role — happens under RLS with the tenant this row supplied.",
        app_credential:
          "The other half of the authentication bootstrap: sign-in must find a user BY EMAIL " +
          "before any tenant is known, and app_user is behind RLS. Keeping the hash here also " +
          "means app_user, the row every module reads, carries no password at all.",
        rate_limit_bucket:
          "Consulted before anyone is identified, which is its purpose. Holds no tenant data " +
          "and no personal data: keys are an action plus an IP or a hashed email.",
        mfa_totp:
          "A second factor is checked during authentication, before a tenant is in scope. " +
          "Holds no tenant data; the secret itself is encrypted at rest (ADR 0017) so the row " +
          "is useless without the key, which is never in the database.",
        mfa_recovery_code:
          "Same authentication phase as mfa_totp, and the same reasoning. Stores only a hash " +
          "of a code we generated.",
        platform_capability:
          "What our own staff may do, resolved during authentication and deliberately NOT " +
          "tenant-scoped: a platform capability is not a fact about any tenant. Written only " +
          "by an audited grant.",
        // _prisma_migrations is deliberately NOT listed. It exists in a real database,
        // where Prisma creates it, but not here: this guard replays the migration SQL
        // directly, so listing it would be a stale exemption — and the stale-exemption
        // check below caught exactly that on the first run.
      };

      const unprotected: string[] = [];
      for (const { table_name: table } of all.rows) {
        if (table in EXEMPT) continue;

        const state = await db.query<{
          has_tenant_column: boolean;
          rls_enabled: boolean;
          rls_forced: boolean;
          policy_count: number;
        }>(
          `
          SELECT EXISTS (
                   SELECT 1 FROM pg_attribute a
                    WHERE a.attrelid = c.oid AND a.attname = 'tenant_id'
                      AND a.attnum > 0 AND NOT a.attisdropped
                 ) AS has_tenant_column,
                 c.relrowsecurity        AS rls_enabled,
                 c.relforcerowsecurity   AS rls_forced,
                 (SELECT count(*) FROM pg_policy p WHERE p.polrelid = c.oid)::int AS policy_count
          FROM pg_class c
          JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname = 'public' AND c.relname = $1
          `,
          [table],
        );
        const row = state.rows[0];
        if (!row) {
          unprotected.push(`${table}: could not be inspected`);
          continue;
        }

        // The tenant table is the tenant, so it has no tenant_id and is still protected.
        const expectsTenantColumn = table !== "tenant";
        if (expectsTenantColumn && !row.has_tenant_column) {
          unprotected.push(
            `${table} has no tenant_id column. Either give it one (and a policy), or add it to ` +
              `EXEMPT in this file with the reason it is safe. A table that is neither is a table ` +
              `nothing protects.`,
          );
          continue;
        }
        if (!row.rls_enabled) unprotected.push(`${table} has no row-level security`);
        // FORCE matters as much as ENABLE: without it the table's owner — the role that
        // ran the migrations — is exempt from the policy, so isolation is switched on and
        // doing nothing for exactly the connection that matters.
        else if (!row.rls_forced) {
          unprotected.push(`${table} has RLS enabled but not FORCED, so its owner bypasses it`);
        } else if (row.policy_count === 0) unprotected.push(`${table} has RLS but no policy`);
        else {
          // F1: read what the policy SAYS. A policy that exists and permits everything is worse
          // than none, because it satisfies a counter and reads as protection in review.
          const policies = await db.query<{
            polname: string;
            cmd: string;
            permissive: boolean;
            roles: string;
            using_expr: string | null;
            check_expr: string | null;
          }>(
            `
            SELECT p.polname,
                   p.polcmd::text                        AS cmd,
                   p.polpermissive                       AS permissive,
                   COALESCE(array_to_string(p.polroles, ','), '')::text AS roles,
                   pg_get_expr(p.polqual, p.polrelid)      AS using_expr,
                   pg_get_expr(p.polwithcheck, p.polrelid) AS check_expr
              FROM pg_policy p
              JOIN pg_class c ON c.oid = p.polrelid
             WHERE c.relname = $1
            `,
            [table],
          );

          // The tenant table is the tenant, so its policy compares `id`; every other
          // tenant-owned table compares `tenant_id`. Both must resolve the value the same way.
          const column = table === "tenant" ? "id" : "tenant_id";
          const expected = canonicalPolicyExpression(column);

          if (table in APPEND_ONLY) {
            // A STRICTER rule, not a looser one.
            //
            // The default requirement is that a policy applies to ALL commands, so a SELECT-only
            // policy cannot leave writes unguarded. An append-only table inverts that on purpose:
            // its writes are *unpermitted*, and the absence of an UPDATE or DELETE policy is what
            // makes history unrewritable — even by a role holding the grant (ADR 0020).
            //
            // So these tables must have EXACTLY a canonical SELECT and a canonical INSERT, and
            // nothing else. A policy for ALL, UPDATE or DELETE appearing here is the defect this
            // branch exists to catch, which is why it is spelled out rather than skipped.
            const byCommand = new Map(policies.rows.map((p) => [p.cmd, p]));
            const commands = [...byCommand.keys()].sort().join(",");
            if (commands !== "a,r") {
              unprotected.push(
                `${table} is append-only, so it must have exactly a SELECT ('r') and an INSERT ` +
                  `('a') policy and no others — found '${commands}'. A policy permitting UPDATE or ` +
                  `DELETE would make its history rewritable.`,
              );
            }
            const read = byCommand.get("r");
            if (read && normalise(read.using_expr) !== expected) {
              unprotected.push(
                `${table}.${read.polname} USING is not the canonical tenant expression — got ${read.using_expr}`,
              );
            }
            const append = byCommand.get("a");
            if (append && normalise(append.check_expr) !== expected) {
              unprotected.push(
                `${table}.${append.polname} WITH CHECK is not the canonical tenant expression — got ${append.check_expr}`,
              );
            }
            continue;
          }

          for (const policy of policies.rows) {
            const named = `${table}.${policy.polname}`;

            // `polcmd` is '*' for ALL. A policy scoped to SELECT only would leave writes
            // unprotected while still counting as a policy.
            if (policy.cmd !== "*") {
              unprotected.push(`${named} applies only to ${policy.cmd}, not ALL`);
            }
            if (normalise(policy.using_expr) !== expected) {
              unprotected.push(
                `${named} USING is not the canonical tenant expression — got ${policy.using_expr}`,
              );
            }
            // WITH CHECK may be null, in which case Postgres reuses USING. Either the canonical
            // expression or nothing; anything else is a write rule nobody wrote down.
            if (policy.check_expr !== null && normalise(policy.check_expr) !== expected) {
              unprotected.push(
                `${named} WITH CHECK is not the canonical tenant expression — got ${policy.check_expr}`,
              );
            }
          }
        }
      }

      expect(unprotected, unprotected.join("; ")).toEqual([]);

      // Prove the guard had subjects, and that it actually protected some of them —
      // a run where everything was exempt would pass while proving nothing.
      const protectedCount = all.rows.filter((r) => !(r.table_name in EXEMPT)).length;
      expect(
        protectedCount,
        "every table was exempt, so this guard checked nothing",
      ).toBeGreaterThan(1);

      // A stale exemption is worse than none: it silently covers whatever table later
      // takes that name.
      const existing = new Set(all.rows.map((r) => r.table_name));
      const stale = Object.keys(EXEMPT).filter((table) => !existing.has(table));
      expect(stale, `exemptions naming tables that do not exist: ${stale.join(", ")}`).toEqual([]);
    } finally {
      await db.close();
    }
  });
});
