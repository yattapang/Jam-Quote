import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import {
  parseFile,
  parseSource,
  callsTo,
  destructuredPropertyName,
  followAlias,
  renderedExpressions,
  unwrap,
} from "@jamquote/test-ast";

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
 * a rate unit without going through `lineUnitLabel`. Concretely, a read of
 * `.rateUnit` — directly (`l.rateUnit`), through a destructure (`const {
 * rateUnit } = l` then `{rateUnit...}`), as the key into ANY object indexed
 * by it (the real `RATE_UNIT_LABEL` or a locally redeclared copy, under any
 * name), or through an identifier key resolving to the const string
 * `"rateUnit"` (`const K = "rateUnit"; l[K]`) — unless that read is itself
 * an argument to a call to `lineUnitLabel`.
 *
 * ## Why this scans the WHOLE FILE, not only JSX content
 *
 * An earlier generation walked only `renderedExpressions` — the JSX braces
 * actually printed to the page — on the theory that a read outside them
 * cannot be a display bug. That missed `{unitOf(l)}` beside
 * `function unitOf(x) { return x.rateUnit.toLowerCase(); }` declared
 * elsewhere in the same file: the read is real, it reaches the render, but
 * it sits in `unitOf`'s body, never a descendant of the `{unitOf(l)}` node
 * the earlier walk actually visited. Chasing every call boundary to find
 * that is a project of its own (the header below still says so), so this
 * generation inverts the question: flag every `.rateUnit` read in the file
 * outside `lineUnitLabel`, JSX or not, and structurally exclude the shapes
 * that are provably not a display path, rather than trying to prove which
 * ones ARE reachable from a render:
 *
 *  - a JSX attribute value (`onChange`, a control's `value=`) — computes
 *    DATA, never text the page prints;
 *  - a bare `.rateUnit` (or destructured equivalent) passed straight into a
 *    property LITERALLY named `rateUnit` — `{ rateUnit: x.rateUnit }` or the
 *    shorthand `{ rateUnit }` — the same unchanged-passthrough shape
 *    `isRoutedThroughLineUnitLabel` already recognises for a `lineUnitLabel`
 *    argument, here for a DTO mapper, a form-value<->payload converter, or
 *    an `onChange` payload carrying the cadence through to a caller that
 *    edits it. A read that becomes real display — rendered as text, or
 *    fed to anything other than an identically-named property — is not this
 *    shape and is not excused by it;
 *  - the identifier at the DECLARATION site of a destructured binding named
 *    `rateUnit` (`function F({ rateUnit }) {…}`) — introducing the binding
 *    is not itself a read; only a later reference to it is, and that
 *    reference is a different node this exclusion does not touch.
 *
 * ## What it does not prove
 *
 * It does not verify `lineUnitLabel` itself is correct — only that it is the
 * thing called. Passing a WRONG value to a correctly-named `lineUnitLabel`
 * (shadowing the import, or calling a differently-defined local function
 * that happens to share the name) also defeats it; no scanner distinguishes
 * a call from a deliberate shadow. And the passthrough exclusion is exactly
 * as sound as its own shape is narrow: `{ rateUnit: x.rateUnit.toLowerCase()
 * as RateUnit }` reads `.rateUnit` but does not pass it through UNCHANGED,
 * so it still does not match — same reasoning `isRoutedThroughLineUnitLabel`
 * already relies on for a `lineUnitLabel` call's own arguments.
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
 * Is `node` a read of the line's rate unit — `l.rateUnit`, `l["rateUnit"]`, or an
 * identifier that resolves, through the shared binder, to a `rateUnit` property
 * destructured from something, or to a never-written local ALIAS of one (`const ru =
 * l.rateUnit`, read later as `ru`)? Binder resolution replaces the previous file-wide
 * name match, which keyed every identifier spelled `rateUnit` anywhere in the file rather
 * than the one actually bound to that property — a bypass nobody had to try for, the
 * same class the parser's own header warns about for `const cur`.
 *
 * `seen` guards the alias chase against a cycle (`const a = b; const b = a;`), which
 * `followAlias` cannot itself loop on forever (each hop needs a fresh never-written
 * binding) but which this recursion otherwise would.
 */
/**
 * Does `key` (an element-access argument) name `"rateUnit"` — as a literal
 * (`l["rateUnit"]`), or through a never-written local alias resolving to that literal
 * (`const K = "rateUnit"; l[K]`)? Chases the same alias chain `isRateUnitRead` does,
 * with its own `seen` guard against a cycle.
 */
function keyNamesRateUnit(key: ts.Expression, seen: Set<ts.Node> = new Set()): boolean {
  const k = unwrap(key);
  if ((ts.isStringLiteral(k) || ts.isNoSubstitutionTemplateLiteral(k)) && k.text === "rateUnit") return true;
  if (ts.isIdentifier(k)) {
    if (seen.has(k)) return false;
    seen.add(k);
    const init = followAlias(k);
    if (init && keyNamesRateUnit(init, seen)) return true;
  }
  return false;
}

/**
 * Does `init` — the initializer of a never-written local alias — READ the line's
 * `rateUnit`, allowing it to sit behind a chained call, a template span, a binary
 * operand or a ternary branch — never inside a NEW scope or data structure `init`
 * builds? Catches `const ru = l.rateUnit.toLowerCase();` (`init` is the
 * `.toLowerCase()` call; peeling it off exposes the read `l.rateUnit`), which the
 * previous version missed entirely: it asked only whether `unwrap(init)` was itself a
 * read, never whether one was reachable by peeling a same-value transform off it.
 *
 * Deliberately narrower than "walk every descendant": `init` may be an arbitrarily
 * large expression — `demoQuotes.map((l) => ({ ..., rateUnit: l.rateUnit }))` — that
 * merely CONTAINS a rateUnit read somewhere inside a callback argument building an
 * unrelated object. That nested `l` is its own binding, not a value flowing INTO
 * `init`'s own alias, so a first version of this fix that walked every descendant
 * flagged every later reference to `quotes` in `lib/mock-data.ts` as "reading
 * rateUnit" — the map's own callback argument, four levels down, is never something
 * the walk should have entered at all. This one only follows shapes where `init`
 * ITSELF is transparently the read: a method chained straight off it, a template
 * literal or `+`/`??`/ternary built directly from it — never a call's ARGUMENTS, an
 * object or array literal's contents, or a nested function's body.
 */
function initializerIsRateUnitRead(init: ts.Expression, seen: Set<ts.Node>): boolean {
  const e = unwrap(init);
  if (isRateUnitRead(e, seen)) return true;
  if (ts.isCallExpression(e)) {
    const callee = unwrap(e.expression);
    return ts.isPropertyAccessExpression(callee) && initializerIsRateUnitRead(callee.expression, seen);
  }
  if (ts.isTemplateExpression(e)) return e.templateSpans.some((s) => initializerIsRateUnitRead(s.expression, seen));
  if (ts.isBinaryExpression(e)) {
    return initializerIsRateUnitRead(e.left, seen) || initializerIsRateUnitRead(e.right, seen);
  }
  if (ts.isConditionalExpression(e)) {
    return initializerIsRateUnitRead(e.whenTrue, seen) || initializerIsRateUnitRead(e.whenFalse, seen);
  }
  return false;
}

function isRateUnitRead(node: ts.Node, seen: Set<ts.Node> = new Set()): boolean {
  if (ts.isPropertyAccessExpression(node) && node.name.text === "rateUnit") return true;
  if (ts.isElementAccessExpression(node) && keyNamesRateUnit(node.argumentExpression)) return true;
  if (
    ts.isIdentifier(node) &&
    !(ts.isPropertyAccessExpression(node.parent) && node.parent.name === node) &&
    !(ts.isElementAccessExpression(node.parent) && node.parent.argumentExpression === node) &&
    // The DECLARATION site of a destructured `rateUnit` binding (`function F({
    // rateUnit }) {…}`) introduces the binding; it is not itself a read. Only a
    // later REFERENCE to it is, and that reference is a different identifier node
    // this exclusion does not touch (its parent is not the BindingElement).
    !(ts.isBindingElement(node.parent) && node.parent.name === node)
  ) {
    if (destructuredPropertyName(node) === "rateUnit") return true;
    if (seen.has(node)) return false;
    seen.add(node);
    const init = followAlias(node);
    if (init && initializerIsRateUnitRead(init, seen)) return true;
  }
  return false;
}

/**
 * Is `node` — a rateUnit read that already satisfies `isRateUnitRead` — passed straight
 * through, UNCHANGED, into a property literally named `rateUnit`? `{ rateUnit:
 * x.rateUnit }` (a DTO mapper, a form-value<->payload converter) and the shorthand
 * `{ rateUnit }` (an `onChange` payload carrying the cadence back to a caller that
 * edits it) both carry the value across a boundary without printing it — the same
 * unchanged-passthrough shape `isRoutedThroughLineUnitLabel` already recognises for a
 * `lineUnitLabel` argument, applied here to any property of that exact name.
 *
 * Narrow on purpose: `{ rateUnit: x.rateUnit.toLowerCase() }` is not this shape (the
 * read is the object of a further call, not the property's value directly), and
 * `{ unitLabel: x.rateUnit.toLowerCase() }` is not either (wrong property name) — both
 * still count as unrouted reads, which is exactly the transform this guard exists to
 * catch.
 */
function isNonDisplayPassthrough(node: ts.Node): boolean {
  const p = node.parent;
  if (p && ts.isShorthandPropertyAssignment(p) && p.name === node) return true;
  if (
    p &&
    ts.isPropertyAssignment(p) &&
    p.initializer === node &&
    ts.isIdentifier(p.name) &&
    p.name.text === "rateUnit"
  ) {
    return true;
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
 * resolved via the shared binder's `callsTo` with `importedFrom` set to the real
 * `lineUnitLabel` export of `lib/quote-totals.ts` — so the callee must resolve THROUGH
 * THE BINDER to that import (directly, aliased, or via a namespace-import property), not
 * merely be spelled `lineUnitLabel`. Without `importedFrom`, `callsTo` matches by
 * spelling alone, which is exactly what let
 * `({ lineUnitLabel: (u) => u.toLowerCase() }).lineUnitLabel(l.rateUnit)` through: the
 * callee IS spelled `lineUnitLabel`, but it is a method of an object literal built on the
 * spot, not a call to the real function. Is that specific occurrence excused per
 * `isRoutedThroughLineUnitLabel`?
 */
function isInsideLineUnitLabelCall(node: ts.Node, sf: ts.SourceFile, stopAt: ts.Node): boolean {
  const calls = new Set(
    callsTo(sf, "lineUnitLabel", { moduleSpecifier: "@/lib/quote-totals", exportedName: "lineUnitLabel" }),
  );
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

/**
 * Every `.rateUnit` read ANYWHERE in `sf` that is not routed through `lineUnitLabel` —
 * not confined to a JSX rendered expression's own subtree.
 *
 * The narrower `unroutedRateUnitReads` (walking only a single rendered expression) missed
 * the live bypass this generation exists for: `{unitOf(l)}` with
 * `function unitOf(x) { return x.rateUnit.toLowerCase(); }` declared elsewhere in the same
 * file. The read is real and reaches the same rendered span, but it sits in `unitOf`'s
 * body, never a descendant of the `{unitOf(l)}` JSX expression, so the narrower walk never
 * visits it. Scanning the whole file finds it regardless of how many function boundaries
 * sit between the render and the read.
 *
 * JSX attribute values are still excluded (`walkRendered` skips them at any depth, file-
 * wide) — an `onChange` handler or a control's `value=` computes DATA, not text the page
 * prints, per this file's header. What is NOT excluded, deliberately, is ordinary `.ts`/
 * `.tsx` code outside any JSX at all: a comparison, a payload object, a `useState` call.
 * Those are real reads too, by this guard's letter; where they are legitimate (not a
 * display path at all) they are named in `NON_DISPLAY_ALLOWED` below, per file and
 * function, with an exact count and a reason — never silently excused by position alone.
 */
function unroutedRateUnitReadsInFile(sf: ts.SourceFile): ts.Node[] {
  const offenders: ts.Node[] = [];
  walkRendered(sf, (node) => {
    if (!isRateUnitRead(node)) return;
    if (isNonDisplayPassthrough(node)) return;
    if (!isInsideLineUnitLabelCall(node, sf, sf)) offenders.push(node);
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

  it("no read of a line's rateUnit, anywhere in the file, escapes lineUnitLabel unexcused", () => {
    const offenders: string[] = [];
    for (const f of files) {
      if (ALLOWED.has(rel(f))) continue;
      const sf = parseFile(f);
      for (const node of unroutedRateUnitReadsInFile(sf)) {
        offenders.push(`${rel(f)} :: ${node.getText().slice(0, 80)}`);
      }
    }
    expect(offenders, "a read outside lineUnitLabel that is not a structurally-excused passthrough — fix it with lineUnitLabel").toEqual(
      [],
    );
  });

  it("does not excuse a transform of rateUnit merely because it sits inside a lineUnitLabel(...) call", () => {
    // The live bypass: excusing ANY .rateUnit read anywhere inside the call's arguments
    // let this exact rewrite through, because `l.rateUnit.toLowerCase()` is textually
    // inside the call even though its result feeds `unitLabel`, not `rateUnit`, and
    // nothing routes it through lineUnitLabel at all.
    const probeSf = parseSource(
      "probe.tsx",
      [
        'import { lineUnitLabel } from "@/lib/quote-totals";',
        "const x = <span>{lineUnitLabel({ ...l, unitLabel: l.rateUnit.toLowerCase() })}</span>;",
      ].join("\n"),
    );
    for (const expr of renderedExpressions(probeSf)) {
      expect(unroutedRateUnitReads(expr, probeSf).length).toBeGreaterThan(0);
    }
  });

  it("bypass: an element-access read of rateUnit is caught", () => {
    const probeSf = parseSource("probe4.tsx", 'const x = <span>{l["rateUnit"].toLowerCase()}</span>;');
    for (const expr of renderedExpressions(probeSf)) {
      expect(unroutedRateUnitReads(expr, probeSf).length).toBeGreaterThan(0);
    }
  });

  it("bypass: a never-written local alias of l.rateUnit is caught", () => {
    const probeSf = parseSource(
      "probe5.tsx",
      "const ru = l.rateUnit;\nconst x = <span>{ru.toLowerCase()}</span>;",
    );
    for (const expr of renderedExpressions(probeSf)) {
      expect(unroutedRateUnitReads(expr, probeSf).length).toBeGreaterThan(0);
    }
  });

  it("bypass: a call spelled lineUnitLabel that is not the real import is not excused", () => {
    const probeSf = parseSource(
      "probe6.tsx",
      [
        'import { lineUnitLabel } from "@/lib/quote-totals";',
        "const x = <span>{({ lineUnitLabel: (u: string) => u.toLowerCase() }).lineUnitLabel(l.rateUnit)}</span>;",
      ].join("\n"),
    );
    for (const expr of renderedExpressions(probeSf)) {
      expect(unroutedRateUnitReads(expr, probeSf).length).toBeGreaterThan(0);
    }
  });

  it("excuses a rateUnit read passed straight into a property of the same name, file-wide", () => {
    const propertyPassthrough = parseSource(
      "probe7.ts",
      "function mapLine(l: any) { return { rateUnit: l.rateUnit }; }",
    );
    expect(unroutedRateUnitReadsInFile(propertyPassthrough)).toHaveLength(0);

    const shorthandPassthrough = parseSource(
      "probe8.ts",
      "function onSelect(rateUnit: string) { emit({ rateUnit, unitLabel: '' }); }",
    );
    expect(unroutedRateUnitReadsInFile(shorthandPassthrough)).toHaveLength(0);

    // The declaration site of a destructured `rateUnit` binding is not itself a read —
    // with no later reference to the binding, there is nothing here to flag at all.
    const bindingDeclaration = parseSource("probe9.ts", "function F({ rateUnit }: { rateUnit: string }) {}");
    expect(unroutedRateUnitReadsInFile(bindingDeclaration)).toHaveLength(0);

    // A later reference to that SAME binding is a real read, unaffected by the
    // declaration-site exclusion — it just isn't THIS shape's concern.
    const laterReference = parseSource(
      "probe9b.ts",
      "function F({ rateUnit }: { rateUnit: string }) { return rateUnit; }",
    );
    expect(unroutedRateUnitReadsInFile(laterReference).length).toBeGreaterThan(0);
  });

  it("does not excuse a transform disguised as a passthrough, or the wrong property name", () => {
    // Same shape as the live bypass this generation exists for: a read that reaches
    // render through a helper function declared elsewhere in the file.
    const throughHelper = parseSource(
      "probe10.tsx",
      [
        "function unitOf(x: any) { return x.rateUnit.toLowerCase(); }",
        "const y = <span>{unitOf(l)}</span>;",
      ].join("\n"),
    );
    expect(unroutedRateUnitReadsInFile(throughHelper).length).toBeGreaterThan(0);

    // A .toLowerCase() call sits between the read and the property value — not an
    // unchanged passthrough, whatever the property is named.
    const transformed = parseSource(
      "probe11.ts",
      "function mapLine(l: any) { return { rateUnit: l.rateUnit.toLowerCase() }; }",
    );
    expect(unroutedRateUnitReadsInFile(transformed).length).toBeGreaterThan(0);

    // Passed through unchanged, but into the WRONG property — the live bypass's exact
    // shape (`unitLabel: l.rateUnit.toLowerCase()`), simplified to the pure-passthrough
    // case to isolate the property-name check.
    const wrongProperty = parseSource(
      "probe12.ts",
      "function mapLine(l: any) { return { unitLabel: l.rateUnit }; }",
    );
    expect(unroutedRateUnitReadsInFile(wrongProperty).length).toBeGreaterThan(0);
  });

  it("still excuses the two legitimate pass-through shapes", () => {
    const imp = 'import { lineUnitLabel } from "@/lib/quote-totals";';
    const passThroughFirstArg = parseSource(
      "probe2.tsx",
      `${imp}\nconst x = <span>{lineUnitLabel(l.rateUnit, l.unitLabel)}</span>;`,
    );
    const passThroughField = parseSource(
      "probe3.tsx",
      `${imp}\nconst x = <span>{lineUnitLabel({ ...l, rateUnit: l.rateUnit })}</span>;`,
    );
    for (const sf of [passThroughFirstArg, passThroughField]) {
      for (const expr of renderedExpressions(sf)) {
        expect(unroutedRateUnitReads(expr, sf)).toHaveLength(0);
      }
    }
  });
});
