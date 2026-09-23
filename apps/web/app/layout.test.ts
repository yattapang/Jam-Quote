import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import { parseFile, collect } from "@jamquote/test-ast";

/**
 * Pins the rename (ADR 0009): the root page title — what every tab and every
 * page without its own `metadata.title` shows — says the new product name.
 *
 * Reads the `metadata.title` string literal from layout.tsx's own source via
 * the shared AST parser rather than importing the module: importing pulls in
 * `next/font/google`, which this project's vitest setup does not mock, so
 * this test would fail on an environment concern unrelated to the rename.
 *
 * Planted "JamQuote" back into this exact field once, watched
 * lib/brand-name-guard.test.ts fail, and restored from a backup copy (never
 * `git checkout`) to prove the guard actually catches a regression here.
 */
describe("root layout metadata", () => {
  it("titles the app Pryvis, not the old name", () => {
    const file = path.join(__dirname, "layout.tsx");
    const sf = parseFile(file);
    const stringLiterals = collect(sf, ts.isStringLiteral).map((n) => n.text);
    expect(stringLiterals).toContain("Pryvis");
    // Case-sensitive: "@jamquote/ui" (the npm scope, step 2 of the rename —
    // untouched here) must not make this a false positive.
    expect(readFileSync(file, "utf-8")).not.toMatch(/JamQuote/);
  });
});
