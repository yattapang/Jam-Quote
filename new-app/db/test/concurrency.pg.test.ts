/**
 * The concurrency claims, raced against real PostgreSQL — the two-connection test owed since review 3.
 *
 * ## WHY THIS FILE EXISTS
 *
 * Every other suite runs on PGlite: one connection, so every "a lock serialises this" in the migrations
 * was read, never raced. The third J4 re-review raced real sessions and found the L6 lock did not cover
 * a seal racing an ACCEPTANCE: money landed on a superseded revision, K6's stuck state, entered by
 * timing (N4). `20260927110000_one_lock_per_quote` is the fix; this file is the proof, and it also
 * finally races the case the ceiling's balance lock was built for: two invoices, each under the ceiling,
 * together over it.
 *
 * ## HOW A RACE IS MADE DETERMINISTIC
 *
 * Session A opens a transaction and does its write. Session B starts its write and is NOT awaited; the
 * test polls `pg_stat_activity` until B is **waiting on a lock** — proof that B reached the lock and
 * stopped, rather than a timer guessing it probably did. Then A commits, and B's outcome is asserted.
 * If B never waits, that is itself a failure: the lock the test is about was not taken.
 *
 * ## WHEN THERE IS NO POSTGRESQL
 *
 * It needs `PRYVIS_PG_URL` (a superuser connection; a throwaway database is created and dropped per
 * run). Without it the suite is SKIPPED with a warning printed — and it FAILS instead when
 * `PRYVIS_REQUIRE_PG` is set, which CI sets, so a missing database cannot turn into a silent pass.
 *
 * ## WHAT THIS DOES NOT PROVE (Rule 21.4)
 *
 * - One interleaving per race, hand-scheduled — not a stress run, and not every possible interleaving.
 * - PostgreSQL 16 only. The isolation level is the default, READ COMMITTED; the migrations assume it.
 * - Deadlocks (N5) are not tested: they are detected by PostgreSQL and abort one transaction, which the
 *   application must retry, and that application does not exist yet.
 */
import { APP_ROLE, migrationNames, migrationSql } from "@pryvis/db/test-support";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const URL = process.env.PRYVIS_PG_URL;
const REQUIRED = Boolean(process.env.PRYVIS_REQUIRE_PG);

const TENANT = "11111111-1111-4111-8111-111111111111";
const USER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CLIENT = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

let admin: pg.Client;
let owner: pg.Client;
let databaseName = "";
let databaseUrl = "";
let ids = 0;

function id(): string {
  ids += 1;
  return `f0000000-0000-4000-8000-${String(ids).padStart(12, "0")}`;
}

/** A session as the unprivileged application role, scoped to the tenant — what production connects as. */
async function session() {
  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  await client.query(`SET ROLE ${APP_ROLE}`);
  await client.query(`SELECT set_config('app.tenant_id', $1, false)`, [TENANT]);
  // A lock bug must fail this test, not hang it.
  await client.query(`SET statement_timeout = '20s'`);
  const [row] = (await client.query<{ pid: number }>(`SELECT pg_backend_pid() AS pid`)).rows;
  return { client, pid: row!.pid };
}

/** Resolves once `pid` is waiting on a lock; fails if it never does. */
async function waitsOnLock(pid: number): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt++) {
    const rows = (
      await admin.query(
        `SELECT 1 FROM pg_stat_activity WHERE pid = $1 AND datname = $2 AND wait_event_type = 'Lock'`,
        [pid, databaseName],
      )
    ).rows;
    if (rows.length > 0) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`session ${pid} never waited on a lock — the lock under test was not taken`);
}

/** Settles a pending query into a value the test can assert on either way. */
async function outcome(pending: Promise<unknown>): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await pending;
    return { ok: true };
  } catch (error) {
    return { ok: false, error: (error as Error).message };
  }
}

async function newQuote(): Promise<string> {
  const quote = id();
  await owner.query(
    `INSERT INTO quote (id, tenant_id, client_id, title, currency, updated_at)
     VALUES ($1, $2, $3, 'Fence', 'JMD', now())`,
    [quote, TENANT, CLIENT],
  );
  return quote;
}

function sealSql(issueId: string, quote: string, revision: number, total: number) {
  return {
    text: `INSERT INTO quote_issue
             (id, tenant_id, quote_id, revision, client_id, client_name, title, client_detail_level,
              currency, terms_text, tax_rate_basis_points, subtotal_minor, tax_minor, total_minor,
              sealed_at, sealed_by_user_id, catalog_synced_at)
           VALUES ($1, $2, $3, $4, $5, 'Delroy', 'Fence', 'itemised', 'JMD', 'Terms', 0, $6, 0, $6,
                   now(), $7, now())`,
    values: [issueId, TENANT, quote, revision, CLIENT, total, USER],
  };
}

async function seal(client: pg.Client, quote: string, revision: number, total = 100_000) {
  const issueId = id();
  await client.query(sealSql(issueId, quote, revision, total));
  return issueId;
}

async function accept(client: pg.Client, issueId: string) {
  const acceptanceId = id();
  await client.query(
    `INSERT INTO acceptance (id, tenant_id, issue_id, outcome, signer_name, consented_to_sign, occurred_at)
     VALUES ($1, $2, $3, 'accepted', 'A Client', true, now())`,
    [acceptanceId, TENANT, issueId],
  );
  await client.query(`SELECT issue_balance_open($1)`, [issueId]);
  return acceptanceId;
}

function invoiceSql(issueId: string, amount: number) {
  return {
    text: `INSERT INTO invoice (id, tenant_id, issue_id, kind, amount_minor, currency, issued_at)
           VALUES ($1, $2, $3, 'progress', $4, 'JMD', now())`,
    values: [id(), TENANT, issueId, amount],
  };
}

function variationSql(issueId: string, amount: number) {
  return {
    text: `INSERT INTO variation (id, tenant_id, issue_id, description, amount_minor,
                                  recorded_by_user_id, occurred_at)
           VALUES ($1, $2, $3, 'race', $4, $5, now())`,
    values: [id(), TENANT, issueId, amount, USER],
  };
}

async function figures(issueId: string) {
  const [row] = (
    await owner.query<{ invoiced: string; ceiling: string; state: string }>(
      `SELECT COALESCE((SELECT invoiced_total_minor FROM issue_balance WHERE issue_id = $1), 0) AS invoiced,
              issue_ceiling_minor($1) AS ceiling, quote_issue_state($1) AS state`,
      [issueId],
    )
  ).rows;
  return { invoiced: Number(row!.invoiced), ceiling: Number(row!.ceiling), state: row!.state };
}

/** The issue is not stuck: a recompute runs, and what is billed is within the ceiling. */
async function notStuck(issueId: string) {
  const s = await session();
  try {
    if ((await s.client.query(`SELECT 1 FROM issue_balance WHERE issue_id = $1`, [issueId])).rowCount) {
      await s.client.query(`SELECT issue_balance_apply($1)`, [issueId]);
    }
    const f = await figures(issueId);
    expect(f.invoiced).toBeLessThanOrEqual(f.ceiling);
  } finally {
    await s.client.end();
  }
}

const suite = URL ? describe : describe.skip;

if (!URL) {
  if (REQUIRED) {
    describe("concurrency against real PostgreSQL", () => {
      it("has a database to race against", () => {
        throw new Error("PRYVIS_REQUIRE_PG is set but PRYVIS_PG_URL is not: the concurrency proof did not run");
      });
    });
  } else {
    console.warn(
      "\n*** concurrency.pg.test.ts SKIPPED: PRYVIS_PG_URL is not set, so NO concurrency claim was raced. ***\n",
    );
  }
}

suite("concurrency against real PostgreSQL", () => {
  beforeAll(async () => {
    admin = new pg.Client({ connectionString: URL });
    await admin.connect();
    databaseName = `pryvis_race_${process.pid}_${Date.now()}`;
    await admin.query(`CREATE DATABASE ${databaseName}`);
    const target = new globalThis.URL(URL!);
    target.pathname = `/${databaseName}`;
    databaseUrl = target.toString();

    owner = new pg.Client({ connectionString: databaseUrl });
    await owner.connect();
    for (const name of await migrationNames()) {
      await owner.query(await migrationSql(name));
    }
    // The role is cluster-wide, so a previous run may have made it.
    await owner.query(`DO $$ BEGIN
                         IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${APP_ROLE}') THEN
                           CREATE ROLE ${APP_ROLE} NOLOGIN;
                         END IF;
                       END $$`);
    await owner.query(`GRANT USAGE ON SCHEMA public TO ${APP_ROLE};
                       GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${APP_ROLE}`);
    await owner.query(
      `INSERT INTO tenant (id, name, country_code, currency, updated_at)
       VALUES ($1, 'Delroy Construction', 'JM', 'JMD', now())`,
      [TENANT],
    );
    await owner.query(
      `INSERT INTO app_user (id, tenant_id, email, role, session_version, updated_at)
       VALUES ($1, $2, 'delroy@example.com', 'owner', 0, now())`,
      [USER, TENANT],
    );
    await owner.query(
      `INSERT INTO client (id, tenant_id, name, updated_at) VALUES ($1, $2, 'A Client', now())`,
      [CLIENT, TENANT],
    );
    // The owner runs as the superuser that created the database, so it sees every row: used only for
    // set-up and for reading the figures afterwards, never for a write under test.
  }, 120_000);

  afterAll(async () => {
    await owner?.end();
    if (admin && databaseName) {
      await admin.query(`DROP DATABASE IF EXISTS ${databaseName} WITH (FORCE)`);
      await admin.end();
    }
  });

  it("N4 (a) · a seal in flight holds back an acceptance and an invoice on the revision it supersedes", async () => {
    // The re-review's race: while revision 2 is being sealed, revision 1 is accepted and invoiced in
    // other sessions. Before the quote lock both committed and revision 1 was left superseded with
    // 50,000 billed against a ceiling of 0.
    const quote = await newQuote();
    const setup = await session();
    const rev1 = await seal(setup.client, quote, 1);
    await setup.client.end();

    const a = await session();
    const b = await session();
    const c = await session();
    try {
      await a.client.query("BEGIN");
      await seal(a.client, quote, 2);

      const accepting = outcome(accept(b.client, rev1));
      await waitsOnLock(b.pid);
      const invoicing = outcome(c.client.query(invoiceSql(rev1, 50_000)));
      await waitsOnLock(c.pid);

      await a.client.query("COMMIT");
      await accepting;
      const invoiced = await invoicing;

      expect(invoiced.ok).toBe(false);
      const f = await figures(rev1);
      expect(f.state).toBe("superseded");
      expect(f.invoiced).toBe(0);
      await notStuck(rev1);
    } finally {
      for (const s of [a, b, c]) await s.client.end();
    }
  });

  it("N4 (b) · a seal waits for another seal's transaction and judges the revision that one made", async () => {
    // Revision 2 is sealed, accepted and invoiced inside one open transaction; revision 3 is sealed
    // concurrently. Before the fix the second seal had already chosen revision 1 as "latest" before it
    // waited, and never chose again.
    const quote = await newQuote();
    const setup = await session();
    const rev1 = await seal(setup.client, quote, 1);
    await accept(setup.client, rev1);
    await setup.client.end();

    const a = await session();
    const b = await session();
    try {
      await a.client.query("BEGIN");
      const rev2 = await seal(a.client, quote, 2);
      await accept(a.client, rev2);
      await a.client.query(invoiceSql(rev2, 50_000));

      const sealing = outcome(seal(b.client, quote, 3));
      await waitsOnLock(b.pid);
      await a.client.query("COMMIT");

      const result = await sealing;
      expect(result.ok).toBe(false);
      expect(result.ok ? "" : result.error).toMatch(/revision 2 is accepted and has 1 invoice/);
      expect((await figures(rev2)).state).not.toBe("superseded");
      await notStuck(rev2);
    } finally {
      for (const s of [a, b]) await s.client.end();
    }
  });

  it("L6 · a variation in flight holds back the seal that would supersede its revision", async () => {
    const quote = await newQuote();
    const setup = await session();
    const rev1 = await seal(setup.client, quote, 1);
    await accept(setup.client, rev1);
    await setup.client.end();

    const a = await session();
    const b = await session();
    try {
      await a.client.query("BEGIN");
      await a.client.query(variationSql(rev1, 10_000));

      const sealing = outcome(seal(b.client, quote, 2));
      await waitsOnLock(b.pid);
      await a.client.query("COMMIT");

      const result = await sealing;
      expect(result.ok).toBe(false);
      expect(result.ok ? "" : result.error).toMatch(/Money has moved/);
    } finally {
      for (const s of [a, b]) await s.client.end();
    }
  });

  it("L6 · a seal in flight holds back a variation on the revision it supersedes", async () => {
    const quote = await newQuote();
    const setup = await session();
    const rev1 = await seal(setup.client, quote, 1);
    await accept(setup.client, rev1);
    await setup.client.end();

    const a = await session();
    const b = await session();
    try {
      await a.client.query("BEGIN");
      await seal(a.client, quote, 2);

      const varying = outcome(b.client.query(variationSql(rev1, 10_000)));
      await waitsOnLock(b.pid);
      await a.client.query("COMMIT");

      const result = await varying;
      expect(result.ok).toBe(false);
      expect(result.ok ? "" : result.error).toMatch(/superseded or no longer accepted/);
    } finally {
      for (const s of [a, b]) await s.client.end();
    }
  });

  it("R1.24a · two invoices, each under the ceiling and together over it, cannot both commit", async () => {
    // The case the balance row lock was built for (G2), owed as a raced test since review 3.
    const quote = await newQuote();
    const setup = await session();
    const rev1 = await seal(setup.client, quote, 1);
    await accept(setup.client, rev1);
    await setup.client.end();

    const a = await session();
    const b = await session();
    try {
      await a.client.query("BEGIN");
      await a.client.query(invoiceSql(rev1, 60_000));

      const second = outcome(b.client.query(invoiceSql(rev1, 60_000)));
      await waitsOnLock(b.pid);
      await a.client.query("COMMIT");

      const result = await second;
      expect(result.ok).toBe(false);
      expect(result.ok ? "" : result.error).toMatch(/exceeds the ceiling 100000/);
      expect((await figures(rev1)).invoiced).toBe(60_000);
    } finally {
      for (const s of [a, b]) await s.client.end();
    }
  });

  it("K4 · a withdrawal waits for an invoice in flight, then sees it and refuses", async () => {
    const quote = await newQuote();
    const setup = await session();
    const rev1 = await seal(setup.client, quote, 1);
    const acceptanceId = await accept(setup.client, rev1);
    await setup.client.end();

    const a = await session();
    const b = await session();
    try {
      await a.client.query("BEGIN");
      await a.client.query(invoiceSql(rev1, 10_000));

      const withdrawing = outcome(
        b.client.query(
          `INSERT INTO acceptance_withdrawal (id, tenant_id, acceptance_id, reason, withdrawn_by_user_id)
           VALUES ($1, $2, $3, 'race', $4)`,
          [id(), TENANT, acceptanceId, USER],
        ),
      );
      await waitsOnLock(b.pid);
      await a.client.query("COMMIT");

      const result = await withdrawing;
      expect(result.ok).toBe(false);
      expect(result.ok ? "" : result.error).toMatch(/still have money billed/);
      await notStuck(rev1);
    } finally {
      for (const s of [a, b]) await s.client.end();
    }
  });
});
