import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import {
  parseFile,
  parseSource,
  renderedText,
  collect,
  unwrap,
  followAlias,
  enclosingFunctionKey,
  additiveChains,
  additiveTerms,
  isImportedChain,
  destructuredPropertyName,
} from "@jamquote/test-ast";
import { ApiError } from "./api-client";
import { errorMessage } from "./error-message";

describe("errorMessage", () => {
  it("shows what the server said, because the server said it deliberately", () => {
    const err = new ApiError("Only DRAFT quotes can be deleted", 400);
    expect(errorMessage(err, "Couldn't delete — check your connection and try again.")).toBe(
      "Only DRAFT quotes can be deleted",
    );
  });

  it("falls back when the fetch never completed, where the fallback is the plain-English cause", () => {
    // A TypeError from fetch means no response arrived — a genuine connection
    // failure, unknown to the contractor. The plain fallback is then accurate.
    expect(
      errorMessage(new TypeError("Failed to fetch"), "Couldn't save — check your connection and try again."),
    ).toBe("Couldn't save — check your connection and try again.");
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
 * A source-scanning guard, not a behaviour test — and an AST parse, not a text
 * match. The version this replaces matched the literal substring
 * "is the API running" inside a fixed line WINDOW around each hit, guarded by
 * `/errorMessage\(/.test(window)`. That is exactly the class of guard
 * `.claude/agents/README.md` warns about (a guard matching the TEXT of a
 * defect rather than its shape): reword the fallback at all — "is the backend
 * up?", "API unreachable", "the server may be down" — and the text match never
 * fires, while the contractor still reads developer wording. This version asks
 * a SHAPE question instead: is any user-visible string literal, template-
 * literal head, or JSX text anywhere in `app/`/`components/` the word "API" or
 * the phrase "is the API running", however it is spelled around that word.
 *
 * ## What counts as "user-visible" — the structural rule
 *
 * Every string literal, template-literal head (the static prefix of a
 * `` `template ${expr}` `` — never the dynamic part, which cannot be judged
 * statically) and JSX text node in scope is a candidate. Three shapes are
 * excluded because they structurally cannot reach a screen:
 *
 *  - **An import/export module specifier** (`from "..."`, a dynamic
 *    `import("...")`) — a path, not prose.
 *  - **A `console.*(...)` argument** — `console.log`/`warn`/`error`/`info`/
 *    `debug`, resolved by requiring the callee's receiver to be the bare,
 *    unresolved identifier `console` (never a shadowed local of that name) —
 *    developer-facing by construction, never rendered.
 *  - **The argument of a `new XError(...)` that is directly thrown**
 *    (`throw new Error("...")`, `throw new ApiError("...")`) — the message on
 *    the exception object itself, not text handed to a renderer. It only
 *    reaches a screen if something downstream reads `.message` and displays
 *    it, which is a SEPARATE read this guard would catch at that render site
 *    (a string literal or JSX text there), not at the throw.
 *
 * Everything else scanned — a `setError(...)` argument, an `errorText` prop,
 * plain rendered JSX prose, a `title=` tooltip — is user-visible by default.
 * That is deliberately wider than "definitely rendered": the doctrine's own
 * tie-break (source-ast.ts's header) sends a genuinely unknowable case toward
 * DATA/rejection, not toward a false pass, and a legitimate exception is named
 * in the allow-list with a reason rather than silently excluded by shape.
 *
 * ## Allow-list
 *
 * Keyed `file#function` (via `enclosingFunctionKey`) with an exact COUNT, same
 * discipline as `unit-label-usage.test.ts`'s `NON_DISPLAY_ALLOWED`: a whole-
 * file skip would silently cover every string added to that file afterward,
 * including a real regression. `app/admin/AdminConsole.tsx#AdminConsole` is
 * the only entry — the admin console is staff-only tooling (an environment
 * badge tooltip and an "API unreachable" failure banner naming the admin API
 * explicitly, per this file's own docs, is exactly what staff need to
 * diagnose a real outage) and item 3's brief says to leave it unless a string
 * there is identical to the developer-facing wording contractors saw. It is
 * not identical — "API: staging", "admin API", "check the API is reachable"
 * name the API on purpose, for an audience that has one to check.
 */
const ALLOWED: { file: string; function: string; count: number; reason: string }[] = [
  {
    file: "app/admin/AdminConsole.tsx",
    function: "AdminConsole",
    count: 3,
    reason:
      "staff-only console: an environment-badge tooltip and a load-failure banner deliberately name the API for an audience that can actually check it — not the developer wording contractors saw",
  },
  {
    file: "lib/api-environment.ts",
    function: "apiEnvironment",
    count: 3,
    reason:
      "labels/detail for the admin-only environment badge (app/admin/page.tsx is its one caller) — diagnostic text for staff diagnosing a real deploy misconfiguration, not a contractor-facing failure fallback",
  },
];

function sourceFiles(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".next") continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) sourceFiles(full, found);
    else if ((entry.endsWith(".ts") || entry.endsWith(".tsx")) && !entry.includes(".test."))
      found.push(full);
  }
  return found;
}

/** Is `node` the module specifier of an import/export, or a dynamic import's argument? */
function isModuleSpecifier(node: ts.Node): boolean {
  const p = node.parent;
  if (!p) return false;
  if ((ts.isImportDeclaration(p) || ts.isExportDeclaration(p)) && p.moduleSpecifier === node) return true;
  if (
    ts.isCallExpression(p) &&
    p.expression.kind === ts.SyntaxKind.ImportKeyword &&
    p.arguments[0] === (node as ts.Expression)
  ) {
    return true;
  }
  return false;
}

/**
 * Is `node` an argument of a `console.<method>(...)` call whose receiver is the
 * GLOBAL `console`, not a local of the same name? `followAlias` resolves a
 * bare identifier through the shared binder; a local `const console = {...}`
 * has a declaration to follow (excluding it here), while the real global does
 * not (nothing in a no-lib, no-import single-file program binds it) — the same
 * binder-over-spelling discipline `source-ast.ts`'s own header requires,
 * closing the exact shadow this file's `calleeIsImport` doc warns a
 * spelling-only match leaves open.
 */
function isConsoleCallArgument(node: ts.Node): boolean {
  const p = node.parent;
  if (!p || !ts.isCallExpression(p) || !p.arguments.includes(node as ts.Expression)) return false;
  const callee = unwrap(p.expression);
  if (!ts.isPropertyAccessExpression(callee)) return false;
  const obj = unwrap(callee.expression);
  if (!ts.isIdentifier(obj) || obj.text !== "console") return false;
  return followAlias(obj) === undefined;
}

/** Is `node` the message argument of a `new XError(...)` that is directly `throw`n? */
function isThrownErrorConstructorArgument(node: ts.Node): boolean {
  const p = node.parent;
  if (!p || !ts.isNewExpression(p) || !p.arguments?.includes(node as ts.Expression)) return false;
  const callee = unwrap(p.expression);
  if (!ts.isIdentifier(callee) || !/Error$/.test(callee.text)) return false;
  const grand = p.parent;
  return !!grand && ts.isThrowStatement(grand) && grand.expression === p;
}

/** Does `text` contain the banned phrase, or "API" as a whole, case-sensitive word? */
function mentionsDeveloperApi(text: string): boolean {
  return text.includes("is the API running") || /\bAPI\b/.test(text);
}

interface Candidate {
  text: string;
  node: ts.Node;
}

/**
 * Every string literal that is one term of an all-literal `+` chain, concatenated in
 * order — e.g. `"is the A" + "PI running?"` — with the WHOLE chain as the context node
 * for the module/console/throw excuses. Found via `additiveChains`/`additiveTerms`, the
 * same shared-parser helpers a money guard uses to fold `+`/`-` into one fact, so this
 * file writes no second folding matcher. Only a chain where EVERY term is a plain string
 * literal or no-substitution template literal is folded; a chain with any dynamic term
 * is left alone (its literal pieces are still scanned individually, each on its own, by
 * the loops below — a chain is never invisible, only sometimes un-folded).
 */
function concatenatedLiteralCandidates(sf: ts.SourceFile): Candidate[] {
  const out: Candidate[] = [];
  for (const chain of additiveChains(sf)) {
    if (!ts.isBinaryExpression(chain)) continue; // the array-reduce() shape is never strings
    const terms = additiveTerms(chain);
    if (terms.length < 2 || terms.some((t) => t.sign !== 1)) continue; // `-` is not meaningful for strings
    const texts: string[] = [];
    let allLiteral = true;
    for (const t of terms) {
      const e = unwrap(t.expr);
      if (ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e)) texts.push(e.text);
      else {
        allLiteral = false;
        break;
      }
    }
    if (!allLiteral) continue;
    if (isModuleSpecifier(chain) || isConsoleCallArgument(chain) || isThrownErrorConstructorArgument(chain)) continue;
    out.push({ text: texts.join(""), node: chain });
  }
  return out;
}

/**
 * Every scanned string literal, template-literal SPAN (head AND every span after a
 * `${...}` — not the head alone, which let "is the API running" hide after the first
 * substitution and pass unseen), JSX text node, and all-literal `+`-concatenation in `sf`,
 * with its excuse-relevant context node.
 */
function candidatesIn(sf: ts.SourceFile): Candidate[] {
  const out: Candidate[] = [];
  for (const lit of collect(sf, ts.isStringLiteral)) {
    if (isModuleSpecifier(lit) || isConsoleCallArgument(lit) || isThrownErrorConstructorArgument(lit)) continue;
    out.push({ text: lit.text, node: lit });
  }
  for (const lit of collect(sf, ts.isNoSubstitutionTemplateLiteral)) {
    if (isModuleSpecifier(lit) || isConsoleCallArgument(lit) || isThrownErrorConstructorArgument(lit)) continue;
    out.push({ text: lit.text, node: lit });
  }
  for (const tpl of collect(sf, ts.isTemplateExpression)) {
    // The context checks apply to the WHOLE template (the thing actually passed
    // as an argument/thrown/imported). Every STATIC span is scanned — the head,
    // and the static text after each `${...}` (a TemplateMiddle/TemplateTail's
    // own `.text`) — never only the head; the dynamic substitution expressions
    // themselves cannot be judged statically and are left alone.
    if (isModuleSpecifier(tpl) || isConsoleCallArgument(tpl) || isThrownErrorConstructorArgument(tpl)) continue;
    out.push({ text: tpl.head.text, node: tpl });
    for (const span of tpl.templateSpans) {
      out.push({ text: span.literal.text, node: tpl });
    }
  }
  for (const { text, node } of renderedText(sf)) {
    out.push({ text, node });
  }
  out.push(...concatenatedLiteralCandidates(sf));
  return out;
}

describe("no user-visible text under app/ or components/ names the API", () => {
  const root = process.cwd();
  const files = [...sourceFiles(join(root, "app")), ...sourceFiles(join(root, "lib")), ...sourceFiles(join(root, "components"))];

  function offendersByKey(): Map<string, { rel: string; fn: string; count: number; samples: string[] }> {
    const byKey = new Map<string, { rel: string; fn: string; count: number; samples: string[] }>();
    for (const file of files) {
      const rel = file.slice(root.length + 1).replace(/\\/g, "/");
      const sf = parseFile(file);
      for (const { text, node } of candidatesIn(sf)) {
        if (!mentionsDeveloperApi(text)) continue;
        const fn = enclosingFunctionKey(node);
        const key = `${rel}#${fn}`;
        const entry = byKey.get(key) ?? { rel, fn, count: 0, samples: [] };
        entry.count++;
        if (entry.samples.length < 3) entry.samples.push(text.slice(0, 80));
        byKey.set(key, entry);
      }
    }
    return byKey;
  }

  it("scanned real subjects — a rename or a move that emptied discovery should fail loudly", () => {
    let scanned = 0;
    for (const file of files) scanned += candidatesIn(parseFile(file)).length;
    expect(scanned).toBeGreaterThan(0);
  });

  it("no unexcused user-visible text mentions the API", () => {
    const allowed = new Map(ALLOWED.map((a) => [`${a.file}#${a.function}`, a.count]));
    const byKey = offendersByKey();
    const offenders = [...byKey.entries()]
      .filter(([key, entry]) => allowed.get(key) !== entry.count)
      .map(
        ([key, entry]) =>
          `${key}: ${entry.count} mention(s) (allowed ${allowed.get(key) ?? 0}) — e.g. "${entry.samples[0]}"`,
      );
    expect(offenders, "developer wording ('API', 'is the API running') reaching a contractor — reword it").toEqual(
      [],
    );
  });

  it("does not let the allow-list rot: every entry still has exactly its count", () => {
    const byKey = offendersByKey();
    const drifted = ALLOWED.filter((a) => byKey.get(`${a.file}#${a.function}`)?.count !== a.count);
    expect(drifted).toEqual([]);
  });

  it("ignores an import path, however it spells the word", () => {
    const sf = parseSource("probe-import.ts", 'import { X } from "./my-API-client";');
    expect(candidatesIn(sf).some((c) => mentionsDeveloperApi(c.text))).toBe(false);
  });

  it("ignores a console.* call, but not a same-named local shadowing it", () => {
    const real = parseSource("probe-console.ts", 'console.error("API unreachable");');
    expect(candidatesIn(real).some((c) => mentionsDeveloperApi(c.text))).toBe(false);

    const shadowed = parseSource(
      "probe-console-shadow.tsx",
      [
        "function render() {",
        '  const console = { error: (s: string) => { document.title = s; } };',
        '  console.error("API unreachable");',
        "}",
      ].join("\n"),
    );
    // A local binding named `console` is not the global console — its argument
    // is not structurally excused merely because it is spelled the same way.
    expect(candidatesIn(shadowed).some((c) => mentionsDeveloperApi(c.text))).toBe(true);
  });

  it("ignores a thrown Error's own message, but not the same text rendered", () => {
    const thrown = parseSource("probe-throw.ts", 'throw new Error("is the API running");');
    expect(candidatesIn(thrown).some((c) => mentionsDeveloperApi(c.text))).toBe(false);

    // The live shape this guard exists for: the SAME words, handed to a
    // renderer rather than thrown, must still be caught.
    const rendered = parseSource("probe-thrown-then-shown.tsx", 'const x = <span>is the API running</span>;');
    expect(candidatesIn(rendered).some((c) => mentionsDeveloperApi(c.text))).toBe(true);
  });

  it("bypass: a reworded developer message with no banned substring still fires on the bare word API", () => {
    // The exact class the previous text-window guard could not see: a rewrite
    // that drops the phrase "is the API running" entirely still says "API".
    const probe = parseSource(
      "probe-reworded.tsx",
      'const x = <span>{errorMessage(err, "Couldn\'t save — API unreachable, try later")}</span>;',
    );
    expect(candidatesIn(probe).some((c) => mentionsDeveloperApi(c.text))).toBe(true);
  });

  it("does not fire on a word merely containing the letters API, like APIs", () => {
    const probe = parseSource("probe-word.tsx", "const x = <span>Third-party APIs may vary.</span>;");
    expect(candidatesIn(probe).some((c) => mentionsDeveloperApi(c.text))).toBe(false);
  });

  it("bypass this file's own review found: the banned phrase hidden after a template's first ${} was invisible when only the head was scanned", () => {
    // Before the fix, candidatesIn read only `tpl.head.text`. A rewrite that
    // moves the offending words after the FIRST substitution — still fully
    // static, still fully rendered — produced a head with nothing to catch.
    const probe = parseSource(
      "probe-template-tail.tsx",
      'const x = <span>{`Couldn\'t save ${code} — is the API running?`}</span>;',
    );
    expect(candidatesIn(probe).some((c) => mentionsDeveloperApi(c.text))).toBe(true);
  });

  it("folds an all-literal + chain, catching a phrase split across the boundary", () => {
    // Neither piece alone contains the banned word "API" as a whole word, but
    // concatenated they spell "is the API running" — the literal-scan bypass
    // this file's review named directly ("text after a template literal's
    // first ${}" was one instance of the general shape; a split + chain is
    // another).
    const probe = parseSource(
      "probe-concat.tsx",
      'const x = <span>{"is the A" + "PI running?"}</span>;',
    );
    expect(candidatesIn(probe).some((c) => mentionsDeveloperApi(c.text))).toBe(true);
  });

  it("does not fold a chain with a dynamic term, but still scans its literal pieces individually", () => {
    const probe = parseSource(
      "probe-concat-dynamic.tsx",
      'const x = <span>{"Couldn\'t save — " + reason + " is the API running?"}</span>;',
    );
    // The trailing literal piece alone contains the phrase, so it is still
    // caught by the per-literal scan even though the whole chain has a
    // dynamic middle term and cannot be folded.
    expect(candidatesIn(probe).some((c) => mentionsDeveloperApi(c.text))).toBe(true);
  });
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * The DATA-FLOW guard: nothing derived from a caught error's `.message` (or
 * the error stringified) may reach rendered output or a state setter except
 * through `errorMessage()`.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * The guard above answers "does any user-visible TEXT mention the API" — a
 * question about literal spelling. It proved a phrase absent; it never proved
 * that a raw `err.message` (which says whatever the network layer felt like
 * saying — "Failed to fetch", "NetworkError when attempting to fetch
 * resource") cannot reach the screen. Both of those strings contain no banned
 * word, so the literal guard is structurally blind to them. This is a
 * SEPARATE guard because it asks a different question: not "what does the
 * text say" but "where did this value come from".
 *
 * ## The rule
 *
 * For every place a caught error's text can first enter a program value —
 * a `catch (x) { ... }` binding, a `.catch(x => ...)` rejection callback, or
 * the second argument of `.then(_, x => ...)` — every read of `x.message`
 * (dot or `?.`), `x.toString()`, or `String(x)` is traced FORWARD through:
 *
 *  - wrappers that never change the value: parens, `as`, `satisfies`, `!`;
 *  - a ternary branch (`cond ? here : ...`);
 *  - a `+`, `||`, or `??` operand — so `err.message || "x"` and
 *    `err?.message ?? "x"` are followed exactly like a bare `err.message`;
 *  - a template-literal span, a property of an object literal, an arrow
 *    function's implicit return;
 *  - a `.message`/`.toString()`/`String(...)` extraction applied to an
 *    ALREADY-wrapped value — `(err as Error).message`, `(err!).toString()` —
 *    not only to the bare caught variable itself;
 *  - destructuring of the caught value that draws out its `message`
 *    property, object-pattern only, rename included: `const { message } =
 *    err as Error` and `const { message: msg } = err` are both followed,
 *    via the shared binder's `destructuredPropertyName` (so a `{ name }`
 *    destructure that never touches `message` is correctly left alone);
 *  - ONE hop of variable aliasing (`const msg = err.message; ...;
 *    setError(msg)`);
 *  - ONE hop through a same-file helper function or arrow whose only return
 *    is derived from its own first parameter's message — `function helper(e)
 *    { return (e as Error).message }` then `setError(helper(err))` traces
 *    through `helper` to find where ITS result goes;
 *
 * to see where it is finally consumed:
 *
 *  - Consumed by a call to `errorMessage` (resolved by the shared parser's
 *    `isImportedChain` to the real `@/lib/error-message` export, not a
 *    same-named local) — SAFE. That is the one sanctioned path.
 *  - Consumed by a call whose callee identifier matches `/^set[A-Z]/` (a
 *    React state setter by convention — `setError`, `setMessage`, a
 *    functional updater callback's return value), is literally `dispatch`,
 *    or is a name destructured from `useToast()` (resolved via
 *    `isImportedChain` to `@/components/ui/ToastProvider`'s `useToast`) with
 *    the property key `showToast` — FAIL: a raw value reached component
 *    state, a reducer, or a rendered toast.
 *  - Consumed by a JSX expression container, as a child or an attribute value
 *    — FAIL: a raw value renders directly.
 *  - Anything else (passed to `console.*`, thrown again, handed to an
 *    unrecognised function, assigned to an object property that is never
 *    traced further) — UNRESOLVED, not flagged. See "What this does not
 *    follow" below.
 *
 * ## Allow-list
 *
 * Keyed `file#function` (via `enclosingFunctionKey`) with an exact COUNT, the
 * same discipline the literal guard above uses. Six admin-console handlers
 * each read `err.message` through `err instanceof ApiError ? err.message :
 * fallback` — the SAME safety `errorMessage()` provides internally (an
 * `ApiError`'s message is a deliberate, server-authored sentence; anything
 * else is a genuine transport failure), just spelled inline rather than via
 * the helper, and only ever shown to staff running the admin console. This
 * guard cannot see the `instanceof ApiError` discriminant as equivalent to
 * `errorMessage()` — it only recognises the one sanctioned call — so each
 * site is named explicitly rather than silently excluded by shape. A
 * SEPARATE test below (`isGuardedByApiErrorInstanceof`) independently checks
 * that every one of these six sites is really discriminated by `instanceof
 * ApiError` specifically — not merely `instanceof Error`, which would accept
 * any thrown object's message, staff-only audience or not — so the allow-list
 * cannot silently keep covering a site after that discriminant rots.
 *
 * ## What this does NOT follow — read this before trusting a clean result
 *
 * - **More than one hop of variable aliasing, or of local-helper indirection,
 *   per traced value.** `const a = err.message; const b = a; setError(b)` is
 *   not traced past `a`, and `setError(wrapTwice(helper(err)))` is not
 *   traced past `helper` when `wrapTwice` is itself an unrecognised function.
 *   (One hop of each covers every real site found in this codebase; extend
 *   `traceSink`'s alias/helper cases to recurse further if a real one
 *   appears.)
 * - **A value stored on an object property and read back later.** `const bag
 *   = { msg: err.message }; ...; setError(bag.msg)` is not connected — the
 *   property WRITE is followed one level (into a `setX(...)` argument or JSX
 *   directly), but a later READ of that property from a different
 *   expression is not matched back to the write.
 * - **A value passed through an unrecognised function** other than the one
 *   local-helper hop above — `setError(wrap(err instanceof Error ?
 *   err.message : "x"))` stops at `wrap(...)` when `wrap` is not a same-file
 *   function/arrow whose own return is derived from its own parameter.
 * - **A setter/sink not named `set...`, `dispatch`, or destructured as
 *   `showToast` off `useToast()`.** A differently-named callback prop, a
 *   Redux-toolkit slice action creator invoked some other way, or a toast
 *   helper renamed AND re-exported from a different module than
 *   `@/components/ui/ToastProvider` is invisible to these three checks.
 * - **Catch-variable shadowing is name-scoped, not fully binder-resolved.**
 *   Reads of the catch variable (or a `.catch`/`.then` rejection parameter)
 *   are collected by NAME within its body, skipping any nested function or
 *   catch clause that re-declares a parameter of the same name — but a
 *   `const err = ...` re-declaration inside a nested block that is NOT a
 *   function/catch boundary is not detected as shadowing, and its reads
 *   would be (wrongly) attributed to the outer binding. This never occurs in
 *   the current codebase.
 * - **`.stack`, `.name`, `.cause`, and other Error properties** are not
 *   traced — only `.message`, `.toString()`, and `String(x)`, matching the
 *   brief's named shapes.
 * - **Array-destructuring of the caught value** (`const [m] = [err]`) is not
 *   followed — only object-pattern destructuring that names a `message`
 *   property, which is the shape actually seen in this codebase and in the
 *   review that named this class of bypass.
 */

function catchClausesWithBinding(sf: ts.SourceFile): (ts.CatchClause & { variableDeclaration: ts.VariableDeclaration })[] {
  return collect(sf, ts.isCatchClause).filter(
    (c): c is ts.CatchClause & { variableDeclaration: ts.VariableDeclaration } =>
      !!c.variableDeclaration && ts.isIdentifier(c.variableDeclaration.name),
  );
}

/** A place a caught error's text can enter the program other than a `catch` block. */
interface RejectionBinding {
  name: string;
  body: ts.Node;
  /** The node passed to `enclosingFunctionKey`/`namedReadsIn`'s shadow check. */
  declNode: ts.Node;
}

/**
 * Every `.catch(cb)` rejection callback and every `.then(_, onRejected)`
 * second callback, whose first parameter is a plain identifier — the two
 * shapes a Promise hands a caught error to code that never wrote `catch (x)`.
 * `err => setError(err.message)` in `somePromise.catch(err => ...)` is
 * otherwise invisible to `catchClausesWithBinding`, which only looks for the
 * `try/catch` keyword.
 */
function rejectionBindings(sf: ts.SourceFile): RejectionBinding[] {
  const out: RejectionBinding[] = [];
  for (const call of collect(sf, ts.isCallExpression)) {
    const callee = unwrap(call.expression);
    if (!ts.isPropertyAccessExpression(callee)) continue;
    let fnArg: ts.Expression | undefined;
    if (callee.name.text === "catch" && call.arguments.length >= 1) fnArg = call.arguments[0];
    else if (callee.name.text === "then" && call.arguments.length >= 2) fnArg = call.arguments[1];
    if (!fnArg) continue;
    const fn = unwrap(fnArg);
    if ((ts.isArrowFunction(fn) || ts.isFunctionExpression(fn)) && fn.parameters.length >= 1 && fn.body) {
      const p0 = fn.parameters[0]!;
      if (ts.isIdentifier(p0.name)) out.push({ name: p0.name.text, body: fn.body, declNode: fn });
    }
  }
  return out;
}

/** Does `node` introduce a NEW binding named `name` that would shadow an outer one? */
function introducesBinding(node: ts.Node, name: string): boolean {
  if (ts.isParameter(node) && ts.isIdentifier(node.name) && node.name.text === name) return true;
  if (
    ts.isCatchClause(node) &&
    node.variableDeclaration &&
    ts.isIdentifier(node.variableDeclaration.name) &&
    node.variableDeclaration.name.text === name
  ) {
    return true;
  }
  return false;
}

/** Is `id` used as the declaration name of a binding, rather than as a read? */
function isDeclarationPosition(id: ts.Identifier): boolean {
  const p = id.parent;
  if (ts.isVariableDeclaration(p) && p.name === id) return true;
  if (ts.isParameter(p) && p.name === id) return true;
  if (ts.isBindingElement(p) && p.name === id) return true;
  if (ts.isImportSpecifier(p) && p.name === id) return true;
  if (ts.isCatchClause(p) && p.variableDeclaration?.name === id) return true;
  return false;
}

/**
 * Every read of `name` within `scope`, skipping any subtree rooted at a
 * function-like node or catch clause that re-declares `name` as its own
 * parameter — see the guard header's shadowing caveat.
 */
function namedReadsIn(scope: ts.Node, name: string, excludeDecl: ts.Node): ts.Identifier[] {
  const out: ts.Identifier[] = [];
  function shadowingBoundary(n: ts.Node): boolean {
    if (n === excludeDecl) return false;
    if ((ts.isFunctionDeclaration(n) || ts.isFunctionExpression(n) || ts.isArrowFunction(n)) && n.parameters.some((p) => introducesBinding(p, name))) {
      return true;
    }
    if (ts.isCatchClause(n) && introducesBinding(n, name)) return true;
    return false;
  }
  function walk(n: ts.Node) {
    if (shadowingBoundary(n)) return;
    if (ts.isIdentifier(n) && n.text === name && !isDeclarationPosition(n)) out.push(n);
    n.forEachChild(walk);
  }
  walk(scope);
  return out;
}

/** Is `id` the receiver of `.message` (`<id>.message`)? Returns that PropertyAccessExpression, or undefined. */
function messageAccessOf(id: ts.Identifier): ts.PropertyAccessExpression | undefined {
  const p = id.parent;
  if (ts.isPropertyAccessExpression(p) && p.expression === id && p.name.text === "message") return p;
  return undefined;
}

/** Is `id` the receiver of a zero-argument `.toString()` call? Returns that CallExpression. */
function toStringCallOf(id: ts.Identifier): ts.CallExpression | undefined {
  const p = id.parent;
  if (!ts.isPropertyAccessExpression(p) || p.expression !== id || p.name.text !== "toString") return undefined;
  const call = p.parent;
  return ts.isCallExpression(call) && call.expression === p && call.arguments.length === 0 ? call : undefined;
}

/** Is `id` an argument of a bare (unshadowed-in-spelling) `String(...)` call? Returns that CallExpression. */
function stringCallOf(id: ts.Identifier): ts.CallExpression | undefined {
  const p = id.parent;
  if (!ts.isCallExpression(p) || !p.arguments.includes(id)) return undefined;
  const callee = unwrap(p.expression);
  return ts.isIdentifier(callee) && callee.text === "String" ? p : undefined;
}

/**
 * For one occurrence of the catch variable, the node representing "its text
 * pulled out" — or undefined when this occurrence is not a text-extracting
 * read (e.g. the `err` in `err instanceof Error`, or in `typeof err`, which
 * name the value without reading its message).
 */
function rawReadNode(id: ts.Identifier): ts.Node | undefined {
  const p = id.parent;
  if (ts.isBinaryExpression(p) && p.operatorToken.kind === ts.SyntaxKind.InstanceOfKeyword) return undefined;
  if (ts.isTypeOfExpression(p)) return undefined;
  const msg = messageAccessOf(id);
  if (msg) return msg;
  if (ts.isPropertyAccessExpression(p) && p.expression === id) return undefined; // some OTHER property (.stack, .name, .code) — out of scope
  const toStr = toStringCallOf(id);
  if (toStr) return toStr;
  const strCall = stringCallOf(id);
  if (strCall) return strCall;
  return id; // a bare read, e.g. passed directly as a value
}

type Verdict = "safe" | "fail" | "unresolved";

/**
 * Traces `cur` forward to where its value is finally consumed. See the guard
 * header for the full list of hops followed and the sink rules.
 */
const FOLLOWED_BINARY_OPERATORS = new Set([
  ts.SyntaxKind.PlusToken,
  ts.SyntaxKind.BarBarToken,
  ts.SyntaxKind.QuestionQuestionToken,
]);

/** Same declaration shape a local `function helper(e) {...}` or `const helper = (e) => ...` takes. */
interface LocalCallable {
  params: readonly ts.ParameterDeclaration[];
  body: ts.ConciseBody | ts.Block;
  node: ts.Node;
}

function findLocalCallable(name: string, sf: ts.SourceFile): LocalCallable | undefined {
  for (const fn of collect(sf, ts.isFunctionDeclaration)) {
    if (fn.name?.text === name && fn.body) return { params: fn.parameters, body: fn.body, node: fn };
  }
  for (const vd of collect(sf, ts.isVariableDeclaration)) {
    if (ts.isIdentifier(vd.name) && vd.name.text === name && vd.initializer) {
      const init = unwrap(vd.initializer);
      if ((ts.isArrowFunction(init) || ts.isFunctionExpression(init)) && init.body) {
        return { params: init.parameters, body: init.body, node: init };
      }
    }
  }
  return undefined;
}

/**
 * Does `fn`'s return value (the arrow's concise body, or its block body's
 * one-hop-followed return) derive from its OWN first parameter's message —
 * the shape `function helper(e) { return (e as Error).message }`? Reuses the
 * same wrapper/operator vocabulary as `traceSink`, but stops the moment the
 * value reaches this function's own return/body rather than tracing onward.
 */
function paramLeaksToReturn(fn: LocalCallable): boolean {
  if (fn.params.length === 0 || !ts.isIdentifier(fn.params[0]!.name)) return false;
  const paramName = (fn.params[0]!.name as ts.Identifier).text;
  const reads = namedReadsIn(fn.body, paramName, fn.node);
  for (const id of reads) {
    const raw = rawReadNode(id);
    if (!raw) continue;
    let cur: ts.Node = raw;
    for (;;) {
      const p: ts.Node | undefined = cur.parent;
      if (!p) break;
      if (
        ts.isParenthesizedExpression(p) ||
        ts.isAsExpression(p) ||
        ts.isNonNullExpression(p) ||
        ts.isSatisfiesExpression(p) ||
        ts.isTypeAssertionExpression(p)
      ) {
        cur = p;
        continue;
      }
      if (ts.isConditionalExpression(p) && (p.whenTrue === cur || p.whenFalse === cur)) {
        cur = p;
        continue;
      }
      if (ts.isBinaryExpression(p) && FOLLOWED_BINARY_OPERATORS.has(p.operatorToken.kind) && (p.left === cur || p.right === cur)) {
        cur = p;
        continue;
      }
      if (ts.isPropertyAccessExpression(p) && p.expression === cur && p.name.text === "message") {
        cur = p;
        continue;
      }
      if (ts.isArrowFunction(p) && p.body === cur && p === fn.node) return true;
      if (ts.isReturnStatement(p)) {
        let f: ts.Node | undefined = p.parent;
        while (f && !ts.isArrowFunction(f) && !ts.isFunctionExpression(f) && !ts.isFunctionDeclaration(f)) f = f.parent;
        if (f === fn.node) return true;
      }
      break;
    }
  }
  return false;
}

/** Is `callee`, used as a call's callee, destructured (any rename) from `useToast()`'s `showToast`? */
function isToastFunctionCall(callee: ts.Expression): boolean {
  return ts.isIdentifier(callee) && destructuredPropertyName(callee) === "showToast";
}

function traceSink(cur0: ts.Node, scope: ts.Node, aliased: ReadonlySet<string>): Verdict {
  let cur: ts.Node = cur0;
  for (;;) {
    const p: ts.Node | undefined = cur.parent;
    if (!p) return "unresolved";

    if (
      ts.isParenthesizedExpression(p) ||
      ts.isAsExpression(p) ||
      ts.isNonNullExpression(p) ||
      ts.isSatisfiesExpression(p) ||
      ts.isTypeAssertionExpression(p)
    ) {
      cur = p;
      continue;
    }
    if (ts.isConditionalExpression(p) && (p.whenTrue === cur || p.whenFalse === cur)) {
      cur = p;
      continue;
    }
    if (ts.isBinaryExpression(p) && FOLLOWED_BINARY_OPERATORS.has(p.operatorToken.kind) && (p.left === cur || p.right === cur)) {
      cur = p;
      continue;
    }
    // A `.message`/`.toString()` extraction applied to an ALREADY-WRAPPED value —
    // `(err as Error).message`, `(err!).toString()` — not only to the bare caught
    // variable, which `rawReadNode` alone would have caught at the top.
    if (ts.isPropertyAccessExpression(p) && p.expression === cur && p.name.text === "message") {
      cur = p;
      continue;
    }
    if (ts.isPropertyAccessExpression(p) && p.expression === cur && p.name.text === "toString") {
      const call = p.parent;
      if (call && ts.isCallExpression(call) && call.expression === p && call.arguments.length === 0) {
        cur = call;
        continue;
      }
    }
    if (ts.isTemplateSpan(p)) {
      cur = p.parent; // the enclosing TemplateExpression
      continue;
    }
    if (ts.isPropertyAssignment(p) && p.initializer === cur) {
      cur = p.parent; // the enclosing ObjectLiteralExpression
      continue;
    }
    if (ts.isReturnStatement(p) && p.expression === cur) {
      let f: ts.Node | undefined = p.parent;
      while (f && !ts.isArrowFunction(f) && !ts.isFunctionExpression(f) && !ts.isFunctionDeclaration(f)) f = f.parent;
      if (!f) return "unresolved";
      cur = f;
      continue;
    }
    if (ts.isArrowFunction(p) && p.body === cur) {
      cur = p;
      continue;
    }
    if (ts.isVariableDeclaration(p) && p.initializer === cur) {
      if (ts.isIdentifier(p.name)) {
        const aliasName = p.name.text;
        if (aliased.has(aliasName)) return "unresolved"; // one hop only — see the guard header
        const reads = namedReadsIn(scope, aliasName, p);
        let verdict: Verdict = "unresolved";
        for (const r of reads) {
          const v = traceSink(r, scope, new Set([...aliased, aliasName]));
          if (v === "fail") return "fail";
          if (v === "safe") verdict = "safe";
        }
        return verdict;
      }
      if (ts.isObjectBindingPattern(p.name)) {
        // Destructuring the caught value that draws out `message` (any rename):
        // `const { message } = err as Error`, `const { message: msg } = err`.
        let verdict: Verdict = "unresolved";
        for (const el of p.name.elements) {
          if (el.dotDotDotToken || !ts.isIdentifier(el.name)) continue;
          const propName = el.propertyName
            ? ts.isIdentifier(el.propertyName)
              ? el.propertyName.text
              : undefined
            : el.name.text;
          if (propName !== "message") continue;
          const aliasName = el.name.text;
          if (aliased.has(aliasName)) continue;
          const reads = namedReadsIn(scope, aliasName, el);
          for (const r of reads) {
            const v = traceSink(r, scope, new Set([...aliased, aliasName]));
            if (v === "fail") return "fail";
            if (v === "safe") verdict = "safe";
          }
        }
        return verdict;
      }
      return "unresolved";
    }
    if (ts.isCallExpression(p) && p.arguments.includes(cur as ts.Expression)) {
      const callee = unwrap(p.expression);
      if (isImportedChain(callee, "@/lib/error-message", "errorMessage")) return "safe";
      // `String(x)` transforms the value without consuming it — keep tracing forward.
      if (ts.isIdentifier(callee) && callee.text === "String" && !followAlias(callee) && p.arguments.length === 1) {
        cur = p;
        continue;
      }
      if (ts.isIdentifier(callee)) {
        if (/^set[A-Z]/.test(callee.text)) return "fail";
        if (callee.text === "dispatch") return "fail";
        if (isToastFunctionCall(callee)) return "fail";
        const localFn = findLocalCallable(callee.text, callee.getSourceFile());
        if (localFn && paramLeaksToReturn(localFn)) {
          cur = p; // one hop through a local helper that leaks its own parameter's message
          continue;
        }
      }
      return "unresolved";
    }
    if (ts.isJsxExpression(p) && p.expression === cur) return "fail";

    return "unresolved";
  }
}

const FLOW_ALLOWED: { file: string; function: string; count: number; reason: string }[] = [
  {
    file: "app/admin/AdminConsole.tsx",
    function: "toggleTenantSuspend",
    count: 1,
    reason: "err instanceof ApiError ? err.message : fallback — the same safety errorMessage() provides internally, spelled inline; staff-only admin console",
  },
  {
    file: "app/admin/AdminConsole.tsx",
    function: "confirmHardDelete",
    count: 1,
    reason: "same instanceof-ApiError pattern; staff-only admin console",
  },
  {
    file: "app/admin/AdminConsole.tsx",
    function: "submitPromote",
    count: 1,
    reason: "same instanceof-ApiError pattern; staff-only admin console",
  },
  {
    file: "app/admin/AdminConsole.tsx",
    function: "saveAdminCaps",
    count: 1,
    reason: "same instanceof-ApiError pattern; staff-only admin console",
  },
  {
    file: "app/admin/AdminConsole.tsx",
    function: "toggleSuperAdmin",
    count: 1,
    reason: "same instanceof-ApiError pattern; staff-only admin console",
  },
  {
    file: "app/admin/AdminConsole.tsx",
    function: "doRevokeAdmin",
    count: 1,
    reason: "same instanceof-ApiError pattern; staff-only admin console",
  },
];

function flowOffendersByKey(files: string[], root: string): Map<string, { rel: string; fn: string; count: number }> {
  const byKey = new Map<string, { rel: string; fn: string; count: number }>();
  for (const file of files) {
    const rel = file.slice(root.length + 1).replace(/\\/g, "/");
    const sf = parseFile(file);
    const sources: RejectionBinding[] = [
      ...catchClausesWithBinding(sf).map((clause) => ({
        name: (clause.variableDeclaration.name as ts.Identifier).text,
        body: clause.block,
        declNode: clause,
      })),
      ...rejectionBindings(sf),
    ];
    for (const src of sources) {
      const reads = namedReadsIn(src.body, src.name, src.declNode);
      for (const id of reads) {
        const raw = rawReadNode(id);
        if (!raw) continue;
        const verdict = traceSink(raw, sf, new Set());
        if (verdict !== "fail") continue;
        const fn = enclosingFunctionKey(src.declNode);
        const key = `${rel}#${fn}`;
        const entry = byKey.get(key) ?? { rel, fn, count: 0 };
        entry.count++;
        byKey.set(key, entry);
      }
    }
  }
  return byKey;
}

/**
 * Is `msgAccess` (a `.message` PropertyAccessExpression) the `whenTrue` branch
 * of a ternary whose condition is `<expr> instanceof ApiError`, resolved
 * through the shared binder to the real `@/lib/api-client` export — not
 * merely spelled `ApiError`, and not `instanceof Error`, which would accept
 * ANY thrown object's message? This is what actually justifies each
 * `FLOW_ALLOWED` admin-console entry; a site whose discriminant rots to
 * `instanceof Error` still matches the allow-list by function name and
 * count, so this is a SEPARATE, independent check.
 */
function isGuardedByApiErrorInstanceof(msgAccess: ts.Node): boolean {
  const p = msgAccess.parent;
  if (!p || !ts.isConditionalExpression(p) || p.whenTrue !== msgAccess) return false;
  const cond = unwrap(p.condition);
  if (!ts.isBinaryExpression(cond) || cond.operatorToken.kind !== ts.SyntaxKind.InstanceOfKeyword) return false;
  return isImportedChain(cond.right, "@/lib/api-client", "ApiError");
}

describe("no raw caught-error text reaches rendered output or a setter except via errorMessage()", () => {
  const root = process.cwd();
  const files = [...sourceFiles(join(root, "app")), ...sourceFiles(join(root, "lib")), ...sourceFiles(join(root, "components"))];

  it("scanned real subjects — a rename or a move that emptied discovery should fail loudly", () => {
    let catches = 0;
    for (const file of files) catches += catchClausesWithBinding(parseFile(file)).length;
    expect(catches).toBeGreaterThan(0);
  });

  it("scanned real .catch()/.then() rejection callbacks — three real sites use `.catch((err) =>`", () => {
    let rejections = 0;
    for (const file of files) rejections += rejectionBindings(parseFile(file)).length;
    expect(rejections).toBeGreaterThan(0);
  });

  it("every FLOW_ALLOWED admin-console site really discriminates via instanceof ApiError, not just instanceof Error", () => {
    const sf = parseFile(join(root, "app/admin/AdminConsole.tsx"));
    for (const entry of FLOW_ALLOWED) {
      const clauses = catchClausesWithBinding(sf).filter((c) => enclosingFunctionKey(c) === entry.function);
      const guarded = clauses.some((clause) => {
        const name = (clause.variableDeclaration.name as ts.Identifier).text;
        const reads = namedReadsIn(clause.block, name, clause);
        return reads.some((id) => {
          const msg = messageAccessOf(id);
          return !!msg && isGuardedByApiErrorInstanceof(msg);
        });
      });
      expect(guarded, `${entry.function} is allow-listed as instanceof-ApiError-guarded but is not`).toBe(true);
    }
  });

  it("no unexcused raw error-text flow reaches a setter or JSX", () => {
    const allowed = new Map(FLOW_ALLOWED.map((a) => [`${a.file}#${a.function}`, a.count]));
    const byKey = flowOffendersByKey(files, root);
    const offenders = [...byKey.entries()]
      .filter(([key, entry]) => allowed.get(key) !== entry.count)
      .map(([key, entry]) => `${key}: ${entry.count} unexcused flow(s) (allowed ${allowed.get(key) ?? 0})`);
    expect(
      offenders,
      "a caught error's raw .message/.toString()/String(x) reaches a setter or JSX without going through errorMessage()",
    ).toEqual([]);
  });

  it("does not let the allow-list rot: every entry still has exactly its count", () => {
    const byKey = flowOffendersByKey(files, root);
    const drifted = FLOW_ALLOWED.filter((a) => byKey.get(`${a.file}#${a.function}`)?.count !== a.count);
    expect(drifted).toEqual([]);
  });

  it("passes a site that routes through errorMessage()", () => {
    const sf = parseSource(
      "probe-safe.tsx",
      'function F() { const [e,setError]=useState(""); try {} catch (err) { setError(errorMessage(err, "Couldn\'t save.")); } }',
    );
    const clause = catchClausesWithBinding(sf)[0]!;
    const reads = namedReadsIn(clause.block, "err", clause);
    const verdicts = reads.map((id) => rawReadNode(id)).filter((n): n is ts.Node => !!n).map((n) => traceSink(n, sf, new Set()));
    expect(verdicts.every((v) => v !== "fail")).toBe(true);
  });

  it("bypass: a raw err.message handed straight to a setter, with no errorMessage(), fails", () => {
    const sf = parseSource(
      "probe-bypass-setter.tsx",
      'function F() { const [e,setError]=useState(""); try {} catch (err) { setError(err.message); } }',
    );
    const clause = catchClausesWithBinding(sf)[0]!;
    const reads = namedReadsIn(clause.block, "err", clause);
    const verdicts = reads.map((id) => rawReadNode(id)).filter((n): n is ts.Node => !!n).map((n) => traceSink(n, sf, new Set()));
    expect(verdicts.some((v) => v === "fail")).toBe(true);
  });

  it("bypass: a raw err.message rendered directly in JSX, with no errorMessage(), fails", () => {
    const sf = parseSource(
      "probe-bypass-jsx.tsx",
      'function F() { try {} catch (err) { return <span>{err.message}</span>; } }',
    );
    const clause = catchClausesWithBinding(sf)[0]!;
    const reads = namedReadsIn(clause.block, "err", clause);
    const verdicts = reads.map((id) => rawReadNode(id)).filter((n): n is ts.Node => !!n).map((n) => traceSink(n, sf, new Set()));
    expect(verdicts.some((v) => v === "fail")).toBe(true);
  });

  it("bypass: the reviewer's exact shape — err instanceof Error ? err.message : fallback, into a setter — fails", () => {
    const sf = parseSource(
      "probe-bypass-ternary.tsx",
      'function F() { const [e,setError]=useState(""); try {} catch (err) { setError(err instanceof Error ? err.message : "Couldn\'t save."); } }',
    );
    const clause = catchClausesWithBinding(sf)[0]!;
    const reads = namedReadsIn(clause.block, "err", clause);
    const verdicts = reads.map((id) => rawReadNode(id)).filter((n): n is ts.Node => !!n).map((n) => traceSink(n, sf, new Set()));
    expect(verdicts.some((v) => v === "fail")).toBe(true);
  });

  /** Runs every read of `err` in `src` through `rawReadNode`/`traceSink` and returns the verdicts. */
  function verdictsFor(src: string, fileName = "probe.tsx"): Verdict[] {
    const sf = parseSource(fileName, src);
    const clause = catchClausesWithBinding(sf)[0]!;
    const reads = namedReadsIn(clause.block, "err", clause);
    return reads.map((id) => rawReadNode(id)).filter((n): n is ts.Node => !!n).map((n) => traceSink(n, sf, new Set()));
  }

  it("bypass 1: setError((err as Error).message) — an `as`-wrapped receiver, not the bare caught variable", () => {
    const verdicts = verdictsFor(
      'function F() { const [e,setError]=useState(""); try {} catch (err) { setError((err as Error).message); } }',
    );
    expect(verdicts.some((v) => v === "fail")).toBe(true);
  });

  it('bypass 2: setError(err.message || "x") — a `||` fallback after the message read', () => {
    const verdicts = verdictsFor(
      'function F() { const [e,setError]=useState(""); try {} catch (err) { setError(err.message || "x"); } }',
    );
    expect(verdicts.some((v) => v === "fail")).toBe(true);
  });

  it("bypass 3: const { message } = err as Error; setError(message) — object-destructuring the caught value", () => {
    const verdicts = verdictsFor(
      'function F() { const [e,setError]=useState(""); try {} catch (err) { const { message } = err as Error; setError(message); } }',
    );
    expect(verdicts.some((v) => v === "fail")).toBe(true);
  });

  it("bypass 3b: const { message: msg } = err; setError(msg) — the same destructure, renamed", () => {
    const verdicts = verdictsFor(
      'function F() { const [e,setError]=useState(""); try {} catch (err) { const { message: msg } = err; setError(msg); } }',
    );
    expect(verdicts.some((v) => v === "fail")).toBe(true);
  });

  it('bypass 4: setError(err?.message ?? "x") — optional chaining plus a `??` fallback', () => {
    const verdicts = verdictsFor(
      'function F() { const [e,setError]=useState(""); try {} catch (err) { setError(err?.message ?? "x"); } }',
    );
    expect(verdicts.some((v) => v === "fail")).toBe(true);
  });

  it("bypass 5a: showToast(err.message) — a toast, not a `set*` state setter", () => {
    const sf = parseSource(
      "probe-toast.tsx",
      [
        'import { useToast } from "@/components/ui/ToastProvider";',
        "function F() {",
        "  const { showToast } = useToast();",
        "  try {} catch (err) { showToast(err.message); }",
        "}",
      ].join("\n"),
    );
    const clause = catchClausesWithBinding(sf)[0]!;
    const reads = namedReadsIn(clause.block, "err", clause);
    const verdicts = reads.map((id) => rawReadNode(id)).filter((n): n is ts.Node => !!n).map((n) => traceSink(n, sf, new Set()));
    expect(verdicts.some((v) => v === "fail")).toBe(true);
  });

  it("bypass 5b: dispatch({ message: err.message }) — a reducer dispatch, not a `set*` setter", () => {
    const verdicts = verdictsFor(
      "function F() { const [,dispatch]=[null,(a:unknown)=>{}]; try {} catch (err) { dispatch({ message: err.message }); } }",
    );
    expect(verdicts.some((v) => v === "fail")).toBe(true);
  });

  it("bypass 6: somePromise.catch((e) => setError(e.message)) — a rejection callback, never a `catch (x)`", () => {
    const sf = parseSource(
      "probe-catch-callback.tsx",
      'function F() { const [e,setError]=useState(""); somePromise().catch((e) => setError(e.message)); }',
    );
    const bindings = rejectionBindings(sf);
    expect(bindings.length).toBe(1);
    const reads = namedReadsIn(bindings[0]!.body, bindings[0]!.name, bindings[0]!.declNode);
    const verdicts = reads.map((id) => rawReadNode(id)).filter((n): n is ts.Node => !!n).map((n) => traceSink(n, sf, new Set()));
    expect(verdicts.some((v) => v === "fail")).toBe(true);
  });

  it("bypass 6b: somePromise.then(onOk, (e) => setError(e.message)) — the rejection arm of .then", () => {
    const sf = parseSource(
      "probe-then-rejected.tsx",
      'function F() { const [e,setError]=useState(""); somePromise().then((r) => r, (e) => setError(e.message)); }',
    );
    const bindings = rejectionBindings(sf);
    expect(bindings.length).toBe(1);
    const reads = namedReadsIn(bindings[0]!.body, bindings[0]!.name, bindings[0]!.declNode);
    const verdicts = reads.map((id) => rawReadNode(id)).filter((n): n is ts.Node => !!n).map((n) => traceSink(n, sf, new Set()));
    expect(verdicts.some((v) => v === "fail")).toBe(true);
  });

  it("bypass 7: a same-file helper returning (e as Error).message, then setError(helper(err))", () => {
    const verdicts = verdictsFor(
      [
        "function helper(e: unknown) { return (e as Error).message; }",
        'function F() { const [e,setError]=useState(""); try {} catch (err) { setError(helper(err)); } }',
      ].join("\n"),
    );
    expect(verdicts.some((v) => v === "fail")).toBe(true);
  });

  it("does not flag a local helper that returns something unrelated to its parameter's message", () => {
    const verdicts = verdictsFor(
      [
        'function helper(e: unknown) { return "generic failure"; }',
        'function F() { const [e,setError]=useState(""); try {} catch (err) { setError(helper(err)); } }',
      ].join("\n"),
    );
    expect(verdicts.some((v) => v === "fail")).toBe(false);
  });

  it("does not flag destructuring a property other than message off the caught value", () => {
    const verdicts = verdictsFor(
      'function F() { const [e,setError]=useState(""); try {} catch (err) { const { name } = err as Error; setError(name); } }',
    );
    expect(verdicts.some((v) => v === "fail")).toBe(false);
  });

  it("isGuardedByApiErrorInstanceof: true for instanceof ApiError, false for instanceof Error", () => {
    const safe = parseSource(
      "probe-guard-apierror.tsx",
      [
        'import { ApiError } from "@/lib/api-client";',
        'function F() { try {} catch (err) { const x = err instanceof ApiError ? err.message : "x"; } }',
      ].join("\n"),
    );
    const safeClause = catchClausesWithBinding(safe)[0]!;
    const safeReads = namedReadsIn(safeClause.block, "err", safeClause);
    const safeMsg = safeReads.map(messageAccessOf).find((m): m is ts.PropertyAccessExpression => !!m);
    expect(safeMsg && isGuardedByApiErrorInstanceof(safeMsg)).toBe(true);

    // The exact plant the brief calls for: swap ApiError for the built-in Error.
    // Any thrown object satisfies `instanceof Error`, so this is NOT the same
    // safety `errorMessage()` provides — the discriminant rotted, and this check
    // must say so even though the surrounding shape (a ternary with `.message`
    // in `whenTrue`) is identical.
    const planted = parseSource(
      "probe-guard-error.tsx",
      'function F() { try {} catch (err) { const x = err instanceof Error ? err.message : "x"; } }',
    );
    const plantedClause = catchClausesWithBinding(planted)[0]!;
    const plantedReads = namedReadsIn(plantedClause.block, "err", plantedClause);
    const plantedMsg = plantedReads.map(messageAccessOf).find((m): m is ts.PropertyAccessExpression => !!m);
    expect(plantedMsg && isGuardedByApiErrorInstanceof(plantedMsg)).toBe(false);
  });
});
