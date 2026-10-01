/**
 * Guard: every `*_id` row reference in the schema has a foreign key — read from PostgreSQL's own
 * catalogue after every migration has run, not parsed out of the SQL text.
 *
 * WHY THIS REPLACED A PARSER (finding S4, and R3 before it — Rule 21.9)
 *
 * `tools/check_schema_citations.py` found unkeyed references by reading the migrations with regular
 * expressions. Review 4 found it skipped every NOT NULL column (R3); its fix was then shown to miss
 * ordinary DDL that PostgreSQL accepts — `ALTER TABLE IF EXISTS`, `ALTER TABLE ONLY`, a multi-clause
 * DROP, a lower-case type, `ADD COLUMN IF NOT EXISTS`, `ADD` without COLUMN — each passing silently
 * (S4). Two misses of one class mean the parser's shape is the defect, so it was replaced, not patched a
 * third time: the database that the migrations actually build is asked directly, and every DDL form is
 * covered because the catalogue only knows the result.
 *
 * WHAT IT CHECKS
 *
 * - Every `uuid` column named `*_id` (other than a table's own `id`) is a column of some foreign key,
 *   or is named below with its reason.
 * - Every `*_id` column that is NOT uuid is named below with why it is not a row reference — so the
 *   scope is a list a reader can see, not a type test that skips in silence.
 * - Every exemption still matches a column, so none goes stale.
 *
 * WHAT IT DOES NOT PROVE (Rule 21.4)
 *
 * - Not that a key is tenant-scoped; `tenant-isolation.test.ts` checks the keys that exist. This test
 *   makes sure they exist, and that a composite key cannot be skipped by a NULL in a companion column.
 * - Not that a uuid column NOT named `*_id` is a reference; a reference named otherwise is invisible.
 * - Not that the key points at the right table — only that one exists.
 */
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { applyMigrations } from "../test-support/index.js";

/** Row references that deliberately have no key, each with its reason. */
const UNKEYED: Record<string, string> = {
  "audit_entry.subject_id":
    "Polymorphic by design: an audit row's subject may be any table, and a key would make the audit " +
    "trail depend on the row surviving — the opposite of what an audit is for.",
  "quote_line.recipe_id":
    "OWED, not exempt: the catalogue is not built, so there is no recipe table to key it to. Nullable " +
    "and advisory until the catalogue migration adds the table and this key.",
};

/** `*_id` columns that are not row references at all, each with what they are. */
const NOT_A_REFERENCE: Record<string, string> = {
  "mfa_totp.secret_key_id":
    "TEXT naming a wrapping key in the key store, not a row in this database.",
};

type IdColumn = { name: string; data_type: string; keyed: boolean };

describe("every row reference has a foreign key, read from the catalogue", () => {
  let db: PGlite;
  let ids: IdColumn[];

  beforeAll(async () => {
    db = new PGlite();
    await applyMigrations(db);
    ids = (
      await db.query<IdColumn>(
        `SELECT CASE WHEN n.nspname = 'public' THEN c.relname ELSE n.nspname || '.' || c.relname END
                  || '.' || a.attname AS name,
                format_type(a.atttypid, NULL) AS data_type,
                -- Keyed only by a key that ENFORCES: with the default MATCH SIMPLE, a NULL in any other
                -- column of a composite key skips the whole check, so a nullable companion makes the
                -- key optional (finding T6, executed: a dangling reference was accepted). So every
                -- other column of the key must be NOT NULL, or the key must be MATCH FULL.
                EXISTS (
                  SELECT 1 FROM pg_constraint k
                   WHERE k.conrelid = c.oid AND k.contype = 'f' AND a.attnum = ANY (k.conkey)
                     -- U8: a key whose enforcement triggers a migration switched off
                     -- (ALTER TABLE ... DISABLE TRIGGER ALL) accepts dangling rows, so it is no key.
                     AND NOT EXISTS (
                       -- V9: only ORIGIN ('O') and ALWAYS ('A') fire in a normal session; DISABLED ('D') and
                       -- REPLICA ('R') do not, so a key with either accepts dangling rows.
                       SELECT 1 FROM pg_trigger tr WHERE tr.tgconstraint = k.oid AND tr.tgenabled NOT IN ('O', 'A'))
                     AND (k.confmatchtype = 'f' OR NOT EXISTS (
                       SELECT 1 FROM unnest(k.conkey) AS other(num)
                         JOIN pg_attribute o ON o.attrelid = c.oid AND o.attnum = other.num
                        WHERE other.num <> a.attnum AND NOT o.attnotnull))
                ) AS keyed
           FROM pg_attribute a
           JOIN pg_class c ON c.oid = a.attrelid
           JOIN pg_namespace n ON n.oid = c.relnamespace
          -- Every user schema and partitioned parents too, not only public tables (T6).
          WHERE n.nspname NOT LIKE 'pg\\_%' AND n.nspname <> 'information_schema'
            AND c.relkind IN ('r', 'p') AND a.attnum > 0 AND NOT a.attisdropped
            AND a.attname LIKE '%\\_id' ESCAPE '\\'
          ORDER BY 1`,
      )
    ).rows;
  });

  afterAll(async () => {
    await db.close();
  });

  it("read the schema at all", () => {
    // An empty result would make every assertion below vacuously true (Rule 21.2).
    expect(ids.filter((c) => c.keyed).length).toBeGreaterThan(50);
  });

  it("keys every uuid *_id column, or names why not", () => {
    const unkeyed = ids
      .filter((c) => c.data_type === "uuid" && !c.keyed && UNKEYED[c.name] === undefined)
      .map((c) => `${c.name} is a uuid reference with no foreign key`);
    expect(unkeyed).toEqual([]);
  });

  it("names every non-uuid *_id column, so the scope is visible rather than skipped", () => {
    const unnamed = ids
      .filter((c) => c.data_type !== "uuid" && NOT_A_REFERENCE[c.name] === undefined)
      .map((c) => `${c.name} is ${c.data_type}: a reference stored in the wrong type, or name it here`);
    expect(unnamed).toEqual([]);
  });

  it("has no stale exemption", () => {
    for (const name of Object.keys(UNKEYED)) {
      expect(ids.find((c) => c.name === name), name).toMatchObject({ data_type: "uuid", keyed: false });
    }
    // The column must EXIST and not be uuid. Finding T5: checking only "not uuid" passed for a name
    // matching no column at all, because undefined is not "uuid".
    for (const name of Object.keys(NOT_A_REFERENCE)) {
      const found = ids.find((c) => c.name === name);
      expect(found, `${name} matches no column`).toBeDefined();
      expect(found?.data_type, name).not.toBe("uuid");
    }
  });
});
