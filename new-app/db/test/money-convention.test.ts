/**
 * Guard: every amount in this database is an integer of minor units, and nothing is approximate.
 *
 * WHY THIS FILE EXISTS, AND IT IS NOT A FLATTERING REASON
 *
 * `20260925120000_documents_core/migration.sql` said, in a comment: "No floating-point type appears
 * in this file, and `db/test/money-convention.test.ts` asserts it." **This file did not exist.** It
 * was credited at eight places across the repository and never written — finding J1, and the same
 * class as M14 (`honest-claims.test.ts`) and M18 (`client_reference`): a claim protected by a
 * citation instead of by a check. The citation checker could not see it, because a path beginning
 * `db/` was silently skipped as unrooted (the bail-out J1 is named for).
 *
 * So this is a guard written to make a sentence true that had been asserted for a day, and the
 * lesson is recorded in `docs/MISTAKES.md` rather than only here.
 *
 * HOW IT CHECKS, AND WHY NOT BY READING THE SQL
 *
 * It applies every migration to a real database and asks `information_schema` what the columns
 * ACTUALLY are. Text-searching the migrations for `DOUBLE PRECISION` would be satisfied by a comment
 * and defeated by a type introduced through a domain, an `ALTER COLUMN`, or a later correction — and
 * "the sum of the migrations" is exactly what a comment in one of them cannot see. What the database
 * ended up with is the only thing worth asserting.
 *
 * WHAT IT DOES NOT PROVE (Rule 21.4)
 *
 * - **Not that the arithmetic is right.** `issue_balance_apply()` could still add when it should
 *   subtract; `documents-core.test.ts` executes that, including J4's block (a negative variation,
 *   and the credit notes that make room for it), which is about exactly this distinction.
 * - **Not that the application uses minor units.** A TypeScript layer can still divide by 100 in the
 *   wrong place. This is the schema's half of Rule 3 and the repository layer's half is owed.
 * - Nothing about currency conversion. There is none: the currency lives on the document that owns
 *   the amount and amounts are never mixed.
 * - Nothing about display rounding, which is presentation and not storage.
 */
import { PGlite } from "@electric-sql/pglite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { applyMigrations } from "../test-support/index.js";

/**
 * Types no amount may ever have, and the reason each is forbidden.
 *
 * `numeric` is included and that is deliberate. It is exact, so it is not wrong the way `double
 * precision` is wrong — it is forbidden because a schema with both `BIGINT` minor units and
 * `NUMERIC` amounts has two money conventions, and the cheapest way for the old application's
 * defects to come back is for the next person to pick whichever one they met first.
 */
const FORBIDDEN_TYPES: Record<string, string> = {
  "double precision": "Binary floating point: 0.1 + 0.2 is not 0.3, and this is money.",
  real: "The same, with less precision.",
  numeric: "Exact, but it is a second money convention. One convention or none (Rule 3).",
  money: "Postgres's own type: locale-dependent formatting baked into storage.",
  float: "An alias for one of the above.",
  decimal: "An alias for numeric.",
};

/**
 * Columns that legitimately hold an approximate number because they are NOT money, each with its
 * reason. Found by this guard on its first run, which is the evidence that it reads real subjects
 * rather than passing over an empty set (Rule 21.2).
 */
const NOT_MONEY: Record<string, string> = {
  "rate_limit_bucket.tokens":
    "A token bucket refills continuously, so a fractional token is the correct representation and " +
    "rounding it would make the limiter either too strict or too generous. It is a rate, not money, " +
    "and no amount is derived from it.",
};

/**
 * Suffixes that make a column an amount, and therefore subject to the convention. `_cents` is not
 * this schema's spelling, and that is why it is here (finding R12): it is the spelling the old
 * application used for money ("Int cents"), so it is the one most likely to come back, as a 32-bit
 * column, and the int32 cap is the defect ADR 0011 names.
 */
const AMOUNT_SUFFIXES = ["_minor", "_thousandths", "_cents"];

/**
 * `data_type` is the column's type with any domain resolved to its base, and for an ARRAY it is the
 * ELEMENT type, with `is_array` set. Finding R12: information_schema reports every array as just
 * 'ARRAY', so `NUMERIC[]` and `DOUBLE PRECISION[]` matched no forbidden type and passed.
 * `declared` is the type exactly as the column has it, which is what the ceiling is stored through.
 */
type ColumnRow = {
  table_name: string;
  column_name: string;
  data_type: string;
  is_array: boolean;
  declared: string;
};

describe("money is stored as integer minor units, everywhere", () => {
  let db: PGlite;
  let columns: ColumnRow[];

  beforeEach(async () => {
    db = new PGlite();
    await applyMigrations(db);
    columns = (
      await db.query<ColumnRow>(
        `SELECT c.relname AS table_name, a.attname AS column_name,
                format_type(CASE WHEN base.typtype = 'd' THEN base.typbasetype ELSE base.oid END, NULL)
                  AS data_type,
                (t.typcategory = 'A') AS is_array,
                format_type(a.atttypid, a.atttypmod) AS declared
           FROM pg_attribute a
           JOIN pg_class c ON c.oid = a.attrelid
           JOIN pg_namespace n ON n.oid = c.relnamespace
           -- A domain first resolves to its base type; an array then to its element; and an
           -- element that is itself a domain to that domain's base.
           JOIN pg_type d ON d.oid = a.atttypid
           JOIN pg_type t ON t.oid = CASE WHEN d.typtype = 'd' THEN d.typbasetype ELSE d.oid END
           JOIN pg_type base ON base.oid = CASE WHEN t.typcategory = 'A' THEN t.typelem ELSE t.oid END
          WHERE n.nspname = 'public' AND c.relkind = 'r' AND a.attnum > 0 AND NOT a.attisdropped
          ORDER BY 1, 2`,
      )
    ).rows;
  });

  afterEach(async () => {
    await db.close();
  });

  it("read the schema at all", () => {
    // A query that returned nothing would make every assertion below vacuously true — the failure
    // mode this whole file exists because of (a control that passes over an empty set).
    expect(columns.length).toBeGreaterThan(100);
  });

  it("has no approximate or alternative numeric type on any column", () => {
    const offenders = columns
      .filter((c) => FORBIDDEN_TYPES[c.data_type.toLowerCase()] !== undefined)
      .filter((c) => NOT_MONEY[`${c.table_name}.${c.column_name}`] === undefined)
      .map((c) => `${c.table_name}.${c.column_name} is ${c.declared}`);
    expect(offenders).toEqual([]);
  });

  it("still has the one exempt approximate column, so the exemption is not stale", () => {
    // An exemption that stops matching anything is a comment pretending to be a decision. If the
    // limiter is ever rewritten, this fails and the entry above goes rather than lingering.
    for (const name of Object.keys(NOT_MONEY)) {
      const [table, column] = name.split(".");
      expect(columns.some((c) => c.table_name === table && c.column_name === column)).toBe(true);
    }
  });

  it("stores every amount column as bigint", () => {
    const amounts = columns.filter((c) =>
      AMOUNT_SUFFIXES.some((suffix) => c.column_name.endsWith(suffix)),
    );
    // The convention is worth nothing if no column follows it, so the count is asserted with the
    // types: the Documents core alone carries more than a dozen.
    expect(amounts.length).toBeGreaterThan(12);
    // An array of bigint is not an amount either: a list of amounts has no single total to check.
    const wrong = amounts
      .filter((c) => c.data_type !== "bigint" || c.is_array)
      .map((c) => `${c.table_name}.${c.column_name} is ${c.declared}, not bigint`);
    expect(wrong).toEqual([]);
  });

  it("names every amount column so the unit is unmissable", () => {
    // The other half of the convention: a column called `total` invites a reader to assume dollars.
    // Any integer column whose name suggests money must carry its unit in the name.
    const suspicious = columns
      .filter((c) => /(^|_)(amount|total|price|cost|subtotal|tax|deposit|balance)$/.test(c.column_name))
      .map((c) => `${c.table_name}.${c.column_name} names an amount without its unit`);
    expect(suspicious).toEqual([]);
  });

  it("holds the owner's ceiling in every amount column's own type, which a 32-bit column could not", async () => {
    // ADR 0011: ~999,999,999.99 JMD is 99,999,999,999 minor units, 47x past int32's 2,147,483,647.
    // Asserted by storing it rather than by arithmetic in a comment — the old application's
    // $21,474,836.47 cap was a type, not an opinion.
    //
    // Stored through each REAL column's declared type. Finding R12: the first version stored the
    // ceiling in a temporary BIGINT table of its own, so it passed with every money column INTEGER —
    // it never read one. A type name cannot be a bind parameter, so it comes from the catalogue
    // (`format_type`), never from input.
    const ceiling = 99_999_999_999n;
    expect(ceiling > 2_147_483_647n).toBe(true);
    const amounts = columns.filter((c) =>
      AMOUNT_SUFFIXES.some((suffix) => c.column_name.endsWith(suffix)),
    );
    expect(amounts.length).toBeGreaterThan(12);

    const cannotHold: string[] = [];
    for (const c of amounts) {
      try {
        const rows = (
          await db.query<{ v: string | number | bigint }>(`SELECT ($1::text)::${c.declared} AS v`, [
            ceiling.toString(),
          ])
        ).rows;
        if (BigInt(rows[0]!.v) !== ceiling) cannotHold.push(`${c.table_name}.${c.column_name}`);
      } catch {
        cannotHold.push(`${c.table_name}.${c.column_name} (${c.declared})`);
      }
    }
    expect(cannotHold).toEqual([]);
  });
});
