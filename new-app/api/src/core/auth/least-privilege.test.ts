/**
 * Does the start-up check refuse an over-privileged role, and pass the application role?
 *
 * Against PGlite with the real migrations, so the function it calls is the one production runs.
 *
 * WHAT IT DOES NOT PROVE
 *
 * - That the API calls it at start-up: there is no bootstrap yet (see the module header).
 * - The TEMPORARY line: PGlite never grants it. That is planted on real PostgreSQL in
 *   `db/test/concurrency.pg.test.ts` ("§4g").
 * - Every violation the function names: those are planted one by one in `db/test/privilege-model.test.ts`.
 *   This file proves the check turns any violation, or no answer, into a refusal.
 */
import { APP_ROLE, applyMigrations } from "@pryvis/db/test-support";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { assertLeastPrivilege, type LeastPrivilegeQueryable, OverPrivilegedRoleError } from "./least-privilege.js";

let db: PGlite;

function adapt(pg: PGlite): LeastPrivilegeQueryable {
  return {
    async $queryRawUnsafe<T>(query: string, ...values: unknown[]) {
      return (await pg.query<T>(query, values)).rows;
    },
  };
}

beforeAll(async () => {
  db = new PGlite();
  await applyMigrations(db);
});

afterAll(async () => {
  await db.close();
});

describe("assertLeastPrivilege", () => {
  it("passes the application role", async () => {
    await db.exec(`SET ROLE ${APP_ROLE}`);
    try {
      await expect(assertLeastPrivilege(adapt(db))).resolves.toBeUndefined();
    } finally {
      await db.exec("RESET ROLE");
    }
  });

  it("refuses a superuser — the API connected as the owner", async () => {
    const refused = assertLeastPrivilege(adapt(db));
    await expect(refused).rejects.toBeInstanceOf(OverPrivilegedRoleError);
    await expect(refused).rejects.toThrow(/is a superuser/);
  });

  it("refuses the application role once a credential table is granted to it by hand", async () => {
    await db.exec(`GRANT SELECT ON app_session TO ${APP_ROLE}`);
    await db.exec(`SET ROLE ${APP_ROLE}`);
    try {
      await expect(assertLeastPrivilege(adapt(db))).rejects.toThrow(/can reach app_session directly/);
    } finally {
      await db.exec("RESET ROLE");
      await db.exec(`REVOKE SELECT ON app_session FROM ${APP_ROLE}`);
    }
  });

  it("refuses when the check gives no answer, rather than reading silence as a pass", async () => {
    for (const rows of [[], [{ violations: null }]]) {
      const silent: LeastPrivilegeQueryable = {
        async $queryRawUnsafe<T>() {
          return rows as T[];
        },
      };
      await expect(assertLeastPrivilege(silent)).rejects.toThrow(/returned no answer/);
    }
  });

  it("names every violation in its refusal", async () => {
    const two: LeastPrivilegeQueryable = {
      async $queryRawUnsafe<T>() {
        return [{ violations: ["is a superuser", "bypasses row security"] }] as T[];
      },
    };
    const error = await assertLeastPrivilege(two).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(OverPrivilegedRoleError);
    expect((error as OverPrivilegedRoleError).violations).toEqual(["is a superuser", "bypasses row security"]);
  });
});
