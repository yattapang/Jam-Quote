import { existsSync, readFileSync, readdirSync } from "node:fs";
import { basename, dirname, join, sep } from "node:path";
import { NotFoundException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { assertClientOwned, assertProjectOwned, clientReferenceState } from "./assert-owned.js";

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
          // Only filter on deletedAt when the query asks for it. clientReferenceState
          // deliberately does NOT, because it needs to tell a deleted client of this
          // business apart from a foreign one.
          (!("deletedAt" in where) || (r.deletedAt ?? null) === (where.deletedAt ?? null)),
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

describe("clientReferenceState — the sync push answers with an outcome, not a throw", () => {
  it("distinguishes not-yours from not-usable, because the device acts differently", async () => {
    // "foreign" is documented as belonging to another business, so a device may
    // reasonably discard its local copy. A deleted client of THIS business must
    // not cause the contractor's own project to be thrown away.
    await expect(clientReferenceState(fakeDb([THEIRS]), "biz_1", "cl_theirs")).resolves.toBe("foreign");
    await expect(clientReferenceState(fakeDb([DELETED]), "biz_1", "cl_gone")).resolves.toBe("deleted");
    await expect(clientReferenceState(fakeDb([MINE]), "biz_1", "cl_mine")).resolves.toBe("owned");
  });

  it("never throws, so one bad row cannot fail a batch", async () => {
    await expect(clientReferenceState(fakeDb([]), "biz_1", "cl_x")).resolves.toBe("foreign");
  });
});

/**
 * The half that would have caught the original defect — second attempt.
 *
 * The first version of this block asserted `src.includes("assertClientOwned")`
 * over a hand-written list of four files, and separately compared that list
 * against a second hand-written copy of itself. Both were worthless, and an
 * independent review said so:
 *
 * - **The string match is satisfied by the IMPORT line.** Delete the call, keep
 *   the import, and it passes. `noUnusedLocals` is off and there is no CI, so
 *   nothing else objects either. The commit claimed "verified by removing the
 *   call from each of the four services" — but the script that verified it
 *   removed the import too, so it proved something no attacker has to do.
 * - **The second assertion could not fail.** `writers` and `CALLERS` held the
 *   same four strings; the test compared a list against a copy of itself, read
 *   no file, and its comment claimed it would catch a fifth service.
 *
 * That is the fourth source-scanning guard in this repo to pass on nothing, and
 * it was written the same day as the note warning about them. So this version
 * takes nothing on trust: it DISCOVERS the services from disk, decides for
 * itself which ones write a caller-supplied client id, and requires a call with
 * an open paren rather than a mention.
 */
describe("every caller-supplied clientId is checked", () => {
  const SRC = join(process.cwd(), "src");

  /** Every `*.service.ts` under src, found rather than listed. */
  function serviceFiles(dir: string, out: string[] = []): string[] {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) serviceFiles(full, out);
      else if (entry.name.endsWith(".service.ts")) out.push(full);
    }
    return out;
  }

  const stripComments = (src: string): string =>
    src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

  /**
   * Does this file persist a client id that came from the CALLER?
   *
   * `clientId: input.clientId`, `clientId: d.clientId ?? null`, and friends. A
   * value copied from a row the service already fetched under a `businessId`
   * scope — `original.clientId`, `quote.clientId` — is NOT caller-supplied and
   * needs no check, which is why the pattern is anchored to the argument names.
   */
  const NAMES_CALLER_CLIENT_ID = /clientId:\s*(?:input|d|data|change|patch|dto)[.?]/;

  /**
   * A spread write: `data: { ...input, businessId }`.
   *
   * `ProjectsService.create` does exactly this, so the name-based pattern above
   * cannot see it — `clientId` never appears. Running the first version of this
   * guard showed 3 writers where there are 4, and projects was the missing one.
   * That is the shape a real writer would slip through, so it is detected
   * separately and confirmed against the module's own DTO.
   */
  const SPREADS_INPUT = /\.\.\.(?:input|d|data|patch|dto)\b/;

  /** A CALL, not a mention. The open paren is the whole point. */
  const CALLS_A_CHECK = /(?:assertClientOwned|clientReferenceState)\s*\(/;

  /** Does this module's DTO let a caller send a clientId at all? */
  function dtoTakesClientId(serviceFile: string): boolean {
    const dir = dirname(serviceFile);
    const dto = join(dir, `${basename(dir)}.dto.ts`);
    return existsSync(dto) && /clientId/.test(stripComments(readFileSync(dto, "utf8")));
  }

  const services = serviceFiles(SRC).map((file) => {
    const src = stripComments(readFileSync(file, "utf8"));
    return {
      file: file.slice(SRC.length + 1).split(sep).join("/"),
      src,
      // A writer either names the field, or spreads a DTO that carries it.
      writesClientId:
        NAMES_CALLER_CLIENT_ID.test(src) || (SPREADS_INPUT.test(src) && dtoTakesClientId(file)),
    };
  });

  it("finds the services, so a move or rename cannot empty this guard", () => {
    expect(services.length).toBeGreaterThanOrEqual(15);
  });

  it("finds the writers by reading them, not from a list", () => {
    // If this drops to zero the detection regex has stopped matching and every
    // assertion below would pass vacuously. Four services write one today.
    const writers = services.filter((s) => s.writesClientId);
    expect(writers.length).toBeGreaterThanOrEqual(4);
  });

  it("every service that writes a caller-supplied clientId CALLS a check", () => {
    // The assertion the first version only appeared to make. A new service that
    // persists `clientId: input.clientId` fails here until it calls the helper —
    // and importing it is not enough.
    const unchecked = services
      .filter((s) => s.writesClientId && !CALLS_A_CHECK.test(s.src))
      .map((s) => s.file);
    expect(unchecked).toEqual([]);
  });

  it("an import alone does not satisfy it", () => {
    // Pins the hole that made the first version useless, so it cannot come back
    // if someone simplifies the regex above.
    const importOnly = [
      'import { assertClientOwned } from "../common/assert-owned.js";',
      "clientId: input.clientId,",
    ].join("\n");
    expect(NAMES_CALLER_CLIENT_ID.test(importOnly)).toBe(true);
    expect(CALLS_A_CHECK.test(importOnly)).toBe(false);
  });
});
