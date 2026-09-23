/**
 * Guard: the checked-in contract matches what the API's types say today.
 *
 * This is the answer to the second Phase 0 finding. The old guard could prove a
 * mirrored type was referenced; it could not prove its fields agreed with the
 * endpoint, so a rename on the server left the client compiling happily against a
 * shape that no longer existed. Here, drift is a red build.
 *
 * It also fails when the generator finds NOTHING, because a contract check with no
 * subject passes forever (Rule 8).
 *
 * WHAT IT DOES NOT PROVE
 *
 * - Not that the server actually SENDS what the type claims. A type is a promise,
 *   and only a test against a real response collects on it — that is what the
 *   integration flow tests are for once routes exist.
 * - Not that a client uses the generated type rather than an inline literal. That
 *   guard belongs on the web and mobile side and is owed when they land.
 */
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { renderContract } from "./generate.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const GENERATED = join(HERE, "src", "generated", "wire.ts");

describe("the generated contract is not stale", () => {
  it("finds at least one @wire type, so this check has a subject", async () => {
    const rendered = await renderContract();
    expect(
      rendered.includes("export interface"),
      "the generator found no @wire types, so the drift check below is comparing nothing",
    ).toBe(true);
  });

  it("matches the checked-in file exactly", async () => {
    const rendered = await renderContract();
    const onDisk = await readFile(GENERATED, "utf8");

    // Compared line by line rather than as one blob: a whole-file diff in a test
    // report is unreadable, and an unreadable failure is one people re-run instead
    // of fixing.
    expect(onDisk.split(/\r?\n/)).toEqual(rendered.split(/\r?\n/));
  });
});
