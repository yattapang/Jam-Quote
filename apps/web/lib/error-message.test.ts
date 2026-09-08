import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ApiError } from "./api-client";
import { errorMessage } from "./error-message";

describe("errorMessage", () => {
  it("shows what the server said, because the server said it deliberately", () => {
    const err = new ApiError("Only DRAFT quotes can be deleted", 400);
    expect(errorMessage(err, "Couldn't delete — is the API running?")).toBe(
      "Only DRAFT quotes can be deleted",
    );
  });

  it("falls back when the fetch never completed, where the fallback is TRUE", () => {
    // A TypeError from fetch means no response arrived. "Is the API running?"
    // is then literally the right question.
    expect(errorMessage(new TypeError("Failed to fetch"), "Couldn't save — is the API running?")).toBe(
      "Couldn't save — is the API running?",
    );
  });

  it("does not leak a transport message to a contractor", () => {
    // "NetworkError when attempting to fetch resource" is true and useless,
    // and worse, it looks like the app saying something meaningful.
    const out = errorMessage(new Error("NetworkError when attempting to fetch resource"), "Couldn't save.");
    expect(out).toBe("Couldn't save.");
  });

  it("falls back on an ApiError with an empty message rather than showing blank", () => {
    expect(errorMessage(new ApiError("   ", 500), "Couldn't save.")).toBe("Couldn't save.");
  });

  it("survives a thrown non-Error", () => {
    // Anything can be thrown in JavaScript, including a string or undefined.
    expect(errorMessage("boom", "Couldn't save.")).toBe("Couldn't save.");
    expect(errorMessage(undefined, "Couldn't save.")).toBe("Couldn't save.");
    expect(errorMessage(null, "Couldn't save.")).toBe("Couldn't save.");
  });
});

/**
 * A source-scanning guard, not a behaviour test.
 *
 * Thirty-eight call sites printed "is the API running?" for failures that had
 * nothing to do with the API. The owner met it deleting a quote: the API had
 * said *"Only DRAFT quotes can be deleted"* and the app sent them to check
 * whether their server was up.
 *
 * `errorMessage` fixes each site, but nothing stops the next `catch {}` from
 * reintroducing it — and no type can object, because discarding an error is
 * perfectly valid TypeScript. So the rule is enforced over the source.
 *
 * The rule: a message that blames the API may only be reached as the FALLBACK
 * argument to `errorMessage`, or in a render path where no error exists to read.
 */
const RENDER_TIME_ALLOWED = new Set<string>([
  // These are render-time states, not catch blocks: the fetch that failed
  // already swallowed its reason, so there is no error here to surface. They
  // state the fact and stop. Listed explicitly so a NEW one has to be argued
  // for rather than added quietly.
]);

function sourceFiles(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".next") continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) sourceFiles(full, found);
    else if ((entry.endsWith(".ts") || entry.endsWith(".tsx")) && !entry.endsWith(".test.ts"))
      found.push(full);
  }
  return found;
}

describe("no failure blames the API without checking first", () => {
  const root = process.cwd();
  const files = [
    ...sourceFiles(join(root, "app")),
    ...sourceFiles(join(root, "lib")),
    ...sourceFiles(join(root, "components")),
  ];

  it("finds the call sites, so a reworded message cannot empty this test", () => {
    const using = files.filter((f) => readFileSync(f, "utf8").includes("errorMessage(err,"));
    expect(using.length).toBeGreaterThanOrEqual(15);
  });

  it("has no bare catch that discards the error and blames the API", () => {
    const offenders: string[] = [];
    for (const file of files) {
      const rel = file.slice(root.length + 1).replace(/\\/g, "/");
      if (rel === "lib/error-message.ts" || RENDER_TIME_ALLOWED.has(rel)) continue;
      const src = readFileSync(file, "utf8");
      if (!src.includes("is the API running")) continue;

      // Every mention must sit inside an errorMessage(...) call. A mention
      // anywhere else is either a bare catch or a render-time assertion of a
      // cause nobody checked.
      //
      // Checked over a WINDOW, not a single line: a long fallback often sits on
      // its own line inside a multi-line `errorMessage(` call, and a line-local
      // check reports that correct code as an offender.
      const lines = src.split("\n");
      lines.forEach((line, i) => {
        if (!line.includes("is the API running")) return;
        const trimmed = line.trimStart();
        if (trimmed.startsWith("//") || trimmed.startsWith("*")) return;
        const window = lines.slice(Math.max(0, i - 3), i + 1).join("\n");
        const guarded = /errorMessage\(/.test(window) || /errorText/.test(window);
        if (!guarded) offenders.push(`${rel}:${i + 1} ${trimmed.slice(0, 70)}`);
      });
    }
    expect(offenders).toEqual([]);
  });
});
