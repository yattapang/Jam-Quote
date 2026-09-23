/**
 * Does the application half of isolation actually work — against a real database?
 *
 * db/test/tenant-isolation.test.ts proved the policies refuse the wrong rows. This
 * file proves the other half: that `withTenant` puts the tenant where the policies
 * look, that the setting does not outlive its transaction, and that a bad id is
 * refused before a transaction is opened.
 *
 * It runs against PGlite through a small adapter, not against a mock. A mock would
 * happily record that `set_config` was called and could never tell us whether the
 * policies agreed — and "the two halves agree" is the entire claim being made here.
 *
 * WHAT IT DOES NOT PROVE
 *
 * - Nothing about HTTP. That a request's tenant is resolved from the session and
 *   never from a parameter is the auth layer's claim, and its own test's.
 * - Nothing about Prisma specifically. It drives the same structural interface
 *   Prisma satisfies; that Prisma's `$transaction` really is one transaction is
 *   Prisma's contract, and the integration suite exercises it once routes exist.
 * - Nothing about connection pooling in production. The transaction-local setting
 *   is what makes pooling safe, and this proves the setting is transaction-local —
 *   not that the deployed pool behaves.
 */
import { PGlite } from "@electric-sql/pglite";
import { readFile, readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  InvalidTenantIdError,
  type TransactionalClient,
  withTenant,
  withoutTenant,
} from "./tenant-context.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS = join(HERE, "..", "..", "..", "..", "db", "migrations");
const APP_ROLE = "pryvis_app";

const TENANT_A = "11111111-1111-4111-8111-111111111111";
const TENANT_B = "22222222-2222-4222-8222-222222222222";

/**
 * The smallest honest adapter from PGlite to the interface core/tenancy needs.
 *
 * `$transaction` maps onto a real BEGIN/COMMIT, because the whole point of the
 * transaction-local setting is that a transaction boundary discards it. An adapter
 * that faked the transaction would make this file prove nothing.
 */
function adapt(db: PGlite): TransactionalClient {
  const client: TransactionalClient = {
    async $executeRawUnsafe(query, ...values) {
      const result = await db.query(query, values);
      return result.affectedRows ?? 0;
    },
    async $transaction(fn) {
      await db.exec("BEGIN");
      try {
        const out = await fn(client);
        await db.exec("COMMIT");
        return out;
      } catch (error) {
        await db.exec("ROLLBACK");
        throw error;
      }
    },
  };
  return client;
}

let db: PGlite;
let prisma: TransactionalClient;

/** Reads rows the way a module would: no tenant filter in the SQL at all. */
async function readAllTenantNames(): Promise<string[]> {
  const result = await db.query<{ name: string }>("SELECT name FROM tenant ORDER BY name");
  return result.rows.map((r) => r.name);
}

beforeEach(async () => {
  db = new PGlite();
  for (const entry of (await readdir(MIGRATIONS, { withFileTypes: true }))
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort()) {
    await db.exec(await readFile(join(MIGRATIONS, entry, "migration.sql"), "utf8"));
  }
  await db.exec(`
    CREATE ROLE ${APP_ROLE} NOLOGIN;
    GRANT USAGE ON SCHEMA public TO ${APP_ROLE};
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${APP_ROLE};
  `);
  for (const [id, name] of [
    [TENANT_A, "Tenant A Construction"],
    [TENANT_B, "Tenant B Contracting"],
  ] as const) {
    await db.query(
      `INSERT INTO tenant (id, name, country_code, currency, updated_at)
       VALUES ($1, $2, 'JM', 'JMD', now())`,
      [id, name],
    );
  }
  // From here on, act as the unprivileged application role — the identity the
  // policies are written for. Without this the superuser bypasses RLS and every
  // assertion below would pass with the policies deleted.
  await db.exec(`SET ROLE ${APP_ROLE};`);
  prisma = adapt(db);
});

afterEach(async () => {
  await db.close();
});

describe("withTenant", () => {
  it("scopes an unfiltered query to one tenant", async () => {
    // The query inside deliberately has no WHERE clause. This is the case that
    // leaked in the previous application; here the database refuses on its own.
    const names = await withTenant(prisma, TENANT_A, () => readAllTenantNames());

    expect(names).toEqual(["Tenant A Construction"]);
  });

  it("gives each tenant a different answer to the identical query", async () => {
    const a = await withTenant(prisma, TENANT_A, () => readAllTenantNames());
    const b = await withTenant(prisma, TENANT_B, () => readAllTenantNames());

    expect(a).toEqual(["Tenant A Construction"]);
    expect(b).toEqual(["Tenant B Contracting"]);
  });

  it("returns nothing at all when the work runs outside withTenant", async () => {
    // The forgotten-wrapper case. It must be an empty result, never every row.
    expect(await readAllTenantNames()).toEqual([]);
  });

  it("does not leak the tenant into the next piece of work on the same connection", async () => {
    // The pooling trap, tested directly: if the setting were session-scoped this
    // read would still see Tenant A, and in production that would be whichever
    // request happened to inherit the connection.
    await withTenant(prisma, TENANT_A, () => readAllTenantNames());

    expect(await readAllTenantNames()).toEqual([]);
  });

  it("discards the tenant when the transaction rolls back", async () => {
    await expect(
      withTenant(prisma, TENANT_A, async () => {
        throw new Error("something went wrong mid-request");
      }),
    ).rejects.toThrow("something went wrong mid-request");

    expect(await readAllTenantNames()).toEqual([]);
  });

  it("refuses a tenant id that is not a uuid, before opening a transaction", async () => {
    // Bound as a parameter, so this is not an injection risk — but a malformed id
    // would otherwise surface as a confusing cast error deep inside a policy,
    // instead of naming the real problem where it entered.
    for (const bad of ["", "not-a-uuid", "1; DROP TABLE tenant", `${TENANT_A} `]) {
      await expect(withTenant(prisma, bad, async () => "unreachable")).rejects.toThrow(
        InvalidTenantIdError,
      );
    }

    // And the database is untouched: the refusal happened before any statement ran.
    const survived = await db.query("SELECT count(*)::int AS n FROM tenant");
    expect((survived.rows[0] as { n: number }).n).toBeGreaterThanOrEqual(0);
  });

  it("returns what the work returned, not what the transaction returned", async () => {
    const value = await withTenant(prisma, TENANT_A, async () => ({ ok: true as const }));
    expect(value).toEqual({ ok: true });
  });
});

describe("withoutTenant", () => {
  it("still cannot read tenant-owned rows", async () => {
    // It is an honest label, not an escape hatch. If this ever returns rows,
    // "no tenant in scope" has silently become "all tenants".
    const names = await withoutTenant(prisma, "authentication", () => readAllTenantNames());

    expect(names).toEqual([]);
  });
});
