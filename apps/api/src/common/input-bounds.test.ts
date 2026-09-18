import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { collect, followAlias, isImportedChain, parseFile, unwrap } from "@jamquote/test-ast";

/**
 * Every string a contractor can send should have a bound. This pins the ones
 * that do not, so the next unbounded field fails rather than joining a list
 * nobody counts.
 *
 * ## What an unbounded string actually costs
 *
 * Express caps a JSON body at 100kb by default, so this is not a way to fill the
 * database. What 100kb in one field DOES do:
 *
 * - a quote PDF that never renders, or renders as forty blank pages
 * - a CSV cell an accountant cannot read, in a file that opens fine
 * - a list screen where one row pushes every other off the page
 *
 * None of those fail loudly. They fail in front of the contractor's client.
 *
 * ## What it took to get here
 *
 * The count went 29 -> 11 -> 58 -> 0 -> (this file) 140+, and each step is worth knowing.
 *
 * **29** was the first measurement. Sharing the client and project field rules
 * across the REST and sync doors bounded **18 of them as a side effect**, which
 * is the argument for fixing a seam rather than patching each side.
 *
 * **11** was wrong. The guard counted `.min()` as a constraint, and `.min(1)`
 * stops an empty string while saying nothing about a 100kb one. Correcting it to
 * require an UPPER bound revealed **58**.
 *
 * **0** unbounded fields. Limits are far beyond what a real contractor types —
 * `terms` allows 5000 characters, `description` 500 — because the point is to
 * stop a payload, not to police wording.
 *
 * ## Why this is an AST parse, not a regex (rung 3 of the guard doctrine)
 *
 * The previous version of this file matched `^\s{2,}name\s*:\s*(z\.string\(\).*)$`
 * line by line, after stripping comments and normalising CRLF. Two failures came
 * from that shape rather than from the rule it was enforcing:
 *
 * - It missed a MULTI-LINE chain outright: `code: z\n  .string()\n  .trim()` never
 *   matched the single-line pattern at all, so a field written that way was
 *   invisible to the guard rather than merely misjudged — a false "clean".
 * - It went uncounted, or over/undercounted, on a CRLF checkout until the
 *   `stripComments` normalisation was added by hand, one working copy at a time.
 *
 * The fix is not a bigger regex. `@jamquote/test-ast` is the one shared parser
 * every workspace's guards spend (see its own doctrine comment); this file asks
 * it a shape question — "does this expression's call chain bottom out at
 * `z.string()`, and which methods sit on top of it?" — instead of pattern-matching
 * text. A chain is walked node by node through the real parse tree, so line breaks,
 * comments and whitespace inside it never mattered in the first place.
 */

const SRC = join(process.cwd(), "src");

/**
 * Anything that puts a CEILING on the value.
 *
 * `.min()` is deliberately absent, and its absence is the whole point. The first
 * version of this guard counted it, on the reasoning that a constrained field is
 * a checked field — but `.min(1)` stops an EMPTY string and says nothing about a
 * 100kb one, which is the failure this test exists to prevent. Counting it hid
 * 47 fields: the guard reported 11 unbounded when the real figure was 58.
 */
const UPPER_BOUNDS = new Set([
  "max", "length", "email", "uuid", "url", "regex", "datetime", "date", "cuid", "ip",
]);

/**
 * Fields allowed to have no upper bound.
 *
 * **Empty, and it should stay empty.** Adding a name here to make a test pass is
 * the failure this guard exists to prevent — bound the field instead.
 */
const KNOWN_UNBOUNDED: Record<string, string[]> = {
  // EMPTY, and it should stay that way. Every string input has an upper bound.
  // If a new field needs to go here, that is a decision to argue for in the diff
  // rather than a place to park one.
};

/**
 * Walks a call-chain expression outward (`z.string().trim().max(500)` is the
 * `.max(500)` call at the top) and asks whether it bottoms out at a bare
 * `z.string()` call. The receiver `z` is resolved through the shared binder
 * via `isImportedChain(base, "zod", "z")` — NOT by comparing identifier text
 * — so an aliased import (`import { z as zz } from "zod"`) still matches,
 * because `isImportedChain` follows the import specifier's `propertyName`
 * rather than its local name.
 *
 * Two more bypasses this now closes, both required by rule 3/doctrine:
 * - Helper indirection (`const str = () => z.string(); …str()…`): when the
 *   callee is a bare identifier, `followAlias` resolves it to its (single,
 *   never-reassigned) initializer, and — one level deep only, exactly like
 *   `followAlias`'s own contract — a concise-body arrow or a single-`return`
 *   function body is unwrapped and walked as if it had been written inline.
 * - Quoted/computed string keys are handled by `propNameText` at the call
 *   site below, not here.
 *
 * Returns the ordered list of method names found ABOVE the `z.string()` root
 * (`["trim", "max"]` for the example above) when the chain does bottom out
 * there, or `undefined` when it does not — a `z.number()...` chain, a bare
 * identifier, a non-chain expression, a helper whose body is not a single
 * return of a zod chain, anything else.
 *
 * What this still does NOT follow, by design: a field whose value is a
 * shared schema imported from `@jamquote/core` (e.g. `quoteLineItemSchema`,
 * spent via `.and(...)` in quotes.dto.ts) rather than an inline `z.string()`
 * call written in this file. Bounding those fields is `@jamquote/core`'s own
 * responsibility; this guard only walks chains literally present in each
 * `<module>.dto.ts` source file.
 */
function zStringChainMethods(expr: ts.Expression, seen: Set<ts.Node> = new Set()): string[] | undefined {
  const e = unwrap(expr);
  if (!ts.isCallExpression(e)) return undefined;
  const callee = unwrap(e.expression);

  if (ts.isIdentifier(callee)) {
    if (seen.has(callee)) return undefined; // guard against a self-referencing helper
    const init = followAlias(callee);
    if (init === undefined) return undefined;
    const body = helperBodyExpression(init);
    if (body === undefined) return undefined;
    const next = new Set(seen);
    next.add(callee);
    return zStringChainMethods(body, next);
  }

  if (!ts.isPropertyAccessExpression(callee)) return undefined;
  const methodName = callee.name.text;
  const base = unwrap(callee.expression);

  // The root of the chain: `z.string()` itself, `z` resolved by symbol.
  if (methodName === "string" && isImportedChain(base, "zod", "z")) {
    return [];
  }

  const rest = zStringChainMethods(base, seen);
  if (rest === undefined) return undefined;
  return [...rest, methodName];
}

/**
 * A never-reassigned local helper's body, one level deep: the concise body of
 * an arrow function, or the sole expression of a single-`return` block body.
 * Anything else (multiple statements, no return, a non-function initializer)
 * is not a shape this guard tries to see through.
 */
function helperBodyExpression(init: ts.Expression): ts.Expression | undefined {
  const fn = unwrap(init);
  if (!ts.isArrowFunction(fn) && !ts.isFunctionExpression(fn)) return undefined;
  if (!ts.isBlock(fn.body)) return fn.body;
  const stmts = fn.body.statements;
  if (stmts.length !== 1) return undefined;
  const only = stmts[0]!;
  return ts.isReturnStatement(only) && only.expression ? only.expression : undefined;
}

/**
 * A property name as a static string: a plain identifier key, a quoted
 * string key (`"plantC": …`), or a computed key whose expression is itself a
 * string literal (`["plantC"]: …`). Anything else (a computed non-literal
 * key, a numeric/symbol key) returns `undefined` and the property is skipped
 * — same as before, just no longer skipping quoted keys too.
 */
function propNameText(name: ts.PropertyName): string | undefined {
  if (ts.isIdentifier(name)) return name.text;
  if (ts.isStringLiteral(name) || ts.isNoSubstitutionTemplateLiteral(name)) return name.text;
  if (ts.isComputedPropertyName(name)) {
    const inner = unwrap(name.expression);
    if (ts.isStringLiteral(inner) || ts.isNoSubstitutionTemplateLiteral(inner)) return inner.text;
  }
  return undefined;
}

interface StringField {
  name: string;
  constrained: boolean;
}

/**
 * Every `<name>: z.string()...` property assignment anywhere in a DTO module
 * (any object literal, at any nesting depth — matching the previous line-scan's
 * reach, which was not limited to top-level schema fields either), and whether
 * its chain carries at least one upper-bounding method.
 */
function stringFields(sf: ts.SourceFile): StringField[] {
  const out: StringField[] = [];
  for (const prop of collect(sf, ts.isPropertyAssignment)) {
    const name = propNameText(prop.name);
    if (name === undefined) continue;
    const methods = zStringChainMethods(prop.initializer);
    if (methods === undefined) continue;
    out.push({ name, constrained: methods.some((m) => UPPER_BOUNDS.has(m)) });
  }
  return out;
}

function dtoModules(): { module: string; sf: ts.SourceFile }[] {
  const out: { module: string; sf: ts.SourceFile }[] = [];
  for (const dir of readdirSync(SRC)) {
    const dto = join(SRC, dir, `${dir}.dto.ts`);
    if (existsSync(dto)) out.push({ module: dir, sf: parseFile(dto) });
  }
  return out;
}

describe("string inputs are bounded", () => {
  const mods = dtoModules();

  it("finds the DTOs and their string fields, so a rewrite cannot empty this", () => {
    const total = mods.reduce((n, m) => n + stringFields(m.sf).length, 0);
    expect(mods.length).toBeGreaterThanOrEqual(12);
    // The regex-based predecessor measured 139 and MISSED every multi-line chain
    // outright (see the file header). The AST walk counts those too, so the true
    // figure is higher; a floor here catches a restructure without failing every
    // time a field is legitimately added or removed.
    expect(total).toBeGreaterThan(140);
  });

  it.each(mods.map((m) => [m.module, m] as const))("%s", (module, mod) => {
    const unbounded = stringFields(mod.sf)
      .filter((f) => !f.constrained)
      .map((f) => f.name);

    const allowed = new Set(KNOWN_UNBOUNDED[module] ?? []);
    const unexpected = [...new Set(unbounded.filter((n) => !allowed.has(n)))];

    // A NEW unbounded string. Give it a `.max()` a real contractor cannot hit
    // rather than adding it to KNOWN_UNBOUNDED.
    expect(unexpected).toEqual([]);
  });

  it("does not let the allow-list rot", () => {
    // A name that is no longer unbounded - because someone bounded it, good -
    // must leave the list, or the list stops describing anything and the next
    // reader cannot tell which entries are real.
    const stale: string[] = [];
    for (const { module, sf } of mods) {
      const unbounded = new Set(stringFields(sf).filter((f) => !f.constrained).map((f) => f.name));
      for (const name of KNOWN_UNBOUNDED[module] ?? []) {
        if (!unbounded.has(name)) stale.push(`${module}.${name}`);
      }
    }
    expect(stale).toEqual([]);
  });
});
