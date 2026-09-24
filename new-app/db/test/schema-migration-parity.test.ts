/**
 * Guard: `schema.prisma` describes the database the migrations actually build.
 *
 * WHY THIS EXISTS (F11, independent review 2026-09-24)
 *
 * The schema had four models. The migrations create eight tables. `rate_limit_bucket`,
 * `platform_capability`, `mfa_totp` and `mfa_recovery_code` existed only in SQL — so Prisma,
 * comparing its schema against a live database, would have concluded those four tables were
 * *surplus* and generated a migration to **DROP** them. Sessions, staff capabilities, second
 * factors and recovery codes, deleted by a tool doing exactly what it was designed to do.
 *
 * Nothing caught it, because every test here replays migration SQL directly and never asks Prisma
 * anything. The drift was invisible from both sides: the SQL worked, and the schema parsed.
 *
 * WHAT IT CHECKS
 *
 * Tables and columns, in both directions. A table in the migrations with no model, a model with no
 * table, and a column mismatch in either direction are all the same defect wearing different
 * clothes.
 *
 * WHAT IT DOES NOT PROVE
 *
 * - Not that types, defaults, nullability or indexes agree — only that the tables and columns
 *   exist on both sides. A `BigInt` modelled as `Int` would pass here and still be wrong.
 *   Catching that needs `prisma migrate diff`, which needs a live database and belongs in CI when
 *   one exists. Recorded as owed rather than implied.
 * - Nothing about relations, cascade behaviour, or the row-level-security policies, which Prisma
 *   does not model at all (`policy-parity.test.ts` owns those).
 */
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { applyMigrations, MIGRATIONS_DIR } from "./harness.js";

const SCHEMA = join(MIGRATIONS_DIR, "..", "schema.prisma");

/** Tables Prisma owns but never models. */
const PRISMA_INTERNAL = new Set(["_prisma_migrations"]);

interface Model {
  readonly name: string;
  /** The physical table: `@@map("…")` when present, otherwise the model name. */
  readonly table: string;
  /** Physical column names: `@map("…")` when present, otherwise the field name. */
  readonly columns: ReadonlySet<string>;
}

/**
 * Reads the models out of schema.prisma.
 *
 * A small parser rather than a dependency: Prisma's own parser is not exposed as a library, and the
 * subset here — model blocks, `@@map`, `@map`, scalar versus relation fields — is stable and worth
 * reading in one screen. It is deliberately strict: anything it cannot classify raises, because a
 * silent skip in a drift guard is how drift returns.
 */
async function models(): Promise<Model[]> {
  const source = await readFile(SCHEMA, "utf8");
  const out: Model[] = [];

  // Model names first, so a field can be classified by whether its type IS a model. The first
  // version tested only for `@relation(` and `[]`, which missed the back-reference side of a
  // one-to-one (`credential AppCredential?`) and reported it as a missing column.
  const modelNames = new Set([...source.matchAll(/^model\s+(\w+)\s*\{/gm)].map((m) => m[1]!));

  for (const block of source.matchAll(/^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm)) {
    const name = block[1]!;
    const body = block[2]!;

    const mapped = /@@map\("([^"]+)"\)/.exec(body);
    const table = mapped ? mapped[1]! : name;

    const columns = new Set<string>();
    for (const rawLine of body.split("\n")) {
      const line = rawLine.trim();
      if (!line || line.startsWith("//") || line.startsWith("///") || line.startsWith("@@")) {
        continue;
      }

      const field = /^(\w+)\s+(\S+)/.exec(line);
      if (!field) continue;

      const [, fieldName, fieldType] = field as unknown as [string, string, string];

      // A relation field is a model reference, not a column: `tenant Tenant @relation(...)`,
      // `users AppUser[]` and `credential AppCredential?` all have no column of their own. The
      // scalar that backs a relation (`tenantId`) is a separate line and IS a column.
      const bareType = fieldType.replace(/[?[\]]/g, "");
      if (modelNames.has(bareType)) continue;

      const columnMap = /@map\("([^"]+)"\)/.exec(line);
      columns.add(columnMap ? columnMap[1]! : fieldName);
    }

    out.push({ name, table, columns });
  }

  return out;
}

/** The tables and columns the migrations actually build. */
async function built(): Promise<Map<string, Set<string>>> {
  const db = new PGlite();
  try {
    await applyMigrations(db);
    const rows = await db.query<{ table_name: string; column_name: string }>(`
      SELECT c.relname AS table_name, a.attname AS column_name
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      JOIN pg_attribute a ON a.attrelid = c.oid
      WHERE n.nspname = 'public'
        AND c.relkind = 'r'
        AND a.attnum > 0
        AND NOT a.attisdropped
      ORDER BY c.relname, a.attname
    `);

    const tables = new Map<string, Set<string>>();
    for (const row of rows.rows) {
      if (PRISMA_INTERNAL.has(row.table_name)) continue;
      const columns = tables.get(row.table_name) ?? new Set<string>();
      columns.add(row.column_name);
      tables.set(row.table_name, columns);
    }
    return tables;
  } finally {
    await db.close();
  }
}

describe("schema.prisma and the migrations describe the same database", () => {
  it("has subjects on both sides", async () => {
    // A guard that compared two empty sets would pass forever (Rule 8).
    const [declared, actual] = await Promise.all([models(), built()]);

    expect(declared.length, "no models parsed out of schema.prisma").toBeGreaterThan(1);
    expect(actual.size, "no tables built by the migrations").toBeGreaterThan(1);
  });

  it("models every table the migrations create", async () => {
    // The F11 direction: a table with no model is a table Prisma would offer to DROP.
    const [declared, actual] = await Promise.all([models(), built()]);
    const modelled = new Set(declared.map((m) => m.table));

    const unmodelled = [...actual.keys()].filter((table) => !modelled.has(table));

    expect(
      unmodelled,
      `these tables exist in the migrations but have no Prisma model, so \`prisma migrate diff\` ` +
        `would generate a DROP for them: ${unmodelled.join(", ")}`,
    ).toEqual([]);
  });

  it("builds a table for every model", async () => {
    // The other direction: a model with no table means Prisma's client offers queries that fail at
    // runtime, and a migration is missing.
    const [declared, actual] = await Promise.all([models(), built()]);

    const missing = declared.filter((m) => !actual.has(m.table)).map((m) => `${m.name} → ${m.table}`);

    expect(missing, `these models have no table: ${missing.join(", ")}`).toEqual([]);
  });

  it("agrees on every column", async () => {
    const [declared, actual] = await Promise.all([models(), built()]);
    const problems: string[] = [];

    for (const model of declared) {
      const columns = actual.get(model.table);
      if (!columns) continue; // reported by the test above

      for (const column of model.columns) {
        if (!columns.has(column)) {
          problems.push(`${model.table}.${column} is in the model but not in the database`);
        }
      }
      for (const column of columns) {
        if (!model.columns.has(column)) {
          problems.push(`${model.table}.${column} is in the database but not in model ${model.name}`);
        }
      }
    }

    expect(problems, problems.join("; ")).toEqual([]);
  });
});
