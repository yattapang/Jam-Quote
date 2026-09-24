/**
 * Does the audit trail hold up when attacked, against a real database?
 *
 * Four claims, and the first two are the ones that make it worth having:
 *
 *   1. The application CANNOT rewrite or delete an entry — proved with the grants deliberately
 *      given, so the test shows the policy denying it rather than the grant being absent.
 *   2. An entry is atomic with its change — proved by rolling the transaction back.
 *   3. A tenant reads its own trail, including entries recording what OUR staff did to it.
 *   4. A credential cannot reach `details`.
 *
 * WHAT IT DOES NOT PROVE
 *
 * - Not that every audited action actually calls `record()`. That guard belongs with the modules
 *   that perform those actions, and today only tenancy and user changes exist. Owed.
 * - Nothing about `platform_audit_entry` — tenant-less staff actions have nowhere to go yet, and
 *   the design says why building it now would be a table nothing writes to.
 * - Nothing about retention. ADR 0020 sets the policy; the job that enforces it does not exist,
 *   and when it does it must record its own entry before deleting anything.
 * - Nothing about reading the trail through an API. There is no route.
 */
import { PGlite } from "@electric-sql/pglite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { APP_ROLE, applyMigrations } from "@pryvis/db/test-support";
import { newRowId } from "@pryvis/core";

import { AuditEntryRejected, record } from "./audit.js";
import { type TransactionalClient, withTenant } from "../tenancy/tenant-context.js";

const TENANT_A = "01927f5a-0000-7000-8000-00000000000a";
const TENANT_B = "01927f5a-0000-7000-8000-00000000000b";
const USER_A = "01927f5a-0000-7000-8000-0000000000aa";

let db: PGlite;
let client: TransactionalClient;

function adapt(pg: PGlite): TransactionalClient {
  const c: TransactionalClient = {
    async $executeRawUnsafe(query, ...values) {
      return (await pg.query(query, values)).affectedRows ?? 0;
    },
    async $transaction(fn) {
      await pg.exec("BEGIN");
      try {
        const out = await fn(c);
        await pg.exec("COMMIT");
        return out;
      } catch (error) {
        await pg.exec("ROLLBACK");
        throw error;
      }
    },
  };
  return c;
}

beforeEach(async () => {
  db = new PGlite();
  await applyMigrations(db);

  for (const [id, name] of [
    [TENANT_A, "Tenant A"],
    [TENANT_B, "Tenant B"],
  ] as const) {
    await db.query(
      `INSERT INTO tenant (id, name, country_code, currency, updated_at)
       VALUES ($1, $2, 'JM', 'JMD', now())`,
      [id, name],
    );
  }
  await db.query(
    `INSERT INTO app_user (id, tenant_id, email, role, updated_at)
     VALUES ($1, $2, 'owner@example.com', 'owner', now())`,
    [USER_A, TENANT_A],
  );

  await db.exec(`SET ROLE ${APP_ROLE};`);
  client = adapt(db);
});

afterEach(async () => {
  await db.close();
});

/**
 * Reads a tenant's trail the way the tenant would: inside their tenant context, with no WHERE
 * clause of its own, so the row-level-security policy is what decides what comes back.
 */
async function trail(tenantId: string) {
  return withTenant(client, tenantId, async () => {
    const rows = await db.query<{ action: string; summary: string; actor_kind: string }>(
      `SELECT action, summary, actor_kind FROM audit_entry ORDER BY occurred_at, id`,
    );
    return rows.rows;
  });
}

describe("the application cannot rewrite history", () => {
  beforeEach(async () => {
    await withTenant(client, TENANT_A, (tx) =>
      record(
        tx,
        {
          tenantId: TENANT_A,
          actorKind: "tenant_user",
          actorUserId: USER_A,
          action: "tenant.profile_changed",
          subject: { type: "tenant", id: TENANT_A },
          summary: "Changed the business name",
        },
        newRowId,
      ),
    );
  });

  it("refuses an UPDATE even though the role has been granted it", async () => {
    // THE POINT OF THIS TEST. The harness grants SELECT, INSERT, UPDATE, DELETE on every table,
    // so this is not passing because the grant was withheld — it passes because the table has no
    // policy permitting UPDATE, and Postgres denies a command with no permissive policy. A test
    // that relied on the grant being absent could be made to pass by loosening ops config, which
    // would make the control theatre.
    const granted = await db.query<{ has: boolean }>(
      `SELECT has_table_privilege($1, 'audit_entry', 'UPDATE') AS has`,
      [APP_ROLE],
    );
    expect(granted.rows[0]!.has, "the grant must be present for this test to mean anything").toBe(
      true,
    );

    await withTenant(client, TENANT_A, async () => {
      const result = await db.query(`UPDATE audit_entry SET summary = 'rewritten'`);
      expect(result.affectedRows ?? 0).toBe(0);
    });

    const after = await trail(TENANT_A);
    expect(after[0]!.summary).toBe("Changed the business name");
  });

  it("refuses a DELETE even though the role has been granted it", async () => {
    const granted = await db.query<{ has: boolean }>(
      `SELECT has_table_privilege($1, 'audit_entry', 'DELETE') AS has`,
      [APP_ROLE],
    );
    expect(granted.rows[0]!.has).toBe(true);

    await withTenant(client, TENANT_A, async () => {
      const result = await db.query(`DELETE FROM audit_entry`);
      expect(result.affectedRows ?? 0).toBe(0);
    });

    expect(await trail(TENANT_A)).toHaveLength(1);
  });

  it("has no policy permitting UPDATE or DELETE, which is what enforces the above", async () => {
    // Asserted structurally as well as behaviourally: the absence IS the control, so a future
    // migration adding an UPDATE policy must fail something.
    const policies = await db.query<{ cmd: string }>(
      `SELECT p.polcmd::text AS cmd
         FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
        WHERE c.relname = 'audit_entry'`,
    );
    const commands = policies.rows.map((r) => r.cmd).sort();

    // 'r' = SELECT, 'a' = INSERT. Anything else here is a hole.
    expect(commands).toEqual(["a", "r"]);
  });
});

describe("an entry is atomic with the change it describes", () => {
  it("disappears when the transaction rolls back", async () => {
    // Without this, a rolled-back change can leave an entry saying it happened — and during an
    // incident that entry is trusted.
    await expect(
      withTenant(client, TENANT_A, async (tx) => {
        await record(
          tx,
          {
            tenantId: TENANT_A,
            actorKind: "tenant_user",
            actorUserId: USER_A,
            action: "user.role_changed",
            subject: { type: "app_user", id: USER_A },
            summary: "Promoted to owner",
          },
          newRowId,
        );
        throw new Error("the change failed after the entry was written");
      }),
    ).rejects.toThrow("the change failed");

    expect(await trail(TENANT_A)).toHaveLength(0);
  });

  it("commits with the change when the change succeeds", async () => {
    await withTenant(client, TENANT_A, async (tx) => {
      await tx.$executeRawUnsafe(
        `UPDATE app_user SET role = 'staff', version = version + 1 WHERE id = $1`,
        USER_A,
      );
      await record(
        tx,
        {
          tenantId: TENANT_A,
          actorKind: "tenant_user",
          actorUserId: USER_A,
          action: "user.role_changed",
          subject: { type: "app_user", id: USER_A },
          summary: "Changed role to staff",
        },
        newRowId,
      );
    });

    const entries = await trail(TENANT_A);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.action).toBe("user.role_changed");
  });
});

describe("a tenant sees its own trail, and only its own", () => {
  it("hides another tenant's entries", async () => {
    await withTenant(client, TENANT_A, (tx) =>
      record(
        tx,
        {
          tenantId: TENANT_A,
          actorKind: "tenant_user",
          actorUserId: USER_A,
          action: "tenant.profile_changed",
          subject: { type: "tenant", id: TENANT_A },
          summary: "A's entry",
        },
        newRowId,
      ),
    );

    expect(await trail(TENANT_A)).toHaveLength(1);
    expect(await trail(TENANT_B)).toHaveLength(0);
  });

  it("refuses an entry planted in another tenant's trail", async () => {
    // The WITH CHECK half. Without it, a caller in tenant A could write into B's history — a
    // forged record in someone else's evidence, which is worse than a read.
    await expect(
      withTenant(client, TENANT_A, (tx) =>
        record(
          tx,
          {
            tenantId: TENANT_B,
            actorKind: "tenant_user",
            actorUserId: USER_A,
            action: "tenant.suspended",
            subject: { type: "tenant", id: TENANT_B },
            summary: "Planted",
          },
          newRowId,
        ),
      ),
    ).rejects.toThrow(/row-level security/i);
  });

  it("lets a tenant read what OUR staff did to them", async () => {
    // The property Rule 5.1 asks for and the one most likely to be quietly lost: an impersonation
    // the tenant cannot see is an invisible power.
    await withTenant(client, TENANT_A, (tx) =>
      record(
        tx,
        {
          tenantId: TENANT_A,
          actorKind: "platform_staff",
          actorUserId: USER_A,
          action: "staff.impersonation_started",
          subject: { type: "tenant", id: TENANT_A },
          summary: "Support signed in as this business to investigate a failed invoice",
          details: { reason: "customer reported an invoice would not send", ticket: "PRY-104" },
        },
        newRowId,
      ),
    );

    const entries = await trail(TENANT_A);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.actor_kind).toBe("platform_staff");
    expect(entries[0]!.summary).toMatch(/Support signed in/);
  });
});

describe("what an entry refuses to carry", () => {
  const base = {
    tenantId: TENANT_A,
    actorKind: "tenant_user" as const,
    actorUserId: USER_A,
    action: "user.password_changed" as const,
    subject: { type: "app_user" as const, id: USER_A },
    summary: "Changed their password",
  };

  it("refuses a credential in details, however nested", async () => {
    // The realistic mistake is not writing `password:` on purpose — it is
    // `details: { user: requestBody }` where the body still holds one.
    for (const details of [
      { password: "correct horse battery staple" },
      { user: { email: "a@b.com", passwordHash: "scrypt$..." } },
      { session: { sessionId: "abc" } },
      { recovery: { otp: "123456" } },
      { deep: { deeper: { apiToken: "sk-live-..." } } },
    ]) {
      await expect(
        withTenant(client, TENANT_A, (tx) => record(tx, { ...base, details }, newRowId)),
        JSON.stringify(details),
      ).rejects.toThrow(AuditEntryRejected);
    }
  });

  it("allows details that describe the change without containing it", async () => {
    await withTenant(client, TENANT_A, (tx) =>
      record(
        tx,
        { ...base, details: { changedBy: "self", strengthMet: true, at: "2026-09-24" } },
        newRowId,
      ),
    );

    expect(await trail(TENANT_A)).toHaveLength(1);
  });

  it("refuses a human action with no actor", async () => {
    await expect(
      withTenant(client, TENANT_A, (tx) =>
        record(tx, { ...base, actorUserId: null }, newRowId),
      ),
    ).rejects.toThrow(/must name its actor/);
  });

  it("refuses a system action that claims an actor", async () => {
    await expect(
      withTenant(client, TENANT_A, (tx) =>
        record(tx, { ...base, actorKind: "system", actorUserId: USER_A }, newRowId),
      ),
    ).rejects.toThrow(/has no actor/);
  });

  it("refuses an empty summary", async () => {
    await expect(
      withTenant(client, TENANT_A, (tx) => record(tx, { ...base, summary: "   " }, newRowId)),
    ).rejects.toThrow(/one-sentence summary/);
  });
});
