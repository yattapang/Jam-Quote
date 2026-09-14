import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, sep } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

/**
 * Nothing outside core decides an invoice balance, or whether one is settled.
 *
 * ## Why this lives in core and scans the whole repo
 *
 * The first version of this guard lived in `apps/web` and looked for one
 * spelling of one shape. A review took it apart, and it was right on every count:
 *
 * - **It scanned only `apps/web`, and four of the six original defects were in
 *   `apps/api`.** It could never have caught `reports.service.ts`, which was
 *   still live when the cluster was declared closed.
 * - **It matched subtractions only.** Three of the six were COMPARISONS —
 *   `paidCents >= totalCents` in `statusForPaid` and again in the WiPay callback.
 * - **Its comment-stripper broke on string literals.** `//` inside a URL deleted
 *   the rest of the line, which could hide a real offender sitting after it.
 *
 * ## Why this version parses instead of matching text
 *
 * A second review defeated the text-matching version three ways, none of which
 * changed behaviour: a bracket-notation access (`inv["totalCents"]`), copying the
 * two fields into locals before subtracting them, and an `ALLOWED` map keyed only
 * by file path.
 *
 * ## Why names are resolved by the binder (generation 3)
 *
 * The parsing version still tracked aliases in a file-wide map keyed by a local's
 * NAME — the "compare a name's spelling" shape from `.claude/agents/README.md`. A
 * review executed six rewrites through it, none changing behaviour:
 *
 * - `const t = b.paidCents` in one function and `const t = a.totalCents` in a later one:
 *   the later write won the map, so the first function's real `q - t` was MISSED — and
 *   an unrelated parameter `t` elsewhere was reported.
 * - `inv.totalCents! - inv.paidCents`, `(inv.totalCents as number) - …`,
 *   `Number(inv.totalCents) - …`, `-inv.paidCents + inv.totalCents`, and
 *   `const { totalCents: t } = inv; t - inv.paidCents` — none were unwrapped.
 *
 * Each file now gets a one-file `ts.Program` (no lib, no resolution) and every identifier
 * operand is resolved through `checker.getSymbolAtLocation` to its own declaration: a
 * variable follows its initializer (any number of hops), a destructured binding reads the
 * property it was taken from, a parameter is known only by its name. Operands are unwrapped
 * through parens, `!`, `as`, `satisfies`, `<T>`, unary `+` and a call to the global
 * `Number` (recognised as global because it resolves to NO declaration in the file — a
 * local `Number` is not unwrapped). `a + -b` is a subtraction.
 *
 * Why not `apps/web/lib/test/source-ast.ts`: core is the package every app depends on and
 * builds from its own `src` only (`rootDir: src`), so a core test importing a web test
 * helper inverts the dependency and couples core's suite to the web workspace's layout. It
 * would not have been enough anyway — its `followAlias` follows only a plain
 * `const x = …`, not a renamed destructuring. The resolver here is the same technique
 * (one-file Program, binder symbols), sized to one question.
 *
 * Every file must PARSE: a syntax error throws rather than scanning a best-effort tree.
 *
 * Core itself is exempt — it is where the right answer is allowed to be computed — and
 * specific functions elsewhere are exempt only with a stated reason and an exact count.
 */

const ROOT = join(process.cwd(), "..", "..");

/** Workspace source we are responsible for. `dist` and generated code excluded. */
const SCANNED = [
  join(ROOT, "apps", "api", "src"),
  join(ROOT, "apps", "web", "lib"),
  join(ROOT, "apps", "web", "app"),
  join(ROOT, "apps", "web", "components"),
  join(ROOT, "apps", "mobile", "src"),
];

function sourceFiles(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === "dist" || entry.name.startsWith("."))
      continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) sourceFiles(full, out);
    else if (/\.(ts|tsx|mjs)$/.test(entry.name) && !/\.test\.(ts|tsx)$/.test(entry.name))
      out.push(full);
  }
  return out;
}

/** What a property read (dot OR bracket notation) refers to, if it's one of the two we care about. */
type Field = "total" | "paid";

/** The two FIELD names. Property keys are the data model's spelling, not a local's. */
function fieldOfName(name: string): Field | null {
  if (name === "totalCents") return "total";
  if (name === "paidCents") return "paid";
  return null;
}

/** The field a property-access-shaped node reads, covering `.totalCents` and `["totalCents"]`. */
function fieldOfPropertyRead(node: ts.Node): Field | null {
  if (ts.isPropertyAccessExpression(node)) return fieldOfName(node.name.text);
  if (ts.isElementAccessExpression(node) && ts.isStringLiteralLike(node.argumentExpression)) {
    return fieldOfName(node.argumentExpression.text);
  }
  return null;
}

interface Offenders {
  subtractLines: number[];
  compareLines: number[];
  byFunction: Map<string, FunctionOffenders>;
}

interface FunctionOffenders {
  subtract: number;
  compare: number;
}

/** Parse one file, throwing on a syntax error, and bind it in a one-file Program. */
function parseAndBind(sourceText: string, fileName: string): { sf: ts.SourceFile; checker: ts.TypeChecker } {
  const ext = /\.tsx$/.test(fileName) ? ".tsx" : /\.mjs$/.test(fileName) ? ".mjs" : ".ts";
  const kind = ext === ".tsx" ? ts.ScriptKind.TSX : ext === ".mjs" ? ts.ScriptKind.JS : ts.ScriptKind.TS;
  const rootName = `/guard${ext}`;
  const sf = ts.createSourceFile(rootName, sourceText, ts.ScriptTarget.Latest, true, kind);
  const diagnostics = (sf as unknown as { parseDiagnostics?: ts.Diagnostic[] }).parseDiagnostics ?? [];
  if (diagnostics.length > 0) {
    const first = diagnostics[0]!;
    const at = sf.getLineAndCharacterOfPosition(first.start ?? 0);
    throw new Error(
      `retention guard: ${fileName}:${at.line + 1} does not parse: ${ts.flattenDiagnosticMessageText(first.messageText, "\n")}`,
    );
  }
  const host: ts.CompilerHost = {
    getSourceFile: (name) => (name === rootName ? sf : undefined),
    writeFile: () => undefined,
    getDefaultLibFileName: () => "/lib.d.ts",
    useCaseSensitiveFileNames: () => true,
    getCanonicalFileName: (f) => f,
    getCurrentDirectory: () => "/",
    getNewLine: () => "\n",
    fileExists: (f) => f === rootName,
    readFile: () => undefined,
  };
  const program = ts.createProgram([rootName], { noLib: true, noResolve: true, allowJs: true, types: [] }, host);
  return { sf, checker: program.getTypeChecker() };
}

/**
 * Walks one file's AST and reports every subtraction and comparison between a
 * `totalCents` read and a `paidCents` read, however each operand is spelled.
 */
function findOffenders(sourceText: string, fileName: string): Offenders {
  const { sf, checker } = parseAndBind(sourceText, fileName);

  /** Strip wrappers that do not change the value. Unary MINUS is not one of them. */
  function unwrapValue(expr: ts.Expression): ts.Expression {
    let e = expr;
    for (;;) {
      if (
        ts.isParenthesizedExpression(e) ||
        ts.isAsExpression(e) ||
        ts.isSatisfiesExpression(e) ||
        ts.isNonNullExpression(e) ||
        ts.isTypeAssertionExpression(e)
      ) {
        e = e.expression;
      } else if (ts.isPrefixUnaryExpression(e) && e.operator === ts.SyntaxKind.PlusToken) {
        e = e.operand;
      } else if (
        ts.isCallExpression(e) &&
        e.arguments.length === 1 &&
        ts.isIdentifier(e.expression) &&
        e.expression.text === "Number" &&
        checker.getSymbolAtLocation(e.expression) === undefined // the global, not a local
      ) {
        e = e.arguments[0]!;
      } else {
        return e;
      }
    }
  }

  /** What a binding's declaration says it holds. */
  function fieldOfDeclaration(d: ts.Declaration, seen: Set<ts.Node>): Field | null {
    if (ts.isVariableDeclaration(d) && ts.isIdentifier(d.name)) {
      return (d.initializer && fieldOf(d.initializer, seen)) || fieldOfName(d.name.text);
    }
    if (ts.isBindingElement(d)) {
      // `{ totalCents: t }` reads the PROPERTY `totalCents`, whatever the local is called.
      const key = d.propertyName ?? d.name;
      if (ts.isIdentifier(key) || ts.isStringLiteralLike(key)) {
        const f = fieldOfName(key.text);
        if (f) return f;
      }
      return ts.isIdentifier(d.name) ? fieldOfName(d.name.text) : null;
    }
    // A parameter's value is unknowable here; its name is the only signal there is.
    if (ts.isParameter(d) && ts.isIdentifier(d.name)) return fieldOfName(d.name.text);
    return null;
  }

  function fieldOf(expr: ts.Expression, seen: Set<ts.Node> = new Set()): Field | null {
    const e = unwrapValue(expr);
    if (seen.has(e)) return null;
    seen.add(e);
    const direct = fieldOfPropertyRead(e);
    if (direct) return direct;
    if (!ts.isIdentifier(e)) return null;
    const sym = checker.getSymbolAtLocation(e);
    // Undeclared in this file (a probe snippet, or a global): the name is all there is.
    if (!sym) return fieldOfName(e.text);
    const decls = sym.declarations ?? [];
    if (decls.length !== 1) return fieldOfName(e.text);
    return fieldOfDeclaration(decls[0]!, seen);
  }

  /** `-x` where x resolves to a field. */
  function negatedField(expr: ts.Expression): Field | null {
    let e = expr;
    while (ts.isParenthesizedExpression(e) || ts.isAsExpression(e) || ts.isNonNullExpression(e) || ts.isSatisfiesExpression(e)) {
      e = e.expression;
    }
    return ts.isPrefixUnaryExpression(e) && e.operator === ts.SyntaxKind.MinusToken ? fieldOf(e.operand) : null;
  }

  const subtractLines: number[] = [];
  const compareLines: number[] = [];
  const byFunction = new Map<string, FunctionOffenders>();
  const COMPARE_OPS = new Set([
    ts.SyntaxKind.GreaterThanToken,
    ts.SyntaxKind.GreaterThanEqualsToken,
    ts.SyntaxKind.LessThanToken,
    ts.SyntaxKind.LessThanEqualsToken,
  ]);

  function record(node: ts.Node, kind: keyof FunctionOffenders) {
    const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
    (kind === "subtract" ? subtractLines : compareLines).push(line);
    const key = `${fileName}#${enclosingFunctionName(sf, node)}`;
    const cur = byFunction.get(key) ?? { subtract: 0, compare: 0 };
    cur[kind] += 1;
    byFunction.set(key, cur);
  }

  const pair = (a: Field | null, b: Field | null) => !!a && !!b && a !== b;

  function visit(node: ts.Node) {
    if (ts.isBinaryExpression(node)) {
      const op = node.operatorToken.kind;
      if (op === ts.SyntaxKind.MinusToken || COMPARE_OPS.has(op)) {
        if (pair(fieldOf(node.left), fieldOf(node.right))) {
          record(node, op === ts.SyntaxKind.MinusToken ? "subtract" : "compare");
        }
      } else if (op === ts.SyntaxKind.PlusToken) {
        if (
          pair(negatedField(node.left), fieldOf(node.right)) ||
          pair(fieldOf(node.left), negatedField(node.right))
        ) {
          record(node, "subtract");
        }
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(sf);

  return { subtractLines, compareLines, byFunction };
}

/** The named function, method, or `const X = () =>`/`function X()` a node sits
 * in. Falls back to `<module>` for top-level code, matching the pattern
 * `apps/web/lib/input-bounds-usage.test.ts` uses for the same purpose. */
function enclosingFunctionName(sf: ts.SourceFile, node: ts.Node): string {
  for (let n: ts.Node | undefined = node.parent; n; n = n.parent) {
    if ((ts.isFunctionDeclaration(n) || ts.isMethodDeclaration(n)) && n.name) {
      return ts.isIdentifier(n.name) ? n.name.text : n.name.getText(sf);
    }
    if (
      (ts.isArrowFunction(n) || ts.isFunctionExpression(n)) &&
      ts.isVariableDeclaration(n.parent) &&
      ts.isIdentifier(n.parent.name)
    ) {
      return n.parent.name.text;
    }
  }
  return "<module>";
}

/**
 * Functions allowed to do it anyway, each with EXACT counts and the reason.
 *
 * Keyed by `file#function`, with an exact `{ subtract, compare }` count — the
 * same design `apps/web/lib/input-bounds-usage.test.ts` uses for S18. A new
 * offender inside an already-exempt function changes its count and fails; so
 * does removing the legitimate one.
 */
const ALLOWED: { key: string; subtract: number; compare: number; reason: string }[] = [
  {
    key: "apps/api/src/exports/exports.service.ts#invoicesIssued",
    subtract: 1,
    compare: 0,
    reason:
      "The accountant's ACCRUAL file. Retention has been billed and is receivable, " +
      "just not yet payable — stated in a comment there, with the held amount in its " +
      "own column beside it. The cash-basis view is a different file.",
  },
];

const files = sourceFiles(SCANNED[0]!)
  .concat(...SCANNED.slice(1).map((d) => sourceFiles(d)))
  .map((file) => {
    const rel = file.slice(ROOT.length + 1).split(sep).join("/");
    return { file: rel, offenders: findOffenders(readFileSync(file, "utf8"), rel) };
  });

const allowedByKey = new Map(ALLOWED.map((a) => [a.key, a]));

/** All `file#function` keys with a non-zero count, across every scanned file. */
function allOffenderKeys(): Map<string, FunctionOffenders> {
  const merged = new Map<string, FunctionOffenders>();
  for (const f of files) {
    for (const [key, counts] of f.offenders.byFunction) merged.set(key, counts);
  }
  return merged;
}

describe("invoice settlement is decided in core, nowhere else", () => {
  it("finds source across every workspace, so a move cannot empty this guard", () => {
    expect(files.length).toBeGreaterThan(150);
    // Each scanned root must contribute, or a path typo silently drops a whole app.
    for (const prefix of ["apps/api/src", "apps/web/lib", "apps/web/app", "apps/mobile/src"]) {
      expect(files.some((f) => f.file.startsWith(prefix)), `no files under ${prefix}`).toBe(true);
    }
  });

  it("no function subtracts paidCents from totalCents, except an exempt one at its exact count", () => {
    const offenders = [...allOffenderKeys()]
      .filter(([key, counts]) => counts.subtract !== (allowedByKey.get(key)?.subtract ?? 0))
      .map(([key, counts]) => `${key}: ${counts.subtract} subtract (allowed ${allowedByKey.get(key)?.subtract ?? 0})`);
    // Use `settlementOf` (or `invoiceSettlement`) from core. What a client-facing
    // document should ask for is `outstandingCents`, with `heldCents` shown beside
    // it rather than silently dropped.
    expect(offenders).toEqual([]);
  });

  it("no function decides settled or overdue by comparing paid against the total, except an exempt one at its exact count", () => {
    // `paid >= total` is right only when nothing is held, which the comparison
    // cannot know. This is the shape that kept a retention invoice PARTIAL for
    // ever, which then let the sweep flip it to OVERDUE.
    const offenders = [...allOffenderKeys()]
      .filter(([key, counts]) => counts.compare !== (allowedByKey.get(key)?.compare ?? 0))
      .map(([key, counts]) => `${key}: ${counts.compare} compare (allowed ${allowedByKey.get(key)?.compare ?? 0})`);
    expect(offenders).toEqual([]);
  });

  it("does not let the allow-list rot: every entry's function exists and its counts match exactly", () => {
    const merged = allOffenderKeys();
    for (const a of ALLOWED) {
      const [file] = a.key.split("#");
      expect(files.some((f) => f.file === file), `${a.key}: file not scanned`).toBe(true);
      const counts = merged.get(a.key);
      expect(counts, `${a.key}: function no longer offends at all — exemption covers nothing`).toBeDefined();
      expect(counts?.subtract, `${a.key}: subtract count drifted from the exemption`).toBe(a.subtract);
      expect(counts?.compare, `${a.key}: compare count drifted from the exemption`).toBe(a.compare);
    }
  });

  it("the parser finds the real shapes, so a passing run means something", () => {
    // Without this, a bug in the walk would make every assertion above vacuously green.
    const subtracts = (src: string) => findOffenders(src, "probe.ts").subtractLines.length > 0;
    const compares = (src: string) => findOffenders(src, "probe.ts").compareLines.length > 0;

    // The three shapes a review used to defeat the previous, regex-based version.
    expect(subtracts("const b = totals.totalCents - invoice.paidCents;")).toBe(true);
    expect(subtracts('const b = inv["totalCents"] - inv.paidCents;')).toBe(true); // bracket notation
    expect(
      subtracts("const t = inv.totalCents; const pd = inv.paidCents; const b = t - pd;"),
    ).toBe(true); // local-variable indirection

    // Other spellings and operand orders.
    expect(subtracts("x.paidCents - x.totalCents")).toBe(true);
    expect(subtracts("i.totalCents - (i.paidCents)")).toBe(true);
    expect(compares("if (paidCents >= invoice.totalCents) {}")).toBe(true);
    expect(compares("inv.totalCents > inv.paidCents")).toBe(true);
    expect(compares('inv["totalCents"] <= inv.paidCents')).toBe(true); // bracket notation, comparison

    // And it does not fire on legitimate shapes.
    expect(subtracts("settlementOf(invoice).outstandingCents")).toBe(false);
    expect(subtracts("totalCents - discountCents")).toBe(false);
    expect(compares("outstandingCents > 0")).toBe(false);
    // A local alias of something ELSE must not be mistaken for the tagged fields.
    expect(subtracts("const t = inv.taxCents; const pd = inv.paidCents; const b = t - pd;")).toBe(
      false,
    );
  });

  describe("generation-3 bypasses, each executed against the name-keyed version first", () => {
    const counts = (src: string, fn = "f") => findOffenders(src, "probe.ts").byFunction.get(`probe.ts#${fn}`);

    it("aliases resolve per symbol: a same-named local in a LATER function does not overwrite this one", () => {
      // Name-keyed map: `t` ended up "total" (the last write), so g's real `q - t` was missed.
      const src =
        "function g(b) { const t = b.paidCents; const q = b.totalCents; return q - t; }\n" +
        "function f(a) { const t = a.totalCents; return t; }";
      expect(counts(src, "g")).toEqual({ subtract: 1, compare: 0 });
    });

    it("aliases resolve per symbol: a parameter that shares an alias's name is not that alias", () => {
      // Name-keyed map reported `h` — a false alarm on a parameter nothing tagged.
      const src =
        "function f(a) { const t = a.totalCents; return t; }\n" +
        "function h(inv, t) { return inv.paidCents - t; }";
      expect(counts(src, "h")).toBeUndefined();
      // And a block-scoped shadow reads its own declaration.
      expect(
        counts("function f(inv) { const t = inv.totalCents; { const t = inv.taxCents; return t - inv.paidCents; } }"),
      ).toBeUndefined();
    });

    it.each([
      ["non-null", "function f(inv) { return inv.totalCents! - inv.paidCents; }"],
      ["as", "function f(inv) { return (inv.totalCents as number) - inv.paidCents; }"],
      ["satisfies", "function f(inv) { return (inv.totalCents satisfies number) - inv.paidCents; }"],
      ["Number()", "function f(inv) { return Number(inv.totalCents) - inv.paidCents; }"],
      ["unary plus", "function f(inv) { return +inv.totalCents - +inv.paidCents; }"],
      ["nested wrappers", "function f(inv) { return Number((inv.totalCents as number)!) - (+inv.paidCents); }"],
      ["negated plus", "function f(inv) { return -inv.paidCents + inv.totalCents; }"],
      ["plus negated", "function f(inv) { return inv.totalCents + -(inv.paidCents); }"],
      ["renamed destructuring", "function f(inv) { const { totalCents: t } = inv; return t - inv.paidCents; }"],
      ["destructuring both", "function f(inv) { const { totalCents: a, paidCents: b } = inv; return a > b; }"],
      ["two-hop alias", "function f(inv) { const a = inv.totalCents; const b = a; return b - inv.paidCents; }"],
      ["alias through a wrapper", "function f(inv) { const a = Number(inv.totalCents!); return a - inv.paidCents; }"],
    ])("catches %s", (_name, src) => {
      const c = counts(src);
      expect((c?.subtract ?? 0) + (c?.compare ?? 0)).toBe(1);
    });

    it("does not unwrap a LOCAL function that happens to be called Number", () => {
      expect(
        counts("function f(inv) { const Number = (x) => 0; return Number(inv.totalCents) - inv.paidCents; }"),
      ).toBeUndefined();
    });

    it("refuses to scan a file that does not parse", () => {
      expect(() => findOffenders("function f( { return a.totalCents - a.paidCents", "probe.ts")).toThrow(/does not parse/);
    });
  });

  it("strips comments and does not fire on prose that merely mentions the fields", () => {
    // Real parsing means comments never need separate stripping: they parse as
    // trivia, not expressions.
    const src = 'const u = "https://x.test"; const b = a.totalCents - a.paidCents;';
    expect(findOffenders(src, "probe.ts").subtractLines.length).toBeGreaterThan(0);
    expect(
      findOffenders("// a.totalCents - a.paidCents\nconst x = 1;", "probe.ts").subtractLines,
    ).toEqual([]);
    expect(
      findOffenders("/* a.totalCents - a.paidCents */\nconst x = 1;", "probe.ts").subtractLines,
    ).toEqual([]);
  });

  it("a second offender ON THE SAME LINE as an exempt one is still caught (the exact review defeat)", () => {
    // A ternary's COMPARE planted on the same line as the allowed subtraction makes
    // that function's compare count 1 against an exemption of 0 — a failure.
    const src = [
      "function invoicesIssued(i) {",
      "  const a = i.totalCents - i.paidCents; i.totalCents > i.paidCents ? 1 : 0;",
      "}",
    ].join("\n");
    const byFunction = findOffenders(src, "probe.ts").byFunction;
    const counts = byFunction.get("probe.ts#invoicesIssued");
    expect(counts).toEqual({ subtract: 1, compare: 1 });
    const allowed = { subtract: 1, compare: 0 };
    expect(counts?.compare !== allowed.compare).toBe(true);
  });

  it("an unrelated line shift inside the exempt function still passes", () => {
    const src = [
      "function invoicesIssued(i) {",
      "  const unrelated = 1 + 1;",
      "  const a = i.totalCents - i.paidCents;",
      "}",
    ].join("\n");
    const counts = findOffenders(src, "probe.ts").byFunction.get("probe.ts#invoicesIssued");
    expect(counts).toEqual({ subtract: 1, compare: 0 });
  });

  it("removing the real offender fails the rot check (the exemption then covers nothing)", () => {
    const src = "function invoicesIssued(i) { return i.totalCents; }";
    const counts = findOffenders(src, "probe.ts").byFunction.get("probe.ts#invoicesIssued");
    expect(counts).toBeUndefined();
  });
});
