import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { parseFile, parseSource, callsTo, destructuredPropertyName, renderedExpressions, unwrap } from "./test/source-ast";

/**
 * A source-scanning guard, not a behaviour test.
 *
 * `lineUnitLabel` (quote-totals.ts) is thoroughly unit-tested and has always
 * been correct. The bug it exists to prevent kept happening anyway, because
 * screens simply did not call it: the quote and invoice detail pages each
 * rendered `RATE_UNIT_LABEL[line.rateUnit]` directly, so a line sold by the
 * metre printed "30 units". Two library pages had gone further and declared
 * their own copy of the cadence map. Most recently the PUBLIC quote page
 * (`app/q/[token]/page.tsx` — the one a contractor's CLIENT reads) rendered
 * `l.unitLabel?.trim() || l.rateUnit.toLowerCase()`, which is behaviourally
 * identical to the bug above (it prints the wrong thing the moment a
 * `RateUnit` member's label stops being its lowercased name) but was neither
 * of the two text shapes the previous version of this guard matched. It was
 * green with that bypass in the codebase.
 *
 * ## Why this is a parse, not a behavioural test
 *
 * Doctrine ranks a TYPE or a behavioural test over the real code path above a
 * source parse. Both were considered for this guard and rejected:
 *
 * - No TYPE rejects the bypass. `l.rateUnit.toLowerCase()` and
 *   `RATE_UNIT_LABEL[l.rateUnit]` both type-check; `RateUnit` is a plain
 *   string union and its members currently lowercase to their own label,
 *   which is exactly why the divergence is invisible until a label stops
 *   matching its lowercased name.
 * - A single behavioural test proving every surface renders
 *   `lineUnitLabel`'s output would need to actually render each one: two
 *   Next.js SERVER components with a database dependency (`quotes/[id]`,
 *   `invoices/[id]`, and this public page — none render without mocking a
 *   data-access module), and two `@react-pdf/renderer` documents, which do
 *   not produce DOM nodes `@testing-library` can query at all. Building that
 *   harness for four unrelated rendering mechanisms is a project in its own
 *   right, not a guard, and `line-editor.ts`'s own comment already states
 *   the quote/invoice builders "cannot be render-tested in this repo". So the
 *   fact is expressed over the AST instead, per doctrine's rung 3.
 *
 * ## The class this detects
 *
 * Not the text `RATE_UNIT_LABEL[` and not the text `toLowerCase`: displaying
 * a rate unit without going through `lineUnitLabel`. Concretely, an
 * expression RENDERED as JSX content (`renderedExpressions`, never an
 * attribute) that reads `.rateUnit` — directly (`l.rateUnit`), through a
 * destructure (`const { rateUnit } = l` then `{rateUnit...}`), or as the key
 * into ANY object indexed by it (the real `RATE_UNIT_LABEL` or a locally
 * redeclared copy, under any name) — unless that read is itself an argument
 * to a call to `lineUnitLabel`. Every historical and hypothetical spelling
 * below reduces to "a `.rateUnit` read reaches render outside that one call",
 * so the detector does not need to recognise any of their surface forms.
 *
 * ## What it does not prove
 *
 * It is a syntactic reachability check, not a type checker: it cannot follow
 * `rateUnit` across a function call boundary (a helper that takes `line` and
 * returns a pre-formatted string defeats it, same as it would defeat a
 * human reviewer skimming for `.rateUnit`), and it does not verify
 * `lineUnitLabel` itself is correct — only that it is the thing called.
 * Passing a WRONG value to a correctly-named `lineUnitLabel` (shadowing the
 * import, or calling a differently-defined local function that happens to
 * share the name) also defeats it; no scanner distinguishes a call from a
 * deliberate shadow. It also does not scan `.ts`/`.js` files with no JSX,
 * since `renderedExpressions` only exists for JSX content — a rate unit
 * fed into `console.log` or a CSV export is out of scope for a guard about
 * what the CUSTOMER sees rendered.
 */
const ALLOWED = new Set([
  // Defines lineUnitLabel and the map itself — the one place `.rateUnit` is
  // read to PRODUCE the label, not to render a line.
  "lib/quote-totals.ts",
  // Enumerates the cadences to build the unit picker's options; not a row
  // label, and has no JSX besides (a plain .ts file).
  "lib/line-editor.ts",
]);

function sourceFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".next") continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) sourceFiles(full, acc);
    else if (/\.tsx?$/.test(entry) && !entry.includes(".test.")) acc.push(full);
  }
  return acc;
}

const WEB_ROOT = join(__dirname, "..");
const rel = (f: string) => f.slice(WEB_ROOT.length + 1).split("\\").join("/");

/**
 * Is `node` a read of the line's rate unit — `l.rateUnit`, or an identifier that resolves,
 * through the shared binder, to a `rateUnit` property destructured from something? Binder
 * resolution replaces the previous file-wide name match, which keyed every identifier
 * spelled `rateUnit` anywhere in the file rather than the one actually bound to that
 * property — a bypass nobody had to try for, the same class the parser's own header warns
 * about for `const cur`.
 */
function isRateUnitRead(node: ts.Node): boolean {
  if (ts.isPropertyAccessExpression(node) && node.name.text === "rateUnit") return true;
  if (ts.isIdentifier(node) && !(ts.isPropertyAccessExpression(node.parent) && node.parent.name === node)) {
    return destructuredPropertyName(node) === "rateUnit";
  }
  return false;
}

/**
 * Is a `.rateUnit` read excused because it is routed through `lineUnitLabel`, unchanged?
 * Excused only when:
 *  - the read IS (not merely "inside") the call's first argument — `lineUnitLabel(l.rateUnit)`,
 *    the read passed straight through with nothing done to it first; or
 *  - the read is the value of a `rateUnit:` property inside an object-literal argument,
 *    passing the field through unchanged (`lineUnitLabel({ ...l, rateUnit: x.rateUnit })`).
 * `lineUnitLabel({ ...l, unitLabel: l.rateUnit.toLowerCase() })` — the live bypass this
 * replaces — matches neither: the read is not the argument itself (it is the object of a
 * further `.toLowerCase()` call), and it is assigned to `unitLabel`, not `rateUnit`.
 */
function isRoutedThroughLineUnitLabel(node: ts.Node, call: ts.CallExpression): boolean {
  if (call.arguments.length > 0 && unwrap(call.arguments[0]!) === node) return true;
  const p = node.parent;
  if (p && ts.isPropertyAssignment(p) && p.initializer === node && ts.isIdentifier(p.name) && p.name.text === "rateUnit") {
    const obj = p.parent;
    if (ts.isObjectLiteralExpression(obj) && call.arguments.some((a) => unwrap(a) === obj)) return true;
  }
  return false;
}

/**
 * Does `node` sit inside an argument (at any depth) of a REAL call to `lineUnitLabel`,
 * resolved via the shared binder's `callsTo` (so an alias, `.call`/`.apply`, or a shadowed
 * name is judged correctly rather than by matching the callee's identifier text), and is
 * that specific occurrence excused per `isRoutedThroughLineUnitLabel`?
 */
function isInsideLineUnitLabelCall(node: ts.Node, sf: ts.SourceFile, stopAt: ts.Node): boolean {
  const calls = new Set(callsTo(sf, "lineUnitLabel"));
  let current: ts.Node = node;
  while (current !== stopAt && current.parent) {
    const parent = current.parent;
    if (ts.isCallExpression(parent) && calls.has(parent) && isRoutedThroughLineUnitLabel(node, parent)) {
      return true;
    }
    current = parent;
  }
  return false;
}

/**
 * Depth-first visit of `root`'s descendants, EXCLUDING the contents of any
 * nested JSX attribute. An attribute's value — `onChange={(e) => ...}`,
 * `onSubmit={async () => { patchComponent(..., { unitLabel: x.rateUnit... }) }}`
 * — sits inside a rendered expression's subtree syntactically, but it
 * computes DATA (an event handler body, a draft-state patch), not text the
 * page prints. Without this exclusion, a callback anywhere inside a
 * conditionally-rendered block reads as if it were rendered content, which
 * is a false positive this guard's own doctrine (rung 4, "prove the parse
 * found something" — precisely, not approximately) rules out.
 */
function walkRendered(node: ts.Node, visit: (n: ts.Node) => void): void {
  visit(node);
  ts.forEachChild(node, (child) => {
    if (ts.isJsxAttribute(child) || ts.isJsxSpreadAttribute(child)) return;
    walkRendered(child, visit);
  });
}

/** Every `.rateUnit` (or destructured equivalent) read inside `root` that is not routed through `lineUnitLabel`. */
function unroutedRateUnitReads(root: ts.Expression, sf: ts.SourceFile): ts.Node[] {
  const offenders: ts.Node[] = [];
  walkRendered(root, (node) => {
    if (!isRateUnitRead(node)) return;
    if (!isInsideLineUnitLabelCall(node, sf, root)) offenders.push(node);
  });
  return offenders;
}

describe("a line's unit is resolved in one place", () => {
  const files = sourceFiles(join(WEB_ROOT, "app")).concat(
    sourceFiles(join(WEB_ROOT, "lib")),
    sourceFiles(join(WEB_ROOT, "components")),
  );
  const relFiles = files.map(rel);

  it("found the surfaces this guard exists for", () => {
    // A rename or a move that emptied discovery should fail loudly, not scan
    // zero files. These four are exactly the surfaces the doctrine names:
    // the quote detail page, both PDFs, and the public page that was the
    // live bypass.
    expect(relFiles).toContain("app/(app)/quotes/[id]/page.tsx");
    expect(relFiles).toContain("app/(app)/invoices/[id]/page.tsx");
    expect(relFiles).toContain("lib/pdf/QuotePdf.tsx");
    expect(relFiles).toContain("lib/pdf/InvoicePdf.tsx");
    expect(relFiles).toContain("app/q/[token]/page.tsx");
    expect(relFiles.length).toBeGreaterThan(20);
  });

  it("no rendered expression reads a line's rateUnit outside lineUnitLabel", () => {
    const offenders: string[] = [];
    for (const f of files) {
      if (ALLOWED.has(rel(f))) continue;
      const sf = parseFile(f);
      for (const expr of renderedExpressions(sf)) {
        if (unroutedRateUnitReads(expr, sf).length > 0) {
          offenders.push(rel(f));
          break;
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("does not excuse a transform of rateUnit merely because it sits inside a lineUnitLabel(...) call", () => {
    // The live bypass: excusing ANY .rateUnit read anywhere inside the call's arguments
    // let this exact rewrite through, because `l.rateUnit.toLowerCase()` is textually
    // inside the call even though its result feeds `unitLabel`, not `rateUnit`, and
    // nothing routes it through lineUnitLabel at all.
    const probeSf = parseSource(
      "probe.tsx",
      "const x = <span>{lineUnitLabel({ ...l, unitLabel: l.rateUnit.toLowerCase() })}</span>;",
    );
    for (const expr of renderedExpressions(probeSf)) {
      expect(unroutedRateUnitReads(expr, probeSf).length).toBeGreaterThan(0);
    }
  });

  it("still excuses the two legitimate pass-through shapes", () => {
    const passThroughFirstArg = parseSource(
      "probe2.tsx",
      "const x = <span>{lineUnitLabel(l.rateUnit, l.unitLabel)}</span>;",
    );
    const passThroughField = parseSource(
      "probe3.tsx",
      "const x = <span>{lineUnitLabel({ ...l, rateUnit: l.rateUnit })}</span>;",
    );
    for (const sf of [passThroughFirstArg, passThroughField]) {
      for (const expr of renderedExpressions(sf)) {
        expect(unroutedRateUnitReads(expr, sf)).toHaveLength(0);
      }
    }
  });
});
