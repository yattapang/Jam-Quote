/**
 * DRIFT — rules that must live ONCE, in @jamquote/core, and be spent (not restated) by
 * both apps.
 *
 * Three of the defects that motivated the integration suite were a rule copied into a
 * second place and then edited in one: the web's GCT default drifted from the API's.
 * The integration flows prove the API's copy of each rule gives the right answer; this
 * file proves there IS only one copy.
 *
 * ## Why an AST guard (rung 3 of the doctrine in .claude/agents/README.md)
 *
 * Rung 1, a type, cannot say "do not multiply these two numbers": `Cents` is an
 * unbranded `number`. Rung 2, behaviour, is what the *.integration.test.ts files beside
 * this one do — they cannot see a second implementation that is simply never reached
 * by the flows. So this reads source, through the ONE shared parser
 * `@jamquote/test-ast`, never a regex.
 *
 * ## What it checks, per rule
 *
 * 1. SPENT: the core export is CALLED — resolved through the binder to its import from
 *    "@jamquote/core" (`callsTo(..., { moduleSpecifier, exportedName })`), so a local
 *    function that merely shares the name does not count — in each app that needs the
 *    rule. Where only one app needs it (renewal is computed only by the API; the web
 *    displays `renewsAt`), the other app is not required to import it, and the table
 *    says so.
 * 2. NOT RESTATED: a SHAPE detector per rule finds the rule's arithmetic written out by
 *    hand anywhere in apps/api/src or apps/web (non-test source). Every hit must be on
 *    the allow-list, keyed `file#function` -> EXACT hit count, and every allow-list
 *    entry must still be a hit at that count — so a fixed site forces its entry out, a
 *    moved one fails loudly, and a SECOND restatement beside a known one fails instead
 *    of inheriting its exemption (see `Rule.allow`, where that bypass is recorded).
 *    Allow-list entries are FINDINGS, reported, not endorsements.
 *
 * ## Proof the parse found something
 *
 * The scan asserts a floor on files parsed from each app and on call sites found per
 * rule, so a moved directory or a renamed export fails instead of passing on nothing.
 *
 * ## What it does not prove
 *
 * - The detectors match shapes over NAMES (`quantityPerUnit`, `unitPriceCents`,
 *   `totalCents`, `paidCents`, `gctRegistered`, `defaultGctRate*`). A restatement that
 *   renames every operand first (`const q = c.quantityPerUnit; ... q * p`) is followed
 *   through never-written local aliases (`followAlias`) but not through a function
 *   parameter or a destructuring default.
 * - A compound `x *= y` where `x` is a `let` holding one operand is not followed (the
 *   self-test below pins that as a known miss).
 * - A copy of the rule in a THIRD place (apps/mobile, a PDF template outside apps/web)
 *   is not scanned.
 * - It does not look inside packages/core: core is where the rule is supposed to live.
 */
import { readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import {
  additiveChains,
  additiveTerms,
  callsTo,
  collect,
  enclosingFunctionKey,
  followAlias,
  parseFile,
  parseSource,
  staticStrings,
  unwrap,
} from "@jamquote/test-ast";

const REPO = join(__dirname, "../../../..");
const API_SRC = join(REPO, "apps/api/src");
const WEB = join(REPO, "apps/web");
const CORE = "@jamquote/core";

function sourceFiles(root: string, skip: RegExp): string[] {
  const out: string[] = [];
  const visit = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (skip.test(full.split(sep).join("/"))) continue;
      if (statSync(full).isDirectory()) visit(full);
      else if (/\.(ts|tsx)$/.test(name) && !/\.(test|spec)\.tsx?$/.test(name) && !name.endsWith(".d.ts")) out.push(full);
    }
  };
  visit(root);
  return out;
}

const SKIP = /\/(node_modules|\.next|dist|test|integration)(\/|$)/;
const apiFiles = sourceFiles(API_SRC, SKIP);
const webFiles = sourceFiles(WEB, SKIP);
const parsed = new Map<string, ts.SourceFile>([...apiFiles, ...webFiles].map((f) => [f, parseFile(f)]));
const rel = (f: string) => relative(REPO, f).split(sep).join("/");

/** Every identifier or property NAME read anywhere under `node`, through never-written aliases. */
function namesUnder(node: ts.Node, seen = new Set<ts.Node>(), skip: ReadonlySet<ts.Node> = new Set()): Set<string> {
  const names = new Set<string>();
  const visit = (n: ts.Node) => {
    if (seen.has(n) || skip.has(n)) return;
    seen.add(n);
    if (ts.isPropertyAccessExpression(n)) names.add(n.name.text);
    if (ts.isIdentifier(n)) {
      names.add(n.text);
      const init = followAlias(n);
      if (init) for (const x of namesUnder(init, seen, skip)) names.add(x);
    }
    if (ts.isElementAccessExpression(n)) {
      const k = staticStrings(n.argumentExpression);
      for (const s of k ?? []) names.add(s);
    }
    ts.forEachChild(n, visit);
  };
  visit(node);
  return names;
}

const isMul = (n: ts.Node): n is ts.BinaryExpression =>
  ts.isBinaryExpression(n) &&
  (n.operatorToken.kind === ts.SyntaxKind.AsteriskToken || n.operatorToken.kind === ts.SyntaxKind.AsteriskEqualsToken);

/** A multiplication with one operand reading `left` and the other reading `right`. */
function multiplies(root: ts.Node, left: RegExp, right: RegExp): ts.Node[] {
  return collect(root, isMul).filter((m) => {
    const l = [...namesUnder(m.left)];
    const r = [...namesUnder(m.right)];
    return (l.some((x) => left.test(x)) && r.some((x) => right.test(x))) || (l.some((x) => right.test(x)) && r.some((x) => left.test(x)));
  });
}

interface Rule {
  name: string;
  /** Core exports that ARE the rule. At least one must be called in each required app. */
  exports: string[];
  requiredIn: ("api" | "web")[];
  /** Why an app is not required to spend it. */
  notRequired?: string;
  restatements(sf: ts.SourceFile): ts.Node[];
  /**
   * Known restatements — FINDINGS, reported, not endorsements. Keyed
   * `file#function` -> the EXACT number of restatement nodes expected there.
   *
   * The COUNT is part of the key because a bare `file#function` entry exempted the
   * whole function for that rule, however many restatements it grew. Verified by
   * planting a SECOND `quantityPerUnit * unitPriceCents` inside the already-listed
   * `QuotePdf` and a second `totalCents - paidCents` column inside `invoicesIssued`:
   * on a set-keyed allow-list all 20 tests stayed green; with counts both fail,
   * naming `apps/web/lib/pdf/QuotePdf.tsx#QuotePdf x2`.
   *
   * What it still does NOT catch, executed and confirmed green: EDITING a listed
   * restatement in place, where the count does not move. `c.quantityPerUnit *
   * c.unitPriceCents` became `c.unitPriceCents * c.quantityPerUnit * 1.25` (a 25%
   * overstatement on every PDF breakdown line) and `i.totalCents - i.paidCents`
   * became `i.totalCents - i.paidCents - i.retentionCents`, and this stayed green
   * both times. Only a line-keyed allow-list or a behavioural test over these
   * surfaces would hold that; keying by line churns on every edit above it, and the
   * PDF/CSV rendering these sit in has no such test today. Stated so the next reader
   * does not mistake an allow-listed site for a watched one.
   */
  allow: Record<string, number>;
}

const RULES: Rule[] = [
  {
    name: "GCT default for a new document",
    exports: ["newDocumentGctRatePct"],
    requiredIn: ["api", "web"],
    restatements: (sf) => {
      // Names read INSIDE a call to the core function are the rule being spent, not restated.
      const spent = new Set<ts.Node>(callsTo(sf, "newDocumentGctRatePct", { moduleSpecifier: CORE, exportedName: "newDocumentGctRatePct" }));
      return [
      // registration and default rate combined by hand: `reg ? rate : 0`, `reg && rate`, `if (reg) ...rate`
      ...collect(sf, (n): n is ts.Node =>
        ts.isConditionalExpression(n) ||
        ts.isIfStatement(n) ||
        (ts.isBinaryExpression(n) &&
          [ts.SyntaxKind.AmpersandAmpersandToken, ts.SyntaxKind.BarBarToken, ts.SyntaxKind.QuestionQuestionToken].includes(n.operatorToken.kind)),
      ).filter((n) => {
        const names = namesUnder(n, new Set(), spent);
        return names.has("gctRegistered") && [...names].some((x) => /^defaultGctRate(Pct)?$/.test(x));
      }),
      // a GCT rate defaulted to a literal: `x.gctRatePct ?? 15`
      ...collect(sf, (n): n is ts.BinaryExpression =>
        ts.isBinaryExpression(n) &&
        [ts.SyntaxKind.QuestionQuestionToken, ts.SyntaxKind.BarBarToken].includes(n.operatorToken.kind),
      ).filter((n) => {
        const right = unwrap(n.right);
        return ts.isNumericLiteral(right) && Number(right.text) > 0 && [...namesUnder(n.left)].some((x) => /gct/i.test(x));
      }),
      ];
    },
    allow: {},
  },
  {
    name: "job unit cost",
    exports: ["computeJobUnitCostCents"],
    requiredIn: ["api", "web"],
    restatements: (sf) => multiplies(sf, /^quantityPerUnit$/, /^(unitPriceCents|unitPrice\w*)$/),
    // FINDING F1: the DETAILED job breakdown prints each component's extension as
    // `Math.round(c.quantityPerUnit * c.unitPriceCents)` in three places instead of core's
    // `lineExtension`. Same number today (both round half-up for positive values); a
    // change to core's rounding would not reach these three.
    allow: {
      "apps/web/app/(app)/invoices/[id]/page.tsx#InvoiceDetailPage": 1,
      "apps/web/app/(app)/quotes/[id]/page.tsx#QuoteDetailPage": 1,
      "apps/web/lib/pdf/QuotePdf.tsx#QuotePdf": 1,
    },
  },
  {
    name: "document totals and line amounts",
    exports: ["computeTotals", "lineAmountCents"],
    requiredIn: ["api", "web"],
    restatements: (sf) => [
      ...multiplies(sf, /^(quantity|qty)$/, /^(unitPriceCents|unitPrice\w*)$/),
      ...multiplies(sf, /^(gctRate|gctRatePct)$/, /Cents$/),
    ],
    allow: {},
  },
  {
    name: "invoice settlement / balance",
    exports: ["settlementOf", "invoiceSettlement", "amountToRequest"],
    requiredIn: ["api", "web"],
    restatements: (sf) =>
      additiveChains(sf).filter((chain) => {
        const terms = additiveTerms(chain);
        const reads = (sign: 1 | -1, name: RegExp) =>
          terms.some((t) => t.sign === sign && [...namesUnder(t.expr)].some((x) => name.test(x)));
        return reads(1, /^totalCents$/) && reads(-1, /^paidCents$/);
      }),
    // FINDING F2 (= defect D2 in invoice-balance.integration.test.ts): the accrual
    // export writes `csvMoney(i.totalCents - i.paidCents)` itself, unclamped, so an
    // overpaid invoice exports a negative outstanding that Reports shows as 0.
    allow: { "apps/api/src/exports/exports.service.ts#invoicesIssued": 1 },
  },
  {
    name: "Jamaica date label",
    exports: ["formatJamaicaDateLabel"],
    requiredIn: ["web"],
    notRequired:
      "api: formats no human-facing dates itself — reminder text is core's reminderMessage, CSV dates are core's csvDate",
    restatements: (sf) =>
      collect(sf, ts.isPropertyAssignment).filter(
        (p) =>
          ts.isIdentifier(p.name) &&
          p.name.text === "timeZone" &&
          (staticStrings(p.initializer) ?? []).some((s) => s === "America/Jamaica"),
      ),
    // FINDING F3: `mapInvoice` builds "Invoice date ..." with its own
    // `toLocaleDateString("en-JM", { ..., timeZone: "America/Jamaica" })` instead of
    // `formatJamaicaDateLabel(iso, "Invoice date ", { year: true })` — the same options
    // today, so the same text; a change to core's label would not reach it.
    allow: { "apps/web/lib/api-client.ts#mapInvoice": 1 },
  },
  {
    name: "subscription renewal (term end)",
    exports: ["nextTermEnd"],
    requiredIn: ["api"],
    notRequired: "web: displays the API's renewsAt and never computes a term",
    restatements: (sf) => [
      ...collect(sf, ts.isCallExpression).filter((c) => {
        const callee = unwrap(c.expression);
        return ts.isPropertyAccessExpression(callee) && /^set(UTC)?(Month|FullYear)$/.test(callee.name.text);
      }),
      // Date.UTC(y, m + n, ...) / new Date(y, m + n, ...) with the month read off a date
      ...collect(sf, (n): n is ts.CallExpression | ts.NewExpression => ts.isCallExpression(n) || ts.isNewExpression(n)).filter((c) => {
        const callee = unwrap(c.expression);
        const isDateUtc = ts.isPropertyAccessExpression(callee) && callee.name.text === "UTC" && ts.isIdentifier(callee.expression) && callee.expression.text === "Date";
        const isNewDate = ts.isNewExpression(c) && ts.isIdentifier(callee) && callee.text === "Date";
        const month = c.arguments?.[1];
        if (!(isDateUtc || isNewDate) || !month || (c.arguments?.length ?? 0) < 2) return false;
        const terms = additiveTerms(month);
        return terms.length > 1 && [...namesUnder(month)].some((x) => /^get(UTC)?Month$/.test(x));
      }),
    ],
    allow: {},
  },
];

describe("core rules are spent, not restated, by apps/api and apps/web", () => {
  it("parsed both apps", () => {
    expect(apiFiles.length).toBeGreaterThan(80);
    expect(webFiles.length).toBeGreaterThan(80);
  });

  for (const rule of RULES) {
    describe(rule.name, () => {
      it(`is called from core in: ${rule.requiredIn.join(" + ")}${rule.notRequired ? ` (not required — ${rule.notRequired})` : ""}`, () => {
        const sitesIn = (files: string[]) =>
          files.flatMap((f) =>
            rule.exports.flatMap((name) => callsTo(parsed.get(f)!, name, { moduleSpecifier: CORE, exportedName: name }).map(() => rel(f))),
          );
        if (rule.requiredIn.includes("api")) expect(sitesIn(apiFiles).length, "api call sites").toBeGreaterThan(0);
        if (rule.requiredIn.includes("web")) expect(sitesIn(webFiles).length, "web call sites").toBeGreaterThan(0);
      });

      it("is not restated by hand outside core (allow-list = reported findings)", () => {
        // Counted, not a set: an allow-listed FUNCTION would otherwise be exempt for
        // this rule however many restatements it grew. See `Rule.allow`.
        const hits = new Map<string, number>();
        for (const [file, sf] of parsed) {
          for (const node of rule.restatements(sf)) {
            const key = `${rel(file)}#${enclosingFunctionKey(node)}`;
            hits.set(key, (hits.get(key) ?? 0) + 1);
          }
        }
        const show = (k: string, n: number) => `${k} x${n}`;
        expect(
          [...hits].filter(([k, n]) => rule.allow[k] !== n).map(([k, n]) => show(k, n)).sort(),
          "restatements that are not on the allow-list at exactly this count",
        ).toEqual([]);
        expect(
          Object.entries(rule.allow).filter(([k, n]) => (hits.get(k) ?? 0) !== n).map(([k, n]) => show(k, n)).sort(),
          "stale or miscounted allow-list entries",
        ).toEqual([]);
      });
    });
  }
});

/**
 * The detectors, run against spellings of each defect written for the purpose — every
 * spelling must be caught and every legitimate use must not. A detector only ever seen
 * to pass over the real tree has not been seen to work (doctrine rule 5).
 */
describe("the restatement detectors catch the spellings they claim to", () => {
  const IMPORTS = `import { newDocumentGctRatePct, computeJobUnitCostCents, settlementOf } from "@jamquote/core";
`;
  const SPELLINGS: Record<string, { caught: string[]; clean: string[]; missed?: string[] }> = {
    "GCT default for a new document": {
      caught: [
        "const r = b.gctRegistered ? b.defaultGctRate : 0;",
        "let r = 0; if (biz.gctRegistered) { r = Number(biz.defaultGctRatePct); }",
        "const r = (b.gctRegistered && b.defaultGctRate) || 0;",
        "const r = input.gctRatePct ?? 15;",
        "const reg = b.gctRegistered; const rate = b.defaultGctRate; const r = reg ? rate : 0;",
      ],
      clean: [
        "const r = input.gctRatePct ?? newDocumentGctRatePct({ gctRegistered: b.gctRegistered, defaultGctRatePct: b.defaultGctRate });",
        "const warn = gctRatePct > 0 && !gctRegistered;",
        "const r = input.gctRatePct ?? 0;",
      ],
    },
    "job unit cost": {
      caught: [
        "const x = c.quantityPerUnit * c.unitPriceCents;",
        "const x = Math.round(c.unitPriceCents * c.quantityPerUnit);",
        "const q = c.quantityPerUnit; const x = q * c.unitPriceCents;",
      ],
      // Known limit, asserted so it cannot be forgotten: a compound `*=` on a `let` is not
      // followed back to its initializer (the `let` is written, so it is not an alias).
      missed: ["let s = c.quantityPerUnit; s *= c.unitPriceCents;"],
      clean: ["const x = computeJobUnitCostCents({ components: cs, markupPct: 10 });", "const x = c.quantityPerUnit * 2;"],
    },
    "document totals and line amounts": {
      caught: ["const a = l.quantity * l.unitPriceCents;", "const g = Math.round(q.subtotalCents * q.gctRatePct / 100);", "const g = (subtotalCents * gctRate) / 100;"],
      clean: ["const a = l.quantity * 2;", "const p = l.unitPriceCents / 100;"],
    },
    "invoice settlement / balance": {
      caught: [
        "const o = inv.totalCents - inv.paidCents;",
        "const o = Math.max(0, inv.totalCents - inv.paidCents);",
        "const o = -inv.paidCents + inv.totalCents;",
        "let b = inv.totalCents; b -= inv.paidCents;",
        "const o = inv.totalCents - (inv.paidCents + inv.retentionCents);",
      ],
      clean: ["const o = settlementOf(inv).outstandingCents;", "const s = inv.totalCents + inv.paidCents;"],
    },
    "Jamaica date label": {
      caught: [
        'const f = d.toLocaleDateString("en-JM", { timeZone: "America/Jamaica" });',
        'const TZ = "America/Jamaica"; const f = new Intl.DateTimeFormat("en", { timeZone: TZ });',
      ],
      clean: ['const f = d.toLocaleDateString("en-JM", { timeZone: "UTC" });'],
    },
    "subscription renewal (term end)": {
      caught: [
        "d.setUTCMonth(d.getUTCMonth() + 1);",
        "d.setFullYear(d.getFullYear() + 1);",
        "const e = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 12, d.getUTCDate()));",
        "const e = new Date(y, now.getMonth() + 1, 1);",
      ],
      clean: ["const e = new Date(Date.UTC(y, m, 1));", "const e = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));"],
    },
  };

  it("covers every rule", () => {
    expect(Object.keys(SPELLINGS).sort()).toEqual(RULES.map((r) => r.name).sort());
  });

  for (const rule of RULES) {
    const cases = SPELLINGS[rule.name]!;
    it(`${rule.name}: ${cases.caught.length} spellings caught, ${cases.clean.length} clean uses not`, () => {
      const hits = (src: string) => rule.restatements(parseSource("probe.ts", IMPORTS + src)).length;
      expect(cases.caught.filter((src) => hits(src) === 0), "missed").toEqual([]);
      expect(cases.clean.filter((src) => hits(src) > 0), "false alarm").toEqual([]);
      expect((cases.missed ?? []).filter((src) => hits(src) > 0), "a documented limit now caught — move it to caught").toEqual([]);
    });
  }
});
