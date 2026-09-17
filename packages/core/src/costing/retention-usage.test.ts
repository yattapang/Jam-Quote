import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, sep } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import {
  additiveChains,
  additiveTerms,
  collect,
  enclosingFunctionKey,
  parseSource,
  resolveRead,
} from "@jamquote/test-ast";

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
 * A file-wide map keyed by a local's NAME was defeated six ways (a same-named local in a
 * later function, `!`, `as`, `Number()`, `-paid + total`, a renamed destructuring). Names
 * are resolved through the binder.
 *
 * ## Why the resolver is `@jamquote/test-ast` (generation 4)
 *
 * Generation 3 built its own binder-based resolver here, because core cannot import a web
 * test helper: a second parser, which rule 2 of `.claude/agents/README.md` forbids. An
 * independent review then confirmed three spellings it missed:
 *
 * - `(a?.totalCents ?? 0) - (a?.paidCents ?? 0)`: `??` with a static fallback was opaque;
 * - `xs.reduce((s, a) => s + a.totalCents - a.paidCents, 0)`: parses as
 *   `(s + total) - paid`, and no single binary node holds the pair;
 * - `const totalOf = (a) => a.totalCents; totalOf(a) - a.paidCents`: a one-level accessor.
 *
 * It also keyed a class-field arrow as `<module>`, so one could not be exempted precisely.
 * The parser is now the private workspace package `@jamquote/test-ast`, shared with every
 * web guard. `resolveRead` follows aliases, destructuring, `??`, `Number`, unary `+` and
 * one-level accessors; `additiveChains`/`additiveTerms` make a subtraction "a total and a
 * paid of OPPOSITE sign anywhere in one additive chain"; `enclosingFunctionKey` keys a
 * class-field arrow `Class#field`. Each spelling is a probe below and in that package.
 *
 * ## What it does not prove
 *
 * A parameter is known only by its name; an accessor is followed one level, within the
 * file; a value crossing a module boundary, a method, or an object passed to a function
 * is not followed; a column renamed on purpose defeats it. Every file must PARSE: a syntax
 * error throws.
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

type Field = "total" | "paid";

/** The two FIELD names. Property keys are the data model's spelling, not a local's. */
function fieldOfName(name: string): Field | null {
  if (name === "totalCents") return "total";
  if (name === "paidCents") return "paid";
  return null;
}

/** What an operand reads, through the shared parser; a local's own name is the last resort. */
function fieldOf(expr: ts.Expression): Field | null {
  const { read, aliases } = resolveRead(expr);
  const direct = read.kind === "other" ? null : fieldOfName(read.name);
  if (direct) return direct;
  for (const alias of aliases) {
    const f = fieldOfName(alias);
    if (f) return f;
  }
  return null;
}

interface FunctionOffenders {
  subtract: number;
  compare: number;
}

interface Offenders {
  subtractLines: number[];
  compareLines: number[];
  byFunction: Map<string, FunctionOffenders>;
}

const COMPARE_OPS = new Set([
  ts.SyntaxKind.GreaterThanToken,
  ts.SyntaxKind.GreaterThanEqualsToken,
  ts.SyntaxKind.LessThanToken,
  ts.SyntaxKind.LessThanEqualsToken,
  // Equality reads the retention state just as much as ordering does:
  // "settled when paid equals total" (inv.paidCents === inv.totalCents) is the
  // defect this guard exists for, and === / !== / == / != all express it.
  ts.SyntaxKind.EqualsEqualsEqualsToken,
  ts.SyntaxKind.ExclamationEqualsEqualsToken,
  ts.SyntaxKind.EqualsEqualsToken,
  ts.SyntaxKind.ExclamationEqualsToken,
]);

/**
 * One subtraction per additive chain holding a `totalCents` read and a `paidCents` read
 * of opposite sign, and one comparison per `<`/`<=`/`>`/`>=` between the two.
 */
function findOffenders(sourceText: string, fileName: string): Offenders {
  const sf = parseSource(fileName, sourceText);
  const subtractLines: number[] = [];
  const compareLines: number[] = [];
  const byFunction = new Map<string, FunctionOffenders>();

  function record(node: ts.Node, kind: keyof FunctionOffenders) {
    const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
    (kind === "subtract" ? subtractLines : compareLines).push(line);
    const key = `${fileName}#${enclosingFunctionKey(node)}`;
    const cur = byFunction.get(key) ?? { subtract: 0, compare: 0 };
    cur[kind] += 1;
    byFunction.set(key, cur);
  }

  for (const chain of additiveChains(sf)) {
    const signs = { total: new Set<number>(), paid: new Set<number>() };
    for (const term of additiveTerms(chain)) {
      const f = fieldOf(term.expr);
      if (f) signs[f].add(term.sign);
    }
    if ([...signs.total].some((s) => signs.paid.has(-s))) record(chain, "subtract");
  }

  for (const node of collect(sf, ts.isBinaryExpression)) {
    if (!COMPARE_OPS.has(node.operatorToken.kind)) continue;
    const a = fieldOf(node.left);
    const b = fieldOf(node.right);
    if (a && b && a !== b) record(node, "compare");
  }

  return { subtractLines, compareLines, byFunction };
}

/**
 * Functions allowed to do it anyway, each with EXACT counts and the reason.
 *
 * Keyed by `file#function` (a class-field arrow is `file#Class#field`), with an exact
 * `{ subtract, compare }` count. A new offender inside an already-exempt function changes
 * its count and fails; so does removing the legitimate one.
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
    const subtracts = (src: string) => findOffenders(src, "probe.ts").subtractLines.length > 0;
    const compares = (src: string) => findOffenders(src, "probe.ts").compareLines.length > 0;

    expect(subtracts("const b = totals.totalCents - invoice.paidCents;")).toBe(true);
    expect(subtracts('const b = inv["totalCents"] - inv.paidCents;')).toBe(true);
    expect(subtracts("const t = inv.totalCents; const pd = inv.paidCents; const b = t - pd;")).toBe(true);

    expect(subtracts("x.paidCents - x.totalCents")).toBe(true);
    expect(subtracts("i.totalCents - (i.paidCents)")).toBe(true);
    expect(compares("if (paidCents >= invoice.totalCents) {}")).toBe(true);
    expect(compares("inv.totalCents > inv.paidCents")).toBe(true);
    expect(compares('inv["totalCents"] <= inv.paidCents')).toBe(true);

    expect(subtracts("settlementOf(invoice).outstandingCents")).toBe(false);
    expect(subtracts("totalCents - discountCents")).toBe(false);
    expect(compares("outstandingCents > 0")).toBe(false);
    expect(subtracts("const t = inv.taxCents; const pd = inv.paidCents; const b = t - pd;")).toBe(false);
    // Same sign is a sum, not a balance.
    expect(subtracts("a.totalCents + a.paidCents")).toBe(false);
  });

  describe("generation-3 bypasses, each executed against the name-keyed version first", () => {
    const counts = (src: string, fn = "f") => findOffenders(src, "probe.ts").byFunction.get(`probe.ts#${fn}`);

    it("aliases resolve per symbol: a same-named local in a LATER function does not overwrite this one", () => {
      const src =
        "function g(b) { const t = b.paidCents; const q = b.totalCents; return q - t; }\n" +
        "function f(a) { const t = a.totalCents; return t; }";
      expect(counts(src, "g")).toEqual({ subtract: 1, compare: 0 });
    });

    it("aliases resolve per symbol: a parameter that shares an alias's name is not that alias", () => {
      const src =
        "function f(a) { const t = a.totalCents; return t; }\n" +
        "function h(inv, t) { return inv.paidCents - t; }";
      expect(counts(src, "h")).toBeUndefined();
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

  describe("generation-4 bypasses, confirmed against the core-local resolver", () => {
    const counts = (src: string, fn = "f") => findOffenders(src, "probe.ts").byFunction.get(`probe.ts#${fn}`);

    it.each([
      ["?? with a static fallback and optional chaining", "function f(a) { return (a?.totalCents ?? 0) - (a?.paidCents ?? 0); }"],
      ["a left-associative chain inside reduce", "function f(xs) { return xs.reduce((s, a) => s + a.totalCents - a.paidCents, 0); }"],
      ["a one-level cross-function accessor", "const totalOf = (a) => a.totalCents;\nfunction f(a) { return totalOf(a) - a.paidCents; }"],
      ["an accessor inside a comparison", "function paidOf(a) { return a.paidCents; }\nfunction f(a) { return paidOf(a) >= a.totalCents; }"],
    ])("catches %s", (_name, src) => {
      const c = counts(src);
      expect((c?.subtract ?? 0) + (c?.compare ?? 0)).toBe(1);
    });

    it("a class-field arrow is keyed Class#field, so it can be exempted precisely", () => {
      const src = "class Reports { outstanding = (a) => a.totalCents - a.paidCents; other = (a) => a.totalCents; }";
      expect(counts(src, "Reports#outstanding")).toEqual({ subtract: 1, compare: 0 });
      expect(counts(src, "<module>")).toBeUndefined();
    });

    it("?? over a NON-static fallback is not unwrapped", () => {
      expect(counts("function f(a, b) { return (a.totalCents ?? b.x) - a.paidCents; }")).toBeUndefined();
    });
  });

  it("strips comments and does not fire on prose that merely mentions the fields", () => {
    const src = 'const u = "https://x.test"; const b = a.totalCents - a.paidCents;';
    expect(findOffenders(src, "probe.ts").subtractLines.length).toBeGreaterThan(0);
    expect(findOffenders("// a.totalCents - a.paidCents\nconst x = 1;", "probe.ts").subtractLines).toEqual([]);
    expect(findOffenders("/* a.totalCents - a.paidCents */\nconst x = 1;", "probe.ts").subtractLines).toEqual([]);
  });

  it("a second offender ON THE SAME LINE as an exempt one is still caught (the exact review defeat)", () => {
    const src = [
      "function invoicesIssued(i) {",
      "  const a = i.totalCents - i.paidCents; i.totalCents > i.paidCents ? 1 : 0;",
      "}",
    ].join("\n");
    const counts = findOffenders(src, "probe.ts").byFunction.get("probe.ts#invoicesIssued");
    expect(counts).toEqual({ subtract: 1, compare: 1 });
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
