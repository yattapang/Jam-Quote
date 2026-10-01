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
 * - PostgreSQL 16 only. The migrations REQUIRE READ COMMITTED and refuse financial writes outside it;
 *   the P1 race proves the refusal (this line said "assume" until 2026-09-27; Q5).
 * - The deadlocks that remain are not asserted absent. The P3 and lock-order races prove the cycles they
 *   name are gone; the shared-to-exclusive upgrade on one quote (write, then seal, in one transaction)
 *   and transactions spanning two quotes still deadlock, are detected (SQLSTATE 40P01) and must be
 *   retried by an application that does not exist yet.
 */
import { APP_ROLE, migrationNames, migrationSql } from "@pryvis/db/test-support";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const URL = process.env.PRYVIS_PG_URL;
const REQUIRED = Boolean(process.env.PRYVIS_REQUIRE_PG);

const TENANT = "11111111-1111-4111-8111-111111111111";
const USER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CLIENT = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
// A second tenant, for P2: one tenant must not be able to take, or wait on, another's quote lock.
const OTHER_TENANT = "22222222-2222-4222-8222-222222222222";
const OTHER_USER = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const OTHER_CLIENT = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

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
async function session(tenant = TENANT) {
  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  await client.query(`SET ROLE ${APP_ROLE}`);
  await client.query(`SELECT set_config('app.tenant_id', $1, false)`, [tenant]);
  // A lock bug must fail this test, not hang it.
  await client.query(`SET statement_timeout = '20s'`);
  const [row] = (await client.query<{ pid: number }>(`SELECT pg_backend_pid() AS pid`)).rows;
  return { client, pid: row!.pid };
}

/**
 * Resolves once `pid` is waiting on the KIND of lock the race is about; fails if it never does.
 *
 * The kind matters (finding P5): the first version accepted any lock wait, so two races that were
 * credited to the quote lock were in fact waiting on the balance row, and removing the quote lock from
 * withdrawal broke nothing. `quote` is the advisory per-quote lock; `row` is the balance row lock, which
 * surfaces as a wait on the holding transaction.
 */
async function waitsOnLock(pid: number, kind: "quote" | "row"): Promise<void> {
  const events = kind === "quote" ? ["advisory"] : ["transactionid", "tuple"];
  let seen = "";
  for (let attempt = 0; attempt < 100; attempt++) {
    const [row] = (
      await admin.query<{ event: string }>(
        `SELECT wait_event AS event FROM pg_stat_activity
          WHERE pid = $1 AND datname = $2 AND wait_event_type = 'Lock'`,
        [pid, databaseName],
      )
    ).rows;
    if (row && events.includes(row.event)) return;
    if (row) seen = row.event;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(
    `session ${pid} never waited on the ${kind} lock${seen ? ` (it waited on "${seen}")` : ""} — the lock under test was not taken`,
  );
}

/**
 * Resolves once `pid` waits on the per-ISSUE response lock (J13) — not the quote lock, which responses
 * take shared and so never wait on each other. The issue lock uses the two-key advisory form, which
 * `pg_locks` reports with objsubid 2; the quote lock's one-key form is objsubid 1.
 */
async function waitsOnIssueLock(pid: number): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt++) {
    const rows = (
      await admin.query(
        `SELECT 1 FROM pg_locks
          WHERE pid = $1 AND NOT granted AND locktype = 'advisory' AND objsubid = 2`,
        [pid],
      )
    ).rows;
    if (rows.length > 0) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`session ${pid} never waited on the per-issue response lock`);
}

/** A client response with its own render (R9), without opening a balance. */
function respondSql(issueId: string, outcome: "accepted" | "declined") {
  return {
    text: `WITH r AS (
             INSERT INTO document_render (id, tenant_id, issue_id, storage_key, sha256, byte_size, settings)
             VALUES (gen_random_uuid(), $2, $3, 'test/render.pdf',
                     encode(sha256(gen_random_uuid()::text::bytea), 'hex'), 1, '{}')
             RETURNING id)
           INSERT INTO acceptance (id, tenant_id, issue_id, document_render_id, outcome, signer_name,
                                   consented_to_sign, occurred_at)
           SELECT $1, $2, $3, r.id, $4, 'A Client', true, now() FROM r`,
    values: [id(), TENANT, issueId, outcome],
  };
}

/** Settles `pending` within `ms`, or reports that it was still blocked — for "must NOT wait" claims. */
async function withinMs(pending: Promise<unknown>, ms: number) {
  const timer = new Promise<"blocked">((resolve) => setTimeout(() => resolve("blocked"), ms));
  return Promise.race([outcome(pending), timer]);
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
  // Every acceptance records its own issue's render (R9), so render first, in one statement.
  await client.query(
    `WITH r AS (
       INSERT INTO document_render (id, tenant_id, issue_id, storage_key, sha256, byte_size, settings)
       VALUES (gen_random_uuid(), $2, $3, 'test/render.pdf',
               encode(sha256(gen_random_uuid()::text::bytea), 'hex'), 1, '{}')
       RETURNING id)
     INSERT INTO acceptance (id, tenant_id, issue_id, document_render_id, outcome, signer_name,
                             consented_to_sign, occurred_at)
     SELECT $1, $2, $3, r.id, 'accepted', 'A Client', true, now() FROM r`,
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
    await owner.query(
      `INSERT INTO tenant (id, name, country_code, currency, updated_at)
       VALUES ($1, 'Someone Else', 'JM', 'JMD', now())`,
      [OTHER_TENANT],
    );
    await owner.query(
      `INSERT INTO app_user (id, tenant_id, email, role, session_version, updated_at)
       VALUES ($1, $2, 'other@example.com', 'owner', 0, now())`,
      [OTHER_USER, OTHER_TENANT],
    );
    await owner.query(
      `INSERT INTO client (id, tenant_id, name, updated_at) VALUES ($1, $2, 'Their Client', now())`,
      [OTHER_CLIENT, OTHER_TENANT],
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
      await waitsOnLock(b.pid, "quote");
      const invoicing = outcome(c.client.query(invoiceSql(rev1, 50_000)));
      await waitsOnLock(c.pid, "quote");

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
      await waitsOnLock(b.pid, "quote");
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
      await waitsOnLock(b.pid, "quote");
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
      await waitsOnLock(b.pid, "quote");
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
      await waitsOnLock(b.pid, "row");
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
      await waitsOnLock(b.pid, "row");
      await a.client.query("COMMIT");

      const result = await withdrawing;
      expect(result.ok).toBe(false);
      expect(result.ok ? "" : result.error).toMatch(/still have money billed/);
      await notStuck(rev1);
    } finally {
      for (const s of [a, b]) await s.client.end();
    }
  });

  it("P1 · refuses a financial write outside READ COMMITTED, so a stale snapshot cannot judge the ceiling", async () => {
    // The fourth re-review's case: a writer under REPEATABLE READ reads once, a seal of revision 2
    // commits, then the writer invoices revision 1 — judged on its old snapshot, 50,000 landed on a
    // superseded revision with a ceiling of 0. No race was needed. Now the write is refused outright.
    const quote = await newQuote();
    const setup = await session();
    const rev1 = await seal(setup.client, quote, 1);
    await accept(setup.client, rev1);
    await setup.client.end();

    for (const level of ["REPEATABLE READ", "SERIALIZABLE"]) {
      const w = await session();
      try {
        await w.client.query(`BEGIN ISOLATION LEVEL ${level}`);
        await w.client.query(`SELECT count(*) FROM quote_issue`); // takes the snapshot
        const result = await outcome(w.client.query(invoiceSql(rev1, 50_000)));
        expect(result.ok).toBe(false);
        expect(result.ok ? "" : result.error).toMatch(/must run under READ COMMITTED/);
        await w.client.query("ROLLBACK");
        // Q5: opening a balance row was the one financial write that skipped the lock, and so the check.
        await w.client.query(`BEGIN ISOLATION LEVEL ${level}`);
        const opened = await outcome(w.client.query(`SELECT issue_balance_open($1)`, [rev1]));
        expect(opened.ok ? "" : opened.error).toMatch(/must run under READ COMMITTED/);
        await w.client.query("ROLLBACK");
      } finally {
        await w.client.end();
      }
    }
    expect((await figures(rev1)).invoiced).toBe(0);
  });

  it("N4 (c) · an invoice on an already-accepted revision waits for the seal and is refused by the ceiling", async () => {
    // The direct path the fourth re-review found unraced (P4): N4 (a)'s invoice was refused only
    // because no balance row existed yet, so breaking supersession left that race green. Here the
    // revision is accepted first, and the refusal asserted is the superseded revision's zero ceiling.
    const quote = await newQuote();
    const setup = await session();
    const rev1 = await seal(setup.client, quote, 1);
    await accept(setup.client, rev1);
    await setup.client.end();

    const a = await session();
    const c = await session();
    try {
      await a.client.query("BEGIN");
      await seal(a.client, quote, 2);

      const invoicing = outcome(c.client.query(invoiceSql(rev1, 50_000)));
      await waitsOnLock(c.pid, "quote");
      await a.client.query("COMMIT");

      const result = await invoicing;
      expect(result.ok).toBe(false);
      expect(result.ok ? "" : result.error).toMatch(/exceeds the ceiling 0/);
      await notStuck(rev1);
    } finally {
      for (const s of [a, c]) await s.client.end();
    }
  });

  it("P5 · a withdrawal in flight holds back a seal of the next revision, which then proceeds", async () => {
    const quote = await newQuote();
    const setup = await session();
    const rev1 = await seal(setup.client, quote, 1);
    const acceptanceId = await accept(setup.client, rev1);
    await setup.client.end();

    const a = await session();
    const b = await session();
    try {
      await a.client.query("BEGIN");
      await a.client.query(
        `INSERT INTO acceptance_withdrawal (id, tenant_id, acceptance_id, reason, withdrawn_by_user_id)
         VALUES ($1, $2, $3, 'wrong client', $4)`,
        [id(), TENANT, acceptanceId, USER],
      );

      const sealing = outcome(seal(b.client, quote, 2));
      await waitsOnLock(b.pid, "quote");
      await a.client.query("COMMIT");

      // Withdrawn before the seal judged it, so the next revision is allowed.
      expect((await sealing).ok).toBe(true);
    } finally {
      for (const s of [a, b]) await s.client.end();
    }
  });

  it("P5 · financial writes on one quote do not block each other — the lock really is shared", async () => {
    const quote = await newQuote();
    const setup = await session();
    const rev1 = await seal(setup.client, quote, 1);
    await accept(setup.client, rev1);
    await setup.client.end();

    const a = await session();
    const b = await session();
    try {
      await a.client.query("BEGIN");
      await a.client.query(invoiceSql(rev1, 10_000)); // holds the shared quote lock until commit

      // A second shared holder on the same quote must not wait while A is still open.
      const second = await withinMs(b.client.query(`SELECT quote_money_lock($1, false)`, [quote]), 3_000);
      expect(second).toEqual({ ok: true });
      await a.client.query("COMMIT");
    } finally {
      for (const s of [a, b]) await s.client.end();
    }
  });

  it("P2 · another tenant can neither take a quote's lock nor wait on it", async () => {
    const quote = await newQuote();
    const setup = await session();
    const rev1 = await seal(setup.client, quote, 1);
    await accept(setup.client, rev1);
    await setup.client.end();

    const a = await session();
    const other = await session(OTHER_TENANT);
    try {
      // The other tenant "takes" the lock exclusively and holds it: it must lock nothing, because the
      // quote is invisible to it under row security.
      await other.client.query("BEGIN");
      await other.client.query(`SELECT quote_money_lock($1, true)`, [quote]);
      const invoicing = await withinMs(a.client.query(invoiceSql(rev1, 10_000)), 3_000);
      expect(invoicing).toEqual({ ok: true });
      await other.client.query("ROLLBACK");

      // And a seal naming this tenant's quote, while this tenant has a write in flight, is refused at
      // once — not after waiting, which would tell the other tenant the quote is busy.
      await a.client.query("BEGIN");
      await a.client.query(invoiceSql(rev1, 10_000));
      const issueId = id();
      const foreignSeal = await withinMs(
        other.client.query({
          text: sealSql(issueId, quote, 2, 100_000).text,
          values: [issueId, OTHER_TENANT, quote, 2, OTHER_CLIENT, 100_000, OTHER_USER],
        }),
        3_000,
      );
      expect(foreignSeal).not.toBe("blocked");
      expect(foreignSeal).toMatchObject({ ok: false });
      await a.client.query("COMMIT");
    } finally {
      for (const s of [a, other]) await s.client.end();
    }
  });

  it("P3 · a direct balance recompute takes the quote lock first, so it cannot deadlock against a seal", async () => {
    // The fourth re-review's D3: T1 recomputes (then only the balance row lock), T2 starts a seal
    // (the quote lock), T1 invoices (waits for the quote lock), T2 recomputes (waits for the row) —
    // SQLSTATE 40P01. With the recompute taking the quote lock first, T2's seal simply waits for T1.
    const quote = await newQuote();
    const setup = await session();
    const rev1 = await seal(setup.client, quote, 1);
    await accept(setup.client, rev1);
    await setup.client.end();

    const t1 = await session();
    const t2 = await session();
    try {
      await t1.client.query("BEGIN");
      await t1.client.query(`SELECT issue_balance_apply($1)`, [rev1]);

      await t2.client.query("BEGIN");
      const sealing = outcome(seal(t2.client, quote, 2));
      await waitsOnLock(t2.pid, "quote");

      const invoiced = await outcome(t1.client.query(invoiceSql(rev1, 10_000)));
      expect(invoiced).toEqual({ ok: true });
      await t1.client.query("COMMIT");

      const sealed = await sealing;
      expect(sealed.ok).toBe(false);
      expect(sealed.ok ? "" : sealed.error).toMatch(/Money has moved/);
      expect(sealed.ok ? "" : sealed.error).not.toMatch(/deadlock/);
      await t2.client.query("ROLLBACK");
    } finally {
      for (const s of [t1, t2]) await s.client.end();
    }
  });

  it("Q3 · lock ORDER: a recompute waiting on a seal holds no balance row lock, so the seal's own recompute proceeds", async () => {
    // The fifth re-review put P3's exact defect back — the recompute taking the balance row lock BEFORE
    // the quote lock — and all twelve races stayed green, because the P3 race only proved the lock was
    // taken, not that it was taken first. Here the order is what decides the outcome: T2 seals (the
    // exclusive quote lock), T1 recomputes (must wait on the quote lock WITHOUT holding the row), then
    // T2 recomputes the same issue. In the wrong order T1 holds the row while it waits and T2's recompute
    // waits on T1: SQLSTATE 40P01.
    const quote = await newQuote();
    const setup = await session();
    const rev1 = await seal(setup.client, quote, 1);
    await accept(setup.client, rev1);
    await setup.client.end();

    const t1 = await session();
    const t2 = await session();
    try {
      await t2.client.query("BEGIN");
      await seal(t2.client, quote, 2);

      const recomputing = outcome(t1.client.query(`SELECT issue_balance_apply($1)`, [rev1]));
      await waitsOnLock(t1.pid, "quote");

      const own = await outcome(t2.client.query(`SELECT issue_balance_apply($1)`, [rev1]));
      expect(own).toEqual({ ok: true });
      await t2.client.query("COMMIT");

      expect(await recomputing).toEqual({ ok: true });
    } finally {
      for (const s of [t1, t2]) await s.client.end();
    }
  });

  it("Q3 · each quote has its own lock: a seal on one quote does not delay a write on another", async () => {
    // Plant A of the fifth re-review: every quote given the same key. All twelve races stayed green, and
    // on that database one tenant's invoice waited for another tenant's seal.
    const quoteX = await newQuote();
    const quoteY = await newQuote();
    const setup = await session();
    await seal(setup.client, quoteX, 1);
    const onY = await seal(setup.client, quoteY, 1);
    await accept(setup.client, onY);
    await setup.client.end();

    const a = await session();
    const b = await session();
    try {
      await a.client.query("BEGIN");
      await seal(a.client, quoteX, 2); // holds X's exclusive lock until commit

      const invoicing = await withinMs(b.client.query(invoiceSql(onY, 10_000)), 3_000);
      expect(invoicing).toEqual({ ok: true });
      await a.client.query("COMMIT");
    } finally {
      for (const s of [a, b]) await s.client.end();
    }
  });

  it("Q3 · another tenant's SHARED lock request on a quote takes nothing, so it cannot delay that quote's seal", async () => {
    // Plant B of the fifth re-review: the visibility check kept on the exclusive path only. The P2 race
    // tried the exclusive path, so it stayed green while another tenant could hold a quote's shared lock
    // and block its seals.
    const quote = await newQuote();
    const setup = await session();
    const rev1 = await seal(setup.client, quote, 1);
    await setup.client.end();

    const a = await session();
    const other = await session(OTHER_TENANT);
    try {
      await other.client.query("BEGIN");
      await other.client.query(`SELECT quote_money_lock($1, false)`, [quote]);

      const sealing = await withinMs(seal(a.client, quote, 2), 3_000);
      expect(sealing).toEqual({ ok: true });
      await other.client.query("ROLLBACK");
      expect((await figures(rev1)).state).toBe("superseded");
    } finally {
      for (const s of [a, other]) await s.client.end();
    }
  });

  it("J13 · a decline arriving while an acceptance is in flight waits on the issue lock, then is refused", async () => {
    // Without the per-issue lock both commit: the shared quote lock lets them run together and neither
    // sees the other's uncommitted row — a decline recorded after an acceptance.
    const quote = await newQuote();
    const setup = await session();
    const issue = await seal(setup.client, quote, 1);
    await setup.client.end();

    const a = await session();
    const b = await session();
    try {
      await a.client.query("BEGIN");
      await a.client.query(respondSql(issue, "accepted"));

      const declining = outcome(b.client.query(respondSql(issue, "declined")));
      await waitsOnIssueLock(b.pid);
      await a.client.query("COMMIT");

      const result = await declining;
      expect(result.ok).toBe(false);
      expect(result.ok ? "" : result.error).toMatch(/a decline cannot follow an acceptance/);
      const [row] = (
        await owner.query<{ accepted: string; declined: string }>(
          `SELECT count(*) FILTER (WHERE outcome = 'accepted') AS accepted,
                  count(*) FILTER (WHERE outcome = 'declined') AS declined
             FROM acceptance WHERE issue_id = $1`,
          [issue],
        )
      ).rows;
      expect(row).toEqual({ accepted: "1", declined: "0" });
    } finally {
      for (const s of [a, b]) await s.client.end();
    }
  });

  it("J13 · an acceptance arriving while a decline is in flight waits, then is accepted", async () => {
    const quote = await newQuote();
    const setup = await session();
    const issue = await seal(setup.client, quote, 1);
    await setup.client.end();

    const a = await session();
    const b = await session();
    try {
      await a.client.query("BEGIN");
      await a.client.query(respondSql(issue, "declined"));

      const accepting = outcome(b.client.query(respondSql(issue, "accepted")));
      await waitsOnIssueLock(b.pid);
      await a.client.query("COMMIT");

      expect(await accepting).toEqual({ ok: true });
    } finally {
      for (const s of [a, b]) await s.client.end();
    }
  });
});
