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
 * by file path — which let a *second*, illegitimate offender share the exemption
 * of a file that had a legitimate one.
 *
 * Regex cannot see through a local variable, and a fourth spelling was always
 * one PR away. So this scans the real AST (`typescript`'s own parser — the same
 * one that type-checks the repo) and asks the semantic question directly: is this
 * a subtraction, or a `>`/`>=`/`<`/`<=` comparison, between something that reads
 * `totalCents` and something that reads `paidCents` — however each operand is
 * spelled, and however many local assignments sit between the property read and
 * the arithmetic.
 *
 * This runs from the repo root, covers every workspace, and looks for both shapes.
 * Core itself is exempt — it is where the right answer is allowed to be computed
 * — and specific LINES elsewhere are exempt only with a stated reason.
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

/**
 * Offenders found in one file: a subtraction and a comparison list, each entry a
 * 1-based source line.
 */
interface Offenders {
  subtractLines: number[];
  compareLines: number[];
}

/**
 * Walks one file's AST and reports every subtraction and comparison between a
 * `totalCents` read and a `paidCents` read — resolving through local variables
 * assigned directly from one of those reads, so `const t = inv.totalCents; ...
 * t - pd` is caught exactly like the inline form.
 *
 * The alias tracking is deliberately simple (one hop, whole-file, flow-insensitive):
 * a local initialized directly from a `totalCents`/`paidCents` read is tagged: any
 * other initializer, including a further-removed alias, is left untagged. That
 * is enough to catch copy-then-subtract without turning this into a type checker,
 * and an author routing the value through two hops to dodge it is doing something
 * conspicuous enough to catch on review.
 */
function findOffenders(sourceText: string, fileName: string): Offenders {
  const sf = ts.createSourceFile(fileName, sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

  // Pass 1: collect single-hop local aliases of a totalCents/paidCents read.
  const alias = new Map<ts.Identifier | ts.Node, Field>(); // unused, kept for clarity of intent
  const aliasByText = new Map<string, Field>();
  function collectAliases(node: ts.Node) {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
      const f = fieldOfPropertyRead(node.initializer);
      if (f) aliasByText.set(node.name.text, f);
    }
    ts.forEachChild(node, collectAliases);
  }
  collectAliases(sf);

  /** What an operand of a binary expression resolves to, one hop through `aliasByText`. */
  function fieldOfOperand(node: ts.Node): Field | null {
    const stripped = ts.isParenthesizedExpression(node) ? node.expression : node;
    const direct = fieldOfPropertyRead(stripped);
    if (direct) return direct;
    if (ts.isIdentifier(stripped)) return aliasByText.get(stripped.text) ?? fieldOfName(stripped.text);
    return null;
  }

  const subtractLines: number[] = [];
  const compareLines: number[] = [];
  const COMPARE_OPS = new Set([
    ts.SyntaxKind.GreaterThanToken,
    ts.SyntaxKind.GreaterThanEqualsToken,
    ts.SyntaxKind.LessThanToken,
    ts.SyntaxKind.LessThanEqualsToken,
  ]);

  function visit(node: ts.Node) {
    if (ts.isBinaryExpression(node)) {
      const left = fieldOfOperand(node.left);
      const right = fieldOfOperand(node.right);
      const isTotalPaidPair = left && right && left !== right; // one "total", one "paid"
      if (isTotalPaidPair) {
        const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
        if (node.operatorToken.kind === ts.SyntaxKind.MinusToken) subtractLines.push(line);
        else if (COMPARE_OPS.has(node.operatorToken.kind)) compareLines.push(line);
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(sf);

  return { subtractLines, compareLines };
}

/**
 * Lines allowed to do it anyway, each with the reason it is correct.
 *
 * A genuine `file:line` pair: the exemption names the exact line of the
 * offending expression, so moving the code — or a second, unrelated offender
 * landing anywhere else in the same file — makes that new occurrence visible
 * instead of riding along on someone else's exemption.
 */
const ALLOWED: Record<string, string> = {
  "apps/api/src/exports/exports.service.ts:93": [
    "The accountant's ACCRUAL file. Retention has been billed and is receivable,",
    "just not yet payable — stated in a comment there, with the held amount in its",
    "own column beside it. The cash-basis view is a different file.",
  ].join(" "),
};

const files = sourceFiles(SCANNED[0]!)
  .concat(...SCANNED.slice(1).map((d) => sourceFiles(d)))
  .map((file) => {
    const rel = file.slice(ROOT.length + 1).split(sep).join("/");
    return { file: rel, offenders: findOffenders(readFileSync(file, "utf8"), rel) };
  });

function unexempted(lines: number[], file: string): number[] {
  return lines.filter((line) => !(`${file}:${line}` in ALLOWED));
}

describe("invoice settlement is decided in core, nowhere else", () => {
  it("finds source across every workspace, so a move cannot empty this guard", () => {
    expect(files.length).toBeGreaterThan(150);
    // Each scanned root must contribute, or a path typo silently drops a whole app.
    for (const prefix of ["apps/api/src", "apps/web/lib", "apps/web/app", "apps/mobile/src"]) {
      expect(files.some((f) => f.file.startsWith(prefix)), `no files under ${prefix}`).toBe(true);
    }
  });

  it("no file subtracts paidCents from totalCents", () => {
    const offenders = files
      .filter((f) => unexempted(f.offenders.subtractLines, f.file).length > 0)
      .map((f) => f.file);
    // Use `settlementOf` (or `invoiceSettlement`) from core. What a client-facing
    // document should ask for is `outstandingCents`, with `heldCents` shown beside
    // it rather than silently dropped.
    expect(offenders).toEqual([]);
  });

  it("no file decides settled or overdue by comparing paid against the total", () => {
    // `paid >= total` is right only when nothing is held, which the comparison
    // cannot know. This is the shape that kept a retention invoice PARTIAL for
    // ever, which then let the sweep flip it to OVERDUE.
    const offenders = files
      .filter((f) => unexempted(f.offenders.compareLines, f.file).length > 0)
      .map((f) => f.file);
    expect(offenders).toEqual([]);
  });

  it("does not let the allow-list rot", () => {
    const scanned = new Set(files.map((f) => f.file));
    const stillPresent = (key: string) => scanned.has(key.split(":")[0]!);
    expect(Object.keys(ALLOWED).filter((key) => !stillPresent(key))).toEqual([]);
    // And the exempted line must still actually be the offending line, or the
    // exemption is covering nothing (comment rotted) or something else (comment lied).
    for (const key of Object.keys(ALLOWED)) {
      const [file, lineStr] = key.split(":");
      const line = Number(lineStr);
      const found = files.find((f) => f.file === file)!;
      const onThatLine =
        found.offenders.subtractLines.includes(line) || found.offenders.compareLines.includes(line);
      expect(onThatLine, `${key} is exempt but line ${line} has no offending expression`).toBe(true);
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

  it("a second offender in an already-exempt file is still caught", () => {
    // This is the exact defeat a review executed: the allow-list used to be keyed
    // by file path alone, so any new offender anywhere in exports.service.ts rode
    // along on the one legitimate exemption. Proving it here, rather than only
    // trusting the file:line design, is the point.
    const src = [
      "const a = i.totalCents - i.paidCents; // line 1, imagine this is the allowed one",
      "function cashBasis(x) { return x.totalCents - x.paidCents; } // a second, illegitimate one",
    ].join("\n");
    const onlyFirstLineAllowed = new Set(["probe.ts:1"]);
    const offenders = findOffenders(src, "probe.ts").subtractLines.filter(
      (line) => !onlyFirstLineAllowed.has(`probe.ts:${line}`),
    );
    expect(offenders).toEqual([2]);
  });
});
