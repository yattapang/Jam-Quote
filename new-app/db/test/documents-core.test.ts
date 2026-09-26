/**
 * The five invariants ADR 0025 moved out of prose, executed against a real database.
 *
 * ## WHY THIS FILE IS THE POINT
 *
 * Three review passes over the domain model and the PRD each introduced what the next one found:
 * 19 findings, then 17 (four of five blockers created by the amendments that closed the first),
 * then 20 (eleven of them defects in the commit that closed the second). Two findings marked
 * "Closed" were not closed in the document they named. The diagnosis was the medium: **an invariant
 * written in prose in two places drifts every time.**
 *
 * So each invariant now has exactly one definition, in the migration, and this file is what proves
 * it holds. A document cannot be executed; this can.
 *
 * ## WHAT THIS FILE DOES NOT PROVE (Rule 21.4)
 *
 * - **Nothing about true concurrency.** PGlite is a single connection, so "two devices at once"
 *   cannot be simulated here. What is proved is the *serial* case the lock exists to make safe:
 *   two invoices that are each individually under the ceiling and together over it. Real
 *   concurrency needs a two-connection test against Postgres, and it is owed.
 * - **Nothing about the application.** These tests call the functions directly. A repository that
 *   never calls `issue_balance_apply` cannot insert an invoice without it — the policies see to
 *   that — but one that computes a wrong line total is wrong in a way only its own tests catch.
 * - **Nothing about money arithmetic below the ceiling:** per-line GCT, markup, discount, rounding.
 * - **Nothing about the offline path.** Sealing on a device, the outbox and sync are application
 *   concerns; what is proved here is that the database refuses the *outcomes* they must not produce.
 */
import { APP_ROLE, applyMigrations, asSuperuser } from "@pryvis/db/test-support";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

/** Split on newlines. Declared here because inlining the escape has now broken this file
 * twice through a shell heredoc — Rule 22.3, learned the hard way a second time. */
const SPLIT_ON_NEWLINES = new RegExp("\r?\n");

const TENANT = "11111111-1111-4111-8111-111111111111";
const OTHER_TENANT = "22222222-2222-4222-8222-222222222222";
const USER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CLIENT = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const QUOTE = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const SERIES = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";

let db: PGlite;
let ids: number;

/** Deterministic ids: which id was used is never the thing under test. */
function id(): string {
  ids += 1;
  return `f0000000-0000-4000-8000-${String(ids).padStart(12, "0")}`;
}

async function sql<T = Record<string, unknown>>(query: string, params: unknown[] = []) {
  return (await db.query<T>(query, params)).rows;
}

/** Seals an issue for the given revision and returns its id. `total` is in minor units. */
async function seal(revision: number, total: bigint, issueId = id()): Promise<string> {
  await sql(
    `INSERT INTO quote_issue
       (id, tenant_id, quote_id, revision, client_id, client_name, title, client_detail_level,
        currency, terms_text, tax_rate_basis_points, subtotal_minor, tax_minor, total_minor,
        sealed_at, sealed_by_user_id, catalog_synced_at)
     VALUES ($1, $2, $3, $4, $5, 'Delroy', 'Fence', 'itemised', 'JMD', 'Terms', 0, $6, 0, $6,
             now(), $7, now())`,
    [issueId, TENANT, QUOTE, revision, CLIENT, total.toString(), USER],
  );
  return issueId;
}

/** Accepts an issue, which is also what opens its balance row — the two are one transaction. */
async function accept(issueId: string): Promise<string> {
  const acceptanceId = id();
  await db.exec("BEGIN");
  await sql(
    `INSERT INTO acceptance (id, tenant_id, issue_id, outcome, signer_name, consented_to_sign,
                             occurred_at)
     VALUES ($1, $2, $3, 'accepted', 'A Client', true, now())`,
    [acceptanceId, TENANT, issueId],
  );
  await sql(`SELECT issue_balance_open($1)`, [issueId]);
  await db.exec("COMMIT");
  return acceptanceId;
}

/** Issues an invoice and applies the balance, as one transaction — the only safe order. */
async function invoice(issueId: string, amount: bigint): Promise<void> {
  await db.exec("BEGIN");
  try {
    await sql(
      `INSERT INTO invoice (id, tenant_id, issue_id, kind, amount_minor, currency, issued_at)
       VALUES ($1, $2, $3, 'progress', $4, 'JMD', now())`,
      [id(), TENANT, issueId, amount.toString()],
    );
    await sql(`SELECT issue_balance_apply($1)`, [issueId]);
    await db.exec("COMMIT");
  } catch (error) {
    await db.exec("ROLLBACK");
    throw error;
  }
}

async function state(issueId: string): Promise<string> {
  const rows = await sql<{ state: string }>(`SELECT quote_issue_state($1) AS state`, [issueId]);
  return rows[0]!.state;
}

async function balance(issueId: string) {
  const rows = await sql<{
    accepted_total_minor: string;
    variations_total_minor: string;
    invoiced_total_minor: string;
  }>(
    `SELECT accepted_total_minor, variations_total_minor, invoiced_total_minor
       FROM issue_balance WHERE issue_id = $1`,
    [issueId],
  );
  return rows[0]!;
}

/** PGlite hands BIGINT back as a number or a string depending on the path; compare numerically. */
function minor(value: string | number | bigint): number {
  return Number(value);
}

beforeEach(async () => {
  ids = 0;
  db = new PGlite();
  await applyMigrations(db);

  for (const [tenant, name] of [
    [TENANT, "Delroy Construction"],
    [OTHER_TENANT, "Someone Else"],
  ] as const) {
    await db.query(
      `INSERT INTO tenant (id, name, country_code, currency, updated_at)
       VALUES ($1, $2, 'JM', 'JMD', now())`,
      [tenant, name],
    );
  }
  await db.query(
    `INSERT INTO app_user (id, tenant_id, email, role, session_version, updated_at)
     VALUES ($1, $2, 'delroy@example.com', 'owner', 0, now())`,
    [USER, TENANT],
  );
  await db.query(
    `INSERT INTO client (id, tenant_id, name, updated_at) VALUES ($1, $2, 'A Client', now())`,
    [CLIENT, TENANT],
  );
  await db.query(
    `INSERT INTO quote (id, tenant_id, client_id, title, currency, updated_at)
     VALUES ($1, $2, $3, 'Fence', 'JMD', now())`,
    [QUOTE, TENANT, CLIENT],
  );
  await db.query(
    `INSERT INTO number_series (id, tenant_id, document_kind, prefix, updated_at)
     VALUES ($1, $2, 'quote', 'Q-', now())`,
    [SERIES, TENANT],
  );

  await db.exec(`SET ROLE ${APP_ROLE};`);
  await db.query(`SELECT set_config('app.tenant_id', $1, false)`, [TENANT]);
});

afterEach(async () => {
  await db.close();
});

// ===========================================================================
describe("1 · the ceiling, in one expression", () => {
  it("allows invoices up to the accepted total", async () => {
    const issue = await seal(1, 100_000n);
    await accept(issue);

    await invoice(issue, 40_000n);
    await invoice(issue, 60_000n);

    expect(minor((await balance(issue)).invoiced_total_minor)).toBe(100_000);
  });

  it("REFUSES the invoice that would cross the ceiling — the money invariant", async () => {
    // Each invoice is individually under the total; together they are over. A per-row version check
    // does nothing here, which is why finding F4 said the invariant had no owner.
    const issue = await seal(1, 100_000n);
    await accept(issue);
    await invoice(issue, 60_000n);

    await expect(invoice(issue, 60_000n)).rejects.toThrow(/exceeds the ceiling/);

    // And the refusal rolled the invoice back with it: the transaction is the unit, so a refused
    // invoice does not linger.
    const rows = await sql<{ n: bigint }>(`SELECT count(*)::int AS n FROM invoice`);
    expect(Number(rows[0]!.n)).toBe(1);
    expect(minor((await balance(issue)).invoiced_total_minor)).toBe(60_000);
  });

  it("counts a recorded variation into the ceiling, and re-sums rather than trusting the cache", async () => {
    const issue = await seal(1, 100_000n);
    await accept(issue);
    await invoice(issue, 100_000n);

    // The client added a gate. In release 1 this is recorded, not signed — and R1.24d says plainly
    // that this lets the contractor raise their own ceiling.
    await sql(
      `INSERT INTO variation (id, tenant_id, issue_id, description, amount_minor,
                              recorded_by_user_id, occurred_at)
       VALUES ($1, $2, $3, 'A gate', 40000, $4, now())`,
      [id(), TENANT, issue, USER],
    );
    await sql(`SELECT issue_balance_apply($1)`, [issue]);

    expect(minor((await balance(issue)).variations_total_minor)).toBe(40_000);
    await invoice(issue, 40_000n);
    await expect(invoice(issue, 1n)).rejects.toThrow(/exceeds the ceiling/);
  });

  it("does not count a voided invoice against the ceiling", async () => {
    const issue = await seal(1, 100_000n);
    await accept(issue);
    await invoice(issue, 100_000n);

    const invoiceId = (await sql<{ id: string }>(`SELECT id FROM invoice LIMIT 1`))[0]!.id;
    await sql(
      `INSERT INTO invoice_void (id, tenant_id, invoice_id, reason, voided_by_user_id)
       VALUES ($1, $2, $3, 'Wrong amount', $4)`,
      [id(), TENANT, invoiceId, USER],
    );
    await sql(`SELECT issue_balance_apply($1)`, [issue]);

    expect(minor((await balance(issue)).invoiced_total_minor)).toBe(0);
    // So the room is back, which is the whole reason a void is a row rather than a deletion.
    await invoice(issue, 100_000n);
  });
});

// ===========================================================================
describe("J2 · the ceiling is enforced by the database, not by callers remembering", () => {
  /** An invoice inserted the way a forgetful repository, a script or a 2am fix would insert one. */
  async function invoiceDirectly(issueId: string, amount: bigint) {
    return sql(
      `INSERT INTO invoice (id, tenant_id, issue_id, kind, amount_minor, currency, issued_at)
       VALUES ($1, $2, $3, 'progress', $4, 'JMD', now())`,
      [id(), TENANT, issueId, amount.toString()],
    );
  }

  it("REFUSES an invoice over the ceiling even when nothing calls issue_balance_apply", async () => {
    // The finding, executed: before this trigger, an invoice for 5,000,000 against a ceiling of
    // 100,000 inserted cleanly and the balance still read zero. Three documents claimed it could not.
    const issue = await seal(1, 100_000n);
    await accept(issue);

    await expect(invoiceDirectly(issue, 5_000_000n)).rejects.toThrow(/exceeds the ceiling/);

    expect(await sql(`SELECT 1 FROM invoice`)).toHaveLength(0);
    expect(minor((await balance(issue)).invoiced_total_minor)).toBe(0);
  });

  it("keeps the balance current without an explicit call, because the write cannot avoid it", async () => {
    const issue = await seal(1, 100_000n);
    await accept(issue);

    await invoiceDirectly(issue, 40_000n);

    // Nothing called issue_balance_apply here. The trigger did.
    expect(minor((await balance(issue)).invoiced_total_minor)).toBe(40_000);
  });

  it("refuses the second of two invoices that are each under the ceiling and together over it", async () => {
    const issue = await seal(1, 100_000n);
    await accept(issue);

    await invoiceDirectly(issue, 60_000n);
    await expect(invoiceDirectly(issue, 60_000n)).rejects.toThrow(/exceeds the ceiling/);
    expect(minor((await balance(issue)).invoiced_total_minor)).toBe(60_000);
  });

  it("REFUSES invoicing an issue that was never accepted — a second hole that was only prose", async () => {
    // No acceptance means no balance row, and the function raises rather than treating a missing row as
    // permission. Previously this was a sentence in the PRD and nothing in the database.
    const issue = await seal(1, 100_000n);
    await expect(invoiceDirectly(issue, 1_000n)).rejects.toThrow(/issue_balance row missing/);
  });

  it("updates the balance when a variation arrives, with no explicit call", async () => {
    const issue = await seal(1, 100_000n);
    await accept(issue);
    await sql(
      `INSERT INTO variation (id, tenant_id, issue_id, description, amount_minor,
                              recorded_by_user_id, occurred_at)
       VALUES ($1, $2, $3, 'A gate', 30000, $4, now())`,
      [id(), TENANT, issue, USER],
    );
    expect(minor((await balance(issue)).variations_total_minor)).toBe(30_000);
    // And the raised ceiling is usable, which proves the trigger ran rather than merely not failing.
    await invoiceDirectly(issue, 130_000n);
  });

  it("frees the room again when an invoice is voided, with no explicit call", async () => {
    const issue = await seal(1, 100_000n);
    await accept(issue);
    await invoiceDirectly(issue, 100_000n);
    const invoiceId = (await sql<{ id: string }>(`SELECT id FROM invoice LIMIT 1`))[0]!.id;

    await sql(
      `INSERT INTO invoice_void (id, tenant_id, invoice_id, reason, voided_by_user_id)
       VALUES ($1, $2, $3, 'Wrong amount', $4)`,
      [id(), TENANT, invoiceId, USER],
    );
    expect(minor((await balance(issue)).invoiced_total_minor)).toBe(0);
  });
});

// ===========================================================================
describe("2 · issue_balance has exactly one writer", () => {
  it("refuses a direct UPDATE from the application, however it is granted", async () => {
    // The harness grants UPDATE on every table (see test-support), which is exactly why the control
    // cannot be a grant: a REVOKE in the migration would be undone here. The write policies require
    // a transaction-local flag that only the function sets.
    const issue = await seal(1, 100_000n);
    await accept(issue);

    const affected = await db.query(
      `UPDATE issue_balance SET invoiced_total_minor = 999999 WHERE issue_id = $1`,
      [issue],
    );
    expect(affected.affectedRows ?? 0).toBe(0);
    expect(minor((await balance(issue)).invoiced_total_minor)).toBe(0);
  });

  it("refuses a direct INSERT, so a row cannot be conjured to satisfy a later lock", async () => {
    const issue = await seal(1, 100_000n);

    await expect(
      db.query(
        `INSERT INTO issue_balance (issue_id, tenant_id, accepted_total_minor)
         VALUES ($1, $2, 500)`,
        [issue, TENANT],
      ),
    ).rejects.toThrow(/policy/i);
  });

  it("has no DELETE policy at all, so a balance row cannot be removed", async () => {
    const issue = await seal(1, 100_000n);
    await accept(issue);

    const affected = await db.query(`DELETE FROM issue_balance WHERE issue_id = $1`, [issue]);
    expect(affected.affectedRows ?? 0).toBe(0);
    expect(await balance(issue)).toBeDefined();
  });

  it("RAISES when the balance row is missing, rather than locking nothing", async () => {
    // Finding G2 in one test. `SELECT … FOR UPDATE` matching zero rows takes no lock at all, so a
    // silent no-op here would have let the first pair of concurrent invoices through the mechanism
    // built to stop them.
    const issue = await seal(1, 100_000n);

    await expect(sql(`SELECT issue_balance_apply($1)`, [issue])).rejects.toThrow(
      /issue_balance row missing/,
    );
  });

  it("opens the balance row as part of accepting, not as a separate step somebody may forget", async () => {
    const issue = await seal(1, 100_000n);
    expect(await sql(`SELECT 1 FROM issue_balance WHERE issue_id = $1`, [issue])).toHaveLength(0);

    await accept(issue);
    expect(minor((await balance(issue)).accepted_total_minor)).toBe(100_000);
  });

  it("sets the write flag in exactly one place, so the predicate cannot be defeated casually", async () => {
    // The flag is not a secret and the policy comment says so. What keeps it honest is that it is
    // set in one file: the migration. A guard, because a grep in a comment is not a control.
    const migration = await readFile(
      join(import.meta.dirname, "..", "migrations", "20260925120000_documents_core", "migration.sql"),
      "utf8",
    );
    // Comment lines are excluded, because the policy block deliberately MENTIONS the call while
    // explaining that the flag is not a secret — and the first version of this assertion counted
    // that sentence as if it were a call, which is a guard measuring the wrong thing.
    const code = migration
      .split(SPLIT_ON_NEWLINES)
      .filter((line: string) => !line.trim().startsWith("--"))
      .join(" ");
    const occurrences = code.match(/set_config\('pryvis\.balance_write'/g) ?? [];
    // Two per function (raise, then clear), for exactly two functions.
    expect(occurrences).toHaveLength(4);
    expect(migration).toContain("issue_balance_apply");
    expect(migration).toContain("issue_balance_open");
  });
});

// ===========================================================================
describe("3 · a document's state is derived, so there is no value to disagree about", () => {
  it("reads sealed_awaiting_number until a number exists", async () => {
    const issue = await seal(1, 100_000n);
    expect(await state(issue)).toBe("sealed_awaiting_number");
  });

  it("reads issued once numbered", async () => {
    const issue = await seal(1, 100_000n);
    await sql(
      `INSERT INTO issue_number (id, tenant_id, issue_id, series_id, number, formatted)
       VALUES ($1, $2, $3, $4, 1, 'Q-1')`,
      [id(), TENANT, issue, SERIES],
    );
    expect(await state(issue)).toBe("issued");
  });

  it("reads accepted, then issued again once the acceptance is withdrawn", async () => {
    const issue = await seal(1, 100_000n);
    await sql(
      `INSERT INTO issue_number (id, tenant_id, issue_id, series_id, number, formatted)
       VALUES ($1, $2, $3, $4, 1, 'Q-1')`,
      [id(), TENANT, issue, SERIES],
    );
    const acceptance = await accept(issue);
    expect(await state(issue)).toBe("accepted");

    await sql(
      `INSERT INTO acceptance_withdrawal (id, tenant_id, acceptance_id, reason, withdrawn_by_user_id)
       VALUES ($1, $2, $3, 'Wrong client named', $4)`,
      [id(), TENANT, acceptance, USER],
    );

    // No column was updated to make this happen — the state is a function of the rows.
    expect(await state(issue)).toBe("issued");
  });

  it("reads superseded when a later revision exists", async () => {
    const first = await seal(1, 100_000n);
    await seal(2, 120_000n);
    expect(await state(first)).toBe("superseded");
  });

  it("has no state column to contradict the function", async () => {
    // Finding H6 was two disagreeing state machines in one document. This is why that cannot recur.
    const columns = await sql<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
        WHERE table_name = 'quote_issue' AND column_name IN ('state', 'status')`,
    );
    expect(columns).toEqual([]);
  });
});

// ===========================================================================
describe("4 · withdrawal is a row, and the documents stay immutable", () => {
  it("refuses an UPDATE on a sealed issue", async () => {
    const issue = await seal(1, 100_000n);
    const affected = await db.query(`UPDATE quote_issue SET title = 'Edited' WHERE id = $1`, [issue]);
    expect(affected.affectedRows ?? 0).toBe(0);
  });

  it("refuses a DELETE on a sealed issue", async () => {
    const issue = await seal(1, 100_000n);
    const affected = await db.query(`DELETE FROM quote_issue WHERE id = $1`, [issue]);
    expect(affected.affectedRows ?? 0).toBe(0);
  });

  it("refuses an UPDATE on an acceptance, which is why withdrawal is its own row", async () => {
    const issue = await seal(1, 100_000n);
    const acceptance = await accept(issue);
    const affected = await db.query(`UPDATE acceptance SET signer_name = 'Someone' WHERE id = $1`, [
      acceptance,
    ]);
    expect(affected.affectedRows ?? 0).toBe(0);
  });

  it("refuses a second withdrawal of the same acceptance", async () => {
    const issue = await seal(1, 100_000n);
    const acceptance = await accept(issue);
    const withdraw = () =>
      sql(
        `INSERT INTO acceptance_withdrawal (id, tenant_id, acceptance_id, reason,
                                            withdrawn_by_user_id)
         VALUES ($1, $2, $3, 'A reason', $4)`,
        [id(), TENANT, acceptance, USER],
      );

    await withdraw();
    await expect(withdraw()).rejects.toThrow(/unique|duplicate/i);
  });
});

// ===========================================================================
describe("J10 · at most one revision of a quote holds a live ceiling", () => {
  async function invoiceDirect(issueId: string, amount: bigint) {
    return sql(
      `INSERT INTO invoice (id, tenant_id, issue_id, kind, amount_minor, currency, issued_at)
       VALUES ($1, $2, $3, 'progress', $4, 'JMD', now())`,
      [id(), TENANT, issueId, amount.toString()],
    );
  }
  const ceiling = async (issueId: string) =>
    minor((await sql<{ c: string }>(`SELECT issue_ceiling_minor($1) AS c`, [issueId]))[0]!.c);

  it("REFUSES a later revision while an accepted revision has been invoiced", async () => {
    // The executed finding: revision 1 accepted and part-invoiced, revision 2 sealed and accepted, two
    // live ceilings totalling 230,000 for one 130,000 job. The prescribed remedy — withdraw first — is
    // impossible here, because H4's trigger refuses a withdrawal once an invoice exists.
    const rev1 = await seal(1, 100_000n);
    await accept(rev1);
    await invoiceDirect(rev1, 60_000n);

    await expect(seal(2, 130_000n)).rejects.toThrow(/Money has moved/);
  });

  it("REFUSES a later revision while an accepted revision has a recorded variation", async () => {
    const rev1 = await seal(1, 100_000n);
    await accept(rev1);
    await sql(
      `INSERT INTO variation (id, tenant_id, issue_id, description, amount_minor,
                              recorded_by_user_id, occurred_at)
       VALUES ($1, $2, $3, 'A gate', 20000, $4, now())`,
      [id(), TENANT, rev1, USER],
    );

    await expect(seal(2, 130_000n)).rejects.toThrow(/Money has moved/);
  });

  it("allows a later revision when nothing financial hangs off the accepted one, and zeroes its ceiling", async () => {
    const rev1 = await seal(1, 100_000n);
    await accept(rev1);
    expect(await ceiling(rev1)).toBe(100_000);

    const rev2 = await seal(2, 130_000n);

    // The two functions now agree about the same row, which is what the finding was.
    expect(await state(rev1)).toBe("superseded");
    expect(await ceiling(rev1)).toBe(0);
    expect(await ceiling(rev2)).toBe(0); // not accepted yet
  });

  it("refuses an invoice against a superseded revision, even though its balance row survives", async () => {
    const rev1 = await seal(1, 100_000n);
    await accept(rev1);
    await seal(2, 130_000n);

    await expect(invoiceDirect(rev1, 1_000n)).rejects.toThrow(/exceeds the ceiling/);
    // The balance row is untouched and inert, exactly as after a withdrawal.
    expect(minor((await balance(rev1)).accepted_total_minor)).toBe(100_000);
  });

  it("leaves one live ceiling for the quote once the new revision is accepted", async () => {
    const rev1 = await seal(1, 100_000n);
    await accept(rev1);
    const rev2 = await seal(2, 130_000n);
    await accept(rev2);

    expect(await ceiling(rev1)).toBe(0);
    expect(await ceiling(rev2)).toBe(130_000);

    // The whole point, stated as the sum the finding measured: 130,000, not 230,000.
    const live = (await ceiling(rev1)) + (await ceiling(rev2));
    expect(live).toBe(130_000);
  });

  it("allows a first revision with nothing before it", async () => {
    // Proves the trigger is not simply refusing everything, which a guard that always raises would.
    const rev1 = await seal(1, 100_000n);
    expect(await state(rev1)).toBe("sealed_awaiting_number");
  });
});

// ===========================================================================
describe("H4 · withdrawal cannot detach money from the issue it was agreed against", () => {
  async function withdraw(acceptanceId: string) {
    return sql(
      `INSERT INTO acceptance_withdrawal (id, tenant_id, acceptance_id, reason,
                                          withdrawn_by_user_id)
       VALUES ($1, $2, $3, 'Wrong client named', $4)`,
      [id(), TENANT, acceptanceId, USER],
    );
  }

  it("allows a withdrawal while nothing financial hangs off the acceptance", async () => {
    // The typo remedy, which is the point of the feature: discovered early, it is cheap.
    const issue = await seal(1, 100_000n);
    const acceptance = await accept(issue);

    await withdraw(acceptance);
    expect(await state(issue)).toBe("sealed_awaiting_number");
  });

  it("REFUSES a withdrawal once an invoice exists", async () => {
    const issue = await seal(1, 100_000n);
    const acceptance = await accept(issue);
    await invoice(issue, 40_000n);

    await expect(withdraw(acceptance)).rejects.toThrow(/credit note and a fresh quote/);
  });

  it("REFUSES a withdrawal once a variation exists — the case the guard condition missed", async () => {
    // Without this, $400,000 of immutable agreed work ends up pointing at a superseded issue whose
    // acceptance is gone: unbillable, unmovable, and re-recording it leaves two identical copies
    // with nothing marking which pair is live.
    const issue = await seal(1, 100_000n);
    const acceptance = await accept(issue);
    await sql(
      `INSERT INTO variation (id, tenant_id, issue_id, description, amount_minor,
                              recorded_by_user_id, occurred_at)
       VALUES ($1, $2, $3, 'A gate', 400000, $4, now())`,
      [id(), TENANT, issue, USER],
    );

    await expect(withdraw(acceptance)).rejects.toThrow(/recorded variation/);
  });

  it("drops the ceiling to zero on withdrawal, so nothing more can be invoiced", async () => {
    // Nothing is mutated to achieve this. `accepted_total` stays written-once, and the CEILING is
    // state-aware — which is how ADR 0025's own contradiction was resolved.
    const issue = await seal(1, 100_000n);
    const acceptance = await accept(issue);
    await withdraw(acceptance);

    const ceiling = await sql<{ c: string }>(`SELECT issue_ceiling_minor($1) AS c`, [issue]);
    expect(minor(ceiling[0]!.c)).toBe(0);
    await expect(invoice(issue, 1n)).rejects.toThrow(/exceeds the ceiling/);
  });

  it("leaves accepted_total untouched, because an immutable copy is what makes it safe", async () => {
    const issue = await seal(1, 100_000n);
    const acceptance = await accept(issue);
    await withdraw(acceptance);

    // The balance row survives — deleting it would reintroduce the empty-lock hole (G2) — and it is
    // inert, because the ceiling is what decides, not the stored total.
    expect(minor((await balance(issue)).accepted_total_minor)).toBe(100_000);
  });

  it("returns a ceiling of zero rather than NULL, so a refusal never rests on three-valued logic", async () => {
    // An issue with no balance row at all: NULL here would make `invoiced > ceiling` evaluate to
    // NULL, which is not TRUE, which would let an invoice through.
    const issue = await seal(1, 100_000n);
    const ceiling = await sql<{ c: string }>(`SELECT issue_ceiling_minor($1) AS c`, [issue]);
    expect(minor(ceiling[0]!.c)).toBe(0);
  });
});

// ===========================================================================
describe("G4 · two devices cannot seal the same revision", () => {
  it("refuses the second seal of one (quote, revision)", async () => {
    // Both pushes are INSERTs, so neither "conflicts" in the sync sense — which is exactly why the
    // append-only answer hid this. The unique index is what refuses it.
    await seal(1, 100_000n);
    await expect(seal(1, 100_000n)).rejects.toThrow(/unique|duplicate/i);
  });

  it("allows a genuine revision", async () => {
    await seal(1, 100_000n);
    await seal(2, 110_000n);
    expect(await sql(`SELECT 1 FROM quote_issue`)).toHaveLength(2);
  });
});

// ===========================================================================
describe("H7 · a refused seal is its own record, not an issue awaiting renumbering", () => {
  async function reject(revision: number, total: bigint, sealedAt: string) {
    const sealId = id();
    await sql(
      `INSERT INTO rejected_seal
         (id, tenant_id, quote_id, revision_attempted, refusal_reason, client_id, client_name, title,
          currency, subtotal_minor, tax_minor, total_minor, sealed_at, sealed_by_user_id,
          catalog_synced_at)
       VALUES ($1, $2, $3, $4, 'a colleague sealed this revision first', $5, 'A Client', 'Fence',
               'JMD', $6, 0, $6, $7::timestamptz, $8, now())`,
      [sealId, TENANT, QUOTE, revision, CLIENT, total.toString(), sealedAt, USER],
    );
    return sealId;
  }

  it("keeps the price the device gave at the gate, with its own true sealed_at", async () => {
    // This is the whole product need behind "offered as a revision": the contractor stood in front of
    // a client and said a number, and that number must not be lost because a colleague synced first.
    await seal(1, 100_000n);
    const rejected = await reject(1, 97_500n, "2026-09-26T08:15:00Z");

    const rows = await sql<{ total_minor: string; sealed_at: Date }>(
      `SELECT total_minor, sealed_at FROM rejected_seal WHERE id = $1`,
      [rejected],
    );
    expect(minor(rows[0]!.total_minor)).toBe(97_500);
    expect(new Date(rows[0]!.sealed_at).toISOString()).toBe("2026-09-26T08:15:00.000Z");
  });

  it("does not touch the winner: no supersession, no renumbering", async () => {
    // The ordering problem in the finding: the loser may have sealed EARLIER, so promoting it to the
    // next revision would mark the winner superseded by a document sealed before it, and the audit
    // trail would state the opposite of what happened.
    const winner = await seal(1, 100_000n);
    await reject(1, 97_500n, "2026-09-26T07:00:00Z");

    expect(await state(winner)).toBe("sealed_awaiting_number");
    const issues = await sql(`SELECT 1 FROM quote_issue`);
    expect(issues).toHaveLength(1);
  });

  it("allows several devices to lose the same race", async () => {
    // No unique index on (quote_id, revision_attempted), deliberately: every attempt is a thing
    // somebody said to a client.
    await seal(1, 100_000n);
    await reject(1, 97_500n, "2026-09-26T07:00:00Z");
    await reject(1, 99_000n, "2026-09-26T07:30:00Z");
    expect(await sql(`SELECT 1 FROM rejected_seal`)).toHaveLength(2);
  });

  it("keeps both timestamps, so who priced it first is answerable even though sync order decides", async () => {
    await seal(1, 100_000n);
    const rejected = await reject(1, 97_500n, "2026-09-26T06:00:00Z");
    const rows = await sql<{ sealed_at: Date; pushed_at: Date }>(
      `SELECT sealed_at, pushed_at FROM rejected_seal WHERE id = $1`,
      [rejected],
    );
    expect(new Date(rows[0]!.sealed_at).getTime()).toBeLessThan(
      new Date(rows[0]!.pushed_at).getTime(),
    );
  });

  it("lets the tenant resolve it, and only to a decision that means something", async () => {
    await seal(1, 100_000n);
    const rejected = await reject(1, 97_500n, "2026-09-26T07:00:00Z");

    await sql(
      `UPDATE rejected_seal SET resolution = 'discarded', resolved_at = now(), version = version + 1
        WHERE id = $1`,
      [rejected],
    );
    await expect(
      sql(`UPDATE rejected_seal SET resolution = 'maybe later' WHERE id = $1`, [rejected]),
    ).rejects.toThrow(/resolution_check|violates check/i);
  });

  it("cannot be promoted into the issue sequence by rewriting the winner", async () => {
    // The three impossible routes, as one test: the loser cannot become revision 2 by editing
    // anything, because `quote_issue` has no UPDATE path at all.
    const winner = await seal(1, 100_000n);
    const affected = await db.query(`UPDATE quote_issue SET revision = 2 WHERE id = $1`, [winner]);
    expect(affected.affectedRows ?? 0).toBe(0);
  });

  it("does not let a rejected seal's lines be rewritten", async () => {
    await seal(1, 100_000n);
    const rejected = await reject(1, 97_500n, "2026-09-26T07:00:00Z");
    await sql(
      `INSERT INTO rejected_seal_line
         (id, tenant_id, rejected_seal_id, section_title, description, position,
          quantity_thousandths, unit_price_minor, line_total_minor)
       VALUES ($1, $2, $3, 'Fencing', '40m of fence', 1, 40000, 2500, 97500)`,
      [id(), TENANT, rejected],
    );

    const affected = await db.query(
      `UPDATE rejected_seal_line SET line_total_minor = 1 WHERE rejected_seal_id = $1`,
      [rejected],
    );
    expect(affected.affectedRows ?? 0).toBe(0);
  });
});

// ===========================================================================
describe("5 · a pending registration is not a user", () => {
  it("allows two people to claim the same address", async () => {
    // Which is impossible if a claim is a user row, because app_user.email is globally unique —
    // finding H8. Claims are not users, so both attempts can exist.
    await asSuperuser(db, async () => {
      for (const token of ["hash-one", "hash-two"]) {
        await db.query(
          `INSERT INTO registration_claim (id, email, token_hash, expires_at)
           VALUES ($1, 'shared@example.com', $2, now() + interval '72 hours')`,
          [id(), token],
        );
      }
    });

    const claims = await asSuperuser(db, () =>
      db.query(`SELECT 1 FROM registration_claim WHERE email = 'shared@example.com'`),
    );
    expect(claims.rows).toHaveLength(2);
  });

  it("lets only the first verification become a user — a database guarantee, not application logic", async () => {
    await asSuperuser(db, async () => {
      const verify = (userId: string) =>
        db.query(
          `INSERT INTO app_user (id, tenant_id, email, role, session_version, updated_at)
           VALUES ($1, $2, 'shared@example.com', 'owner', 0, now())`,
          [userId, TENANT],
        );

      await verify("b0000000-0000-4000-8000-000000000001");
      await expect(verify("b0000000-0000-4000-8000-000000000002")).rejects.toThrow(
        /unique|duplicate/i,
      );
    });
  });
});

// ===========================================================================
describe("the tenant boundary still holds over all of it", () => {
  it("hides another tenant's sealed issue even when its id is named", async () => {
    const issue = await seal(1, 100_000n);

    await db.query(`SELECT set_config('app.tenant_id', $1, false)`, [OTHER_TENANT]);
    expect(await sql(`SELECT 1 FROM quote_issue WHERE id = $1`, [issue])).toHaveLength(0);
    expect(await sql(`SELECT 1 FROM issue_balance`)).toHaveLength(0);
  });

  it("refuses a seal planted into another tenant", async () => {
    await expect(
      db.query(
        `INSERT INTO quote_issue
           (id, tenant_id, quote_id, revision, client_id, client_name, title, client_detail_level,
            currency, terms_text, tax_rate_basis_points, subtotal_minor, tax_minor, total_minor,
            sealed_at, sealed_by_user_id, catalog_synced_at)
         VALUES ($1, $2, $3, 9, $4, 'X', 'X', 'itemised', 'JMD', 'T', 0, 1, 0, 1, now(), $5, now())`,
        [id(), OTHER_TENANT, QUOTE, CLIENT, USER],
      ),
    ).rejects.toThrow(/policy/i);
  });
});
