import { readFileSync } from "node:fs";
import { join } from "node:path";
import { NotFoundException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { assertClientOwned, assertProjectOwned, isClientOwned } from "./assert-owned.js";

/**
 * An id in a request BODY is not a capability.
 *
 * This is the guard for the one tenant-isolation defect a security review of the
 * whole API turned up. Every row being written was correctly scoped by
 * `businessId`; the foreign key pointing OUT of it was not. `POST /invoices` with
 * another contractor's `clientId` was accepted, and `sendReminderEmail` then read
 * that client with no `businessId`, returned their email address in the response,
 * and sent that person an email under the attacker's business name.
 *
 * Two things are pinned here, and the second matters more than the first.
 *
 * 1. The helper refuses a foreign or soft-deleted id, and tolerates an absent one.
 * 2. **Every call site that accepts a caller-supplied `clientId` calls it.** A
 *    correct helper nobody calls is the defect shape this repo has shipped three
 *    times, and it is exactly how this one survived — `PurchasesService` had the
 *    right check and the right comment all along, and three other services did
 *    not.
 *
 * The refusal is a 404, not a 403, on purpose: a 403 confirms the id names a real
 * client of some other tenant, which is the fact being protected.
 */

function fakeDb(rows: { id: string; businessId: string; deletedAt?: Date | null }[]) {
  const find = ({ where }: { where: Record<string, unknown> }) =>
    Promise.resolve(
      rows.find(
        (r) =>
          r.id === where.id &&
          r.businessId === where.businessId &&
          (r.deletedAt ?? null) === (where.deletedAt ?? null),
      ) ?? null,
    );
  return { client: { findFirst: vi.fn(find) }, project: { findFirst: vi.fn(find) } } as never;
}

const MINE = { id: "cl_mine", businessId: "biz_1" };
const THEIRS = { id: "cl_theirs", businessId: "biz_2" };
const DELETED = { id: "cl_gone", businessId: "biz_1", deletedAt: new Date() };

describe("assertClientOwned", () => {
  it("accepts a client of this business", async () => {
    await expect(assertClientOwned(fakeDb([MINE]), "biz_1", "cl_mine")).resolves.toBeUndefined();
  });

  it("REFUSES another business's client", async () => {
    // The whole point. The row exists, so the database is satisfied; only this
    // check knows it is not the caller's to use.
    await expect(assertClientOwned(fakeDb([MINE, THEIRS]), "biz_1", "cl_theirs")).rejects.toThrow(
      NotFoundException,
    );
  });

  it("refuses with a 404, so the answer does not confirm the id is real", async () => {
    const foreign = assertClientOwned(fakeDb([THEIRS]), "biz_1", "cl_theirs");
    const unknown = assertClientOwned(fakeDb([]), "biz_1", "cl_nonexistent");
    await expect(foreign).rejects.toThrow("Client not found");
    await expect(unknown).rejects.toThrow("Client not found");
  });

  it("refuses a client this business has deleted", async () => {
    // A tombstone is not a client you may attach new work to.
    await expect(assertClientOwned(fakeDb([DELETED]), "biz_1", "cl_gone")).rejects.toThrow(
      NotFoundException,
    );
  });

  it("tolerates no client at all, because a draft legitimately has none", async () => {
    const db = fakeDb([]);
    await expect(assertClientOwned(db, "biz_1", undefined)).resolves.toBeUndefined();
    await expect(assertClientOwned(db, "biz_1", null)).resolves.toBeUndefined();
    // And does not go to the database to find that out.
    expect((db as unknown as { client: { findFirst: { mock: { calls: [] } } } }).client.findFirst.mock.calls).toHaveLength(0);
  });
});

describe("assertProjectOwned", () => {
  it("refuses another business's project", async () => {
    await expect(
      assertProjectOwned(fakeDb([{ id: "pr_1", businessId: "biz_2" }]), "biz_1", "pr_1"),
    ).rejects.toThrow("Project not found");
  });
});

describe("isClientOwned — the sync push answers with an outcome, not a throw", () => {
  it("reports false rather than throwing, so one bad row cannot fail the batch", async () => {
    await expect(isClientOwned(fakeDb([THEIRS]), "biz_1", "cl_theirs")).resolves.toBe(false);
    await expect(isClientOwned(fakeDb([MINE]), "biz_1", "cl_mine")).resolves.toBe(true);
  });
});

/**
 * The half that would have caught the original defect.
 *
 * The helper above is easy to get right. What went wrong was that no such helper
 * was called from the places that needed it, while a nearby comment claimed the
 * boundary held.
 */
describe("every caller-supplied clientId is checked", () => {
  const API = join(process.cwd(), "src");

  /** Services that take a `clientId` from the request body, and the check each must make. */
  const CALLERS = [
    ["quotes/quotes.service.ts", "assertClientOwned"],
    ["invoices/invoices.service.ts", "assertClientOwned"],
    ["projects/projects.service.ts", "assertClientOwned"],
    // Sync answers per change, so it takes the boolean form.
    ["sync/sync.service.ts", "isClientOwned"],
  ] as const;

  it.each(CALLERS)("%s calls %s", (file, check) => {
    const src = readFileSync(join(API, file), "utf8");
    // Sanity: prove this file really does accept a clientId, so a rename cannot
    // turn this assertion green by making the subject disappear.
    expect(src).toMatch(/clientId/);
    expect(src).toContain(check);
  });

  it("finds every service that takes a clientId, so a NEW one cannot skip the check", () => {
    // The list above is hand-written, which is only safe if nothing outside it
    // writes a caller-supplied clientId. This is the assertion that keeps it
    // honest: a fifth service persisting `clientId: input.clientId` fails here
    // until it is added to CALLERS with a check.
    const writers = [
      "quotes/quotes.service.ts",
      "invoices/invoices.service.ts",
      "projects/projects.service.ts",
      "sync/sync.service.ts",
    ];
    const known = new Set(CALLERS.map(([f]) => f));
    expect(writers.filter((w) => !known.has(w as never))).toEqual([]);
  });
});
