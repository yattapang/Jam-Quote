/**
 * Does row-level security actually keep tenants apart?
 *
 * This is the first test in the rebuild, on purpose. The Phase 0 audit found the
 * previous application's isolation rested entirely on application code, and Rule
 * 4 asks for three layers: a tenant column, RLS in the database, and scoping in
 * the application. This file tests the second one — the only one that still holds
 * when a developer forgets a `where` clause.
 *
 * It runs against PGlite: real Postgres compiled to WebAssembly, so policies,
 * roles, `current_setting` and `FORCE ROW LEVEL SECURITY` all behave as they do
 * in production. A mocked database cannot disagree with a policy, which is why
 * mocks are useless here.
 *
 * WHY IT SETS A ROLE
 *
 * PGlite connects as a superuser, and a superuser bypasses RLS entirely. So does
 * a table's owner unless FORCE is set. The tests below therefore create an
 * unprivileged role and `SET ROLE` to it, which is what the application connects
 * as in production. A test that forgot this step would pass with the policies
 * deleted — the exact false confidence Rule 8 forbids.
 *
 * WHAT THIS FILE DOES NOT PROVE
 *
 * - Nothing about whether the application actually sets `app.tenant_id`. That is
 *   core/tenancy's job, and its own test's.
 * - Nothing about tables added later. `policy-parity.test.ts` is what refuses a
 *   new tenant-owned table that arrives without a policy.
 * - Nothing about a connection that runs as superuser or as the table owner in
 *   production. That is a deployment property; FORCE covers the owner case, and
 *   the application must never connect as a superuser.
 */
import { PGlite } from "@electric-sql/pglite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { applyMigrations, APP_ROLE } from "./harness.js";

const TENANT_A = "11111111-1111-4111-8111-111111111111";
const TENANT_B = "22222222-2222-4222-8222-222222222222";

let db: PGlite;

/** Runs `sql` as the unprivileged application role, with a tenant in context. */
async function asTenant(tenantId: string | null, sql: string, params: unknown[] = []) {
  await db.exec(`SET ROLE ${APP_ROLE};`);
  try {
    // `false` scopes the setting to the session rather than a transaction, which
    // is what we want in a test running statement by statement. The application
    // uses the transaction-local form — see core/tenancy.
    if (tenantId === null) {
      await db.query(`SELECT set_config('app.tenant_id', '', false)`);
    } else {
      await db.query(`SELECT set_config('app.tenant_id', $1, false)`, [tenantId]);
    }
    return await db.query(sql, params);
  } finally {
    await db.exec("RESET ROLE;");
  }
}

beforeEach(async () => {
  db = new PGlite();
  await applyMigrations(db);

  // Seed as the superuser, which bypasses RLS. Deliberate: the point of each
  // test below is that the *application* role cannot reach these rows, so they
  // have to exist first.
  for (const [id, name] of [
    [TENANT_A, "Tenant A Construction"],
    [TENANT_B, "Tenant B Contracting"],
  ] as const) {
    await db.query(
      `INSERT INTO tenant (id, name, country_code, currency, updated_at)
       VALUES ($1, $2, 'JM', 'JMD', now())`,
      [id, name],
    );
    await db.query(
      `INSERT INTO app_user (id, tenant_id, email, password_hash, role, updated_at)
       VALUES (gen_random_uuid(), $1, $2, 'not-a-real-hash', 'owner', now())`,
      [id, `owner@${id}.example`],
    );
  }
});

afterEach(async () => {
  await db.close();
});

describe("row-level security on tenant-owned tables", () => {
  it("returns nothing at all when no tenant is in context", async () => {
    // Default-deny. This is the case a forgotten `where` clause produces, and it
    // must yield zero rows rather than every row.
    const tenants = await asTenant(null, "SELECT id FROM tenant");
    const users = await asTenant(null, "SELECT id FROM app_user");

    expect(tenants.rows).toHaveLength(0);
    expect(users.rows).toHaveLength(0);
  });

  it("returns nothing when app.tenant_id was never set at all", async () => {
    // Distinct from the test above: that one sets the variable to an empty
    // string, which is what an anonymous request produces. This one never sets
    // it, so current_setting returns NULL. Both must deny, and they reach the
    // policy by different routes — the empty string only denies because of
    // nullif(), which the first run of this file proved was missing.
    await db.exec(`SET ROLE ${APP_ROLE};`);
    try {
      const tenants = await db.query("SELECT id FROM tenant");
      expect(tenants.rows).toHaveLength(0);
    } finally {
      await db.exec("RESET ROLE;");
    }
  });

  it("shows a tenant only its own row, even when the query asks for everything", async () => {
    const tenants = await asTenant(TENANT_A, "SELECT id FROM tenant");

    expect(tenants.rows).toEqual([{ id: TENANT_A }]);
  });

  it("shows a tenant only its own users, even when the query asks for everything", async () => {
    const users = await asTenant(TENANT_A, "SELECT tenant_id FROM app_user");

    expect(users.rows).toEqual([{ tenant_id: TENANT_A }]);
  });

  it("hides another tenant's row even when its id is named explicitly", async () => {
    // The attack the audit found unguarded in the old application: a caller who
    // has somehow learned a real id from another tenant. A foreign id must be
    // indistinguishable from one that never existed.
    const named = await asTenant(TENANT_A, "SELECT id FROM tenant WHERE id = $1", [TENANT_B]);
    const invented = await asTenant(TENANT_A, "SELECT id FROM tenant WHERE id = $1", [
      "33333333-3333-4333-8333-333333333333",
    ]);

    expect(named.rows).toHaveLength(0);
    expect(named.rows).toEqual(invented.rows);
  });

  it("refuses an UPDATE aimed at another tenant's row", async () => {
    const result = await asTenant(TENANT_A, `UPDATE tenant SET name = 'seized' WHERE id = $1`, [
      TENANT_B,
    ]);

    expect(result.affectedRows ?? 0).toBe(0);

    const victim = await db.query<{ name: string }>(`SELECT name FROM tenant WHERE id = $1`, [
      TENANT_B,
    ]);
    expect(victim.rows[0]?.name).toBe("Tenant B Contracting");
  });

  it("refuses a DELETE aimed at another tenant's row", async () => {
    const result = await asTenant(TENANT_A, `DELETE FROM app_user WHERE tenant_id = $1`, [
      TENANT_B,
    ]);

    expect(result.affectedRows ?? 0).toBe(0);

    const survivors = await db.query(`SELECT id FROM app_user WHERE tenant_id = $1`, [TENANT_B]);
    expect(survivors.rows).toHaveLength(1);
  });

  it("refuses an INSERT that would plant a row in another tenant", async () => {
    // WITH CHECK, not USING, is what stops this. Without it the row would be
    // written and then be invisible to its author — a write leak into a tenant
    // nobody is auditing, which is worse than a read leak.
    await expect(
      asTenant(
        TENANT_A,
        `INSERT INTO app_user (id, tenant_id, email, password_hash, role, updated_at)
         VALUES (gen_random_uuid(), $1, 'planted@example.com', 'x', 'owner', now())`,
        [TENANT_B],
      ),
    ).rejects.toThrow(/row-level security/i);
  });

  it("refuses an INSERT with no tenant in context", async () => {
    await expect(
      asTenant(
        null,
        `INSERT INTO app_user (id, tenant_id, email, password_hash, role, updated_at)
         VALUES (gen_random_uuid(), $1, 'nobody@example.com', 'x', 'owner', now())`,
        [TENANT_A],
      ),
    ).rejects.toThrow(/row-level security/i);
  });

  it("lets a tenant write within its own boundary", async () => {
    // The control has to permit the legitimate case, or it is not a control —
    // it is an outage. A test suite that only proves refusals would pass against
    // a database that refuses everything.
    await asTenant(
      TENANT_A,
      `INSERT INTO app_user (id, tenant_id, email, password_hash, role, updated_at)
       VALUES (gen_random_uuid(), $1, 'staff@example.com', 'x', 'staff', now())`,
      [TENANT_A],
    );

    const mine = await asTenant(TENANT_A, "SELECT email FROM app_user ORDER BY email");
    expect(mine.rows).toHaveLength(2);
  });
});
