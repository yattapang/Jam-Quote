/**
 * Guard and behaviour: the row convention, and the two things it buys.
 *
 * Design: docs/design/row-identity-and-versioning.md. Two halves, as with the policy guards:
 * this file asserts every tenant-owned business table CARRIES the convention, and then executes
 * it against a real database so the columns are not merely present but working.
 *
 * WHY A GUARD AND NOT A CONVENTION
 *
 * "Every table gets `version` and `deleted_at`" is exactly the kind of rule that holds for three
 * tables and then quietly stops. The previous application had soft deletes on almost everything
 * and indexes that ignored them — nobody decided that; it accumulated. So the rule is a test, and
 * a table that skips it has to be named here with a reason.
 *
 * WHAT IT DOES NOT PROVE
 *
 * - Not that the application USES compare-and-set. The columns and the database behaviour are
 *   proved here; that every repository writes `AND version = $n` is a guard for when a
 *   persistence layer exists, and it is owed.
 * - Nothing about sync. There is no sync. This makes the schema capable of it.
 * - Not that a query filters `deleted_at IS NULL`. Same reason: no query layer yet.
 */
import { PGlite } from "@electric-sql/pglite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { APP_ROLE, applyMigrations } from "../test-support/index.js";

/**
 * Tables the convention does NOT apply to, with the reason each is exempt.
 *
 * Same discipline as the row-level-security exemptions: a hole in a rule should be hard to add and
 * impossible to add silently.
 */
const EXEMPT: Record<string, string> = {
  app_session:
    "Authentication state, not business data. Nothing syncs a session to a phone, and a revoked " +
    "session already has revoked_at — a tombstone would be a second way to say the same thing.",
  app_credential:
    "Authentication state. Deleting a credential is not an event a client needs to learn about, " +
    "and a version would imply concurrent edits to a password, which there are not.",
  rate_limit_bucket:
    "Infrastructure. Rows are created and discarded by the limiter itself; a tombstone would be " +
    "a row we then have to clean up twice.",
  platform_capability:
    "Our own staff's grants. Already revoked rather than deleted (revoked_at), because who could " +
    "do what and when is history, and it is not tenant data a client syncs.",
  mfa_totp:
    "A second factor is removed, not soft-deleted: leaving the row would leave the encrypted " +
    "secret behind, which is the opposite of what removing a factor should do.",
  audit_entry:
    "Append-only by design (ADR 0020): the table has no UPDATE or DELETE policy, so a version " +
    "column would describe edits that cannot happen and a tombstone would be a soft delete the " +
    "application is forbidden to perform. Its history IS the point.",
  mfa_recovery_code:
    "Single-use by design, marked with used_at. A tombstone would add a third state to a thing " +
    "with two.",
};

let db: PGlite;

beforeEach(async () => {
  db = new PGlite();
  await applyMigrations(db);
});

afterEach(async () => {
  await db.close();
});

/** Every table in the public schema, with the columns it has. */
async function tables(): Promise<Map<string, Set<string>>> {
  const rows = await db.query<{ table_name: string; column_name: string }>(`
    SELECT c.relname AS table_name, a.attname AS column_name
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_attribute a ON a.attrelid = c.oid
    WHERE n.nspname = 'public' AND c.relkind = 'r' AND a.attnum > 0 AND NOT a.attisdropped
  `);
  const out = new Map<string, Set<string>>();
  for (const row of rows.rows) {
    const columns = out.get(row.table_name) ?? new Set<string>();
    columns.add(row.column_name);
    out.set(row.table_name, columns);
  }
  return out;
}

describe("the row convention", () => {
  it("applies to every tenant-owned business table", async () => {
    const all = await tables();

    // Discovery, not a hand-written list: a table added next year is included without anyone
    // remembering to add it here (Rule 8).
    const businessTables = [...all.entries()]
      .filter(([name]) => !(name in EXEMPT))
      .filter(([name, columns]) => name === "tenant" || columns.has("tenant_id"));

    expect(
      businessTables.length,
      "no tenant-owned business tables found, so this guard checked nothing",
    ).toBeGreaterThan(1);

    const missing: string[] = [];
    for (const [name, columns] of businessTables) {
      if (!columns.has("version")) {
        missing.push(
          `${name} has no version column, so a write against a stale copy would win silently`,
        );
      }
      if (!columns.has("deleted_at")) {
        missing.push(
          `${name} has no deleted_at, so a client that has been offline cannot tell a deleted row ` +
            `from one it has not been told about — and the row comes back`,
        );
      }
    }
    expect(missing, missing.join("; ")).toEqual([]);
  });

  it("names every exemption, and every exemption still exists", async () => {
    // A stale exemption is worse than none: it silently covers whatever table later takes that
    // name. Caught exactly this way when `_prisma_migrations` was listed and did not exist.
    const all = await tables();
    const stale = Object.keys(EXEMPT).filter((name) => !all.has(name));

    expect(stale, `exemptions naming tables that do not exist: ${stale.join(", ")}`).toEqual([]);
  });

  it("indexes live rows only, wherever there is a tombstone", async () => {
    // The Phase 0 finding, turned into a rule: the previous application had soft deletes
    // everywhere and indexes that ignored them, so every list query filtered rows the index had
    // already returned. An index on a tombstoned table that is not partial is the defect.
    const all = await tables();
    const withTombstones = [...all.entries()]
      .filter(([, columns]) => columns.has("deleted_at"))
      .map(([name]) => name);

    expect(withTombstones.length).toBeGreaterThan(0);

    const indexes = await db.query<{ table_name: string; index_name: string; predicate: string | null }>(
      `
      SELECT c.relname AS table_name,
             i.relname AS index_name,
             pg_get_expr(x.indpred, x.indrelid) AS predicate
        FROM pg_index x
        JOIN pg_class c ON c.oid = x.indrelid
        JOIN pg_class i ON i.oid = x.indexrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public' AND c.relname = ANY($1)
      `,
      [withTombstones],
    );

    const problems: string[] = [];
    for (const index of indexes.rows) {
      // The primary key is exempt and must be: it identifies a row whether that row is live or
      // tombstoned, and a foreign key pointing at a deleted row still has to resolve.
      if (index.index_name.endsWith("_pkey")) continue;
      if (index.predicate === null) {
        problems.push(
          `${index.index_name} on ${index.table_name} is not partial; add WHERE deleted_at IS NULL ` +
            `or it will return rows every query then has to filter out`,
        );
      }
    }
    expect(problems, problems.join("; ")).toEqual([]);
  });
});

describe("what the convention actually buys", () => {
  const TENANT = "01927f5a-0000-7000-8000-000000000001";

  beforeEach(async () => {
    await db.query(
      `INSERT INTO tenant (id, name, country_code, currency, updated_at)
       VALUES ($1, 'Tenant A', 'JM', 'JMD', now())`,
      [TENANT],
    );
    // Act as the application does: the unprivileged role, WITH a tenant in scope. The first run
    // of these tests set the role and forgot the tenant, and row-level security refused every
    // insert — which is the isolation guard doing its job on my own careless test, and is why
    // this comment exists rather than a `RESET ROLE` shortcut.
    await db.exec(`SET ROLE ${APP_ROLE};`);
    await db.query(`SELECT set_config('app.tenant_id', $1, false)`, [TENANT]);
  });

  it("makes a repeated upload change nothing, instead of creating a second row", async () => {
    // The offline case: a phone uploads, the connection drops before it hears back, it retries.
    // A server-assigned id would make that two quotes. A client-chosen id makes it one row.
    const id = "01927f5a-0000-7000-8000-0000000000aa";

    const insert = `
      INSERT INTO app_user (id, tenant_id, email, role, updated_at)
      VALUES ($1, $2, 'delroy@example.com', 'owner', now())
      ON CONFLICT (id) DO NOTHING`;

    await db.query(insert, [id, TENANT]);
    await db.query(insert, [id, TENANT]);

    const rows = await db.query(`SELECT id FROM app_user WHERE id = $1`, [id]);
    expect(rows.rows).toHaveLength(1);
  });

  it("refuses a write made against a stale version", async () => {
    // Two people edit the same business, or a phone uploads an edit made against an old copy.
    // Without the version check the second write wins silently and the first person never learns.
    const current = await db.query<{ version: number }>(
      `SELECT version FROM tenant WHERE id = $1`,
      [TENANT],
    );
    const version = current.rows[0]!.version;

    const fresh = await db.query(
      `UPDATE tenant SET name = 'Renamed', version = version + 1, updated_at = now()
        WHERE id = $1 AND version = $2`,
      [TENANT, version],
    );
    expect(fresh.affectedRows).toBe(1);

    // The same write again, still believing it holds the old version.
    const stale = await db.query(
      `UPDATE tenant SET name = 'Renamed by someone else', version = version + 1, updated_at = now()
        WHERE id = $1 AND version = $2`,
      [TENANT, version],
    );
    expect(stale.affectedRows).toBe(0);

    const after = await db.query<{ name: string; version: number }>(
      `SELECT name, version FROM tenant WHERE id = $1`,
      [TENANT],
    );
    expect(after.rows[0]).toEqual({ name: "Renamed", version: version + 1 });
  });

  it("lets exactly one of two concurrent writers win", async () => {
    // The claim is about what the DATABASE does, so it is asked of the database. Both writers
    // read the same version and both try to advance it; one must be told no.
    const start = (
      await db.query<{ version: number }>(`SELECT version FROM tenant WHERE id = $1`, [TENANT])
    ).rows[0]!.version;

    const attempt = (name: string) =>
      db.query(
        `UPDATE tenant SET name = $3, version = version + 1, updated_at = now()
          WHERE id = $1 AND version = $2`,
        [TENANT, start, name],
      );

    const [a, b] = await Promise.all([attempt("Writer A"), attempt("Writer B")]);
    const winners = [a, b].filter((r) => (r.affectedRows ?? 0) === 1);

    expect(winners).toHaveLength(1);

    const after = await db.query<{ version: number }>(
      `SELECT version FROM tenant WHERE id = $1`,
      [TENANT],
    );
    // Advanced once, not twice. Two increments would mean both writes landed.
    expect(after.rows[0]!.version).toBe(start + 1);
  });

  it("frees a deleted user's email for re-invitation", async () => {
    // The reason the unique index had to become partial. Without it the address is held hostage
    // forever: the business could never re-invite the same person, and could not explain why.
    const first = "01927f5a-0000-7000-8000-0000000000b1";
    const second = "01927f5a-0000-7000-8000-0000000000b2";

    await db.query(
      `INSERT INTO app_user (id, tenant_id, email, role, updated_at)
       VALUES ($1, $2, 'marva@example.com', 'staff', now())`,
      [first, TENANT],
    );
    await db.query(`UPDATE app_user SET deleted_at = now() WHERE id = $1`, [first]);

    await expect(
      db.query(
        `INSERT INTO app_user (id, tenant_id, email, role, updated_at)
         VALUES ($1, $2, 'marva@example.com', 'staff', now())`,
        [second, TENANT],
      ),
    ).resolves.toBeDefined();
  });

  it("still refuses two live users with the same email", async () => {
    // The partial index must not become no index. This is the half that would quietly disappear.
    await db.query(
      `INSERT INTO app_user (id, tenant_id, email, role, updated_at)
       VALUES ($1, $2, 'dane@example.com', 'staff', now())`,
      ["01927f5a-0000-7000-8000-0000000000c1", TENANT],
    );

    await expect(
      db.query(
        `INSERT INTO app_user (id, tenant_id, email, role, updated_at)
         VALUES ($1, $2, 'dane@example.com', 'staff', now())`,
        ["01927f5a-0000-7000-8000-0000000000c2", TENANT],
      ),
    ).rejects.toThrow(/duplicate key|unique/i);
  });
});
