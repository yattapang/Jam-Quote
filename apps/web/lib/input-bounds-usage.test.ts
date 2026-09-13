import { readdirSync } from "node:fs";
import { join, sep } from "node:path";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";
import { BOUNDS, type NumericBound } from "@jamquote/core";
import { analyseStatic, attributeValue, callsTo, jsxAttributes, parseFile, parseSource } from "./test/source-ast";

/**
 * A numeric input a contractor types into is bounded, and bounded from `BOUNDS`.
 *
 * ## The defect
 *
 * The server and the form disagreed field by field. `discountPct` was
 * `.min(0).max(100)` in the DTO and a bare `<Input type="number">` on screen, so
 * typing `-10` produced a save that failed — and before F28 it failed with the words
 * "Validation failed" and no field named. Same for GCT, Rate, Price, and
 * `coveragePerSellUnit`, which allowed `0` against a `.positive()` server rule.
 *
 * ## What the previous version enforced, and what this one keeps
 *
 * The regex guard it replaces held five properties. Each is kept:
 *
 * 1. No non-exempt `.tsx` under app/ and components/ writes a numeric bound by hand
 *    — kept, now over the AST, so `min={"0"}`, `{(0)}`, `{Number(0)}` and a local
 *    `const MAX = 100` are caught along with `min={0}` (the regex saw only the last).
 * 2. The scan found the form source (>40 files, QuoteBuilder, MaterialForm) — kept,
 *    plus a count of `BOUNDS`-spending attributes so the attribute scan itself is
 *    proven to find something.
 * 3. Allow-list entries still exist — kept, and tightened: an entry is now a file AND
 *    a component AND an exact count, because a file-level entry for AdminConsole
 *    silently covered the subscription payment form, whose `min={0}` sat over a
 *    `.positive()` server rule with no client validation at all.
 * 4. The matcher is shown to match — kept, as probes through the same function the
 *    scan uses.
 * 5. The coherence checks on `BOUNDS` itself — kept unchanged.
 *
 * New: the DTO half. "The DTO and the form move together" was true for 2 of 10
 * bounds; see the DTO describe below for how that is now proven.
 *
 * ## What it does not prove
 *
 * It rejects a STATIC bound not drawn from `BOUNDS`. A bound computed from data —
 * `max={cond ? 100 : undefined}` with `cond` a prop — is not static and is not
 * flagged; nor is a `BOUNDS` value re-exported under another name from another
 * module, which the parser cannot follow across files.
 */

const WEB = process.cwd();

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === ".next" || entry.name.startsWith("."))
      continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) sourceFiles(full, out);
    else if (/\.tsx$/.test(entry.name) && !/\.test\.tsx$/.test(entry.name)) out.push(full);
  }
  return out;
}

const files = sourceFiles(join(WEB, "app"))
  .concat(sourceFiles(join(WEB, "components")))
  .map((path) => ({ file: path.slice(WEB.length + 1).split(sep).join("/"), sf: parseFile(path) }));

/** The named function or `const X = () =>` a node sits in — the component, in practice. */
function enclosingName(node: ts.Node): string {
  for (let n: ts.Node | undefined = node.parent; n; n = n.parent) {
    if (ts.isFunctionDeclaration(n) && n.name) return n.name.text;
    if (
      (ts.isArrowFunction(n) || ts.isFunctionExpression(n)) &&
      ts.isVariableDeclaration(n.parent) &&
      ts.isIdentifier(n.parent.name)
    )
      return n.parent.name.text;
  }
  return "<module>";
}

/**
 * A bound is hand-typed when it is fixed by constants and none of them is `BOUNDS`.
 *
 * One rule for every spelling: `0`, `"0"`, `{"0"}`, `{(0)}`, `{Number(0)}`, `{+0}`,
 * `{1 + 99}` and a file-local `const MAX = 100` are all static with no `BOUNDS` root.
 * `{inputMin(BOUNDS.x)}` is a call to a non-conversion function, which the parser
 * classes as data — correct, since it is the approved helper over the approved source.
 */
function isHandTyped(attr: ts.JsxAttribute): boolean {
  const value = attributeValue(attr);
  if (!value) return false;
  const { static: isStatic, roots } = analyseStatic(value);
  return isStatic && !roots.has("BOUNDS");
}

function boundAttributes(sf: ts.SourceFile): ts.JsxAttribute[] {
  return [...jsxAttributes(sf, "min"), ...jsxAttributes(sf, "max")];
}

/**
 * Components allowed hand-typed bounds, with the EXACT count, each with its reason.
 *
 * Keyed by file and component so an exemption covers only what it names: the
 * subscription payment form (`TenantBilling`) lives in the same file as the pricing
 * editor and is NOT covered. An exact count means a new hand-typed bound inside an
 * exempt component fails too, rather than joining the exemption unseen.
 */
const ALLOWED: { file: string; component: string; count: number; reason: string }[] = [
  {
    file: "app/admin/AdminConsole.tsx",
    component: "AdminConsole",
    count: 13,
    reason:
      "staff pricing and rule-pack editors — platform configuration, validated in full by pricingProblem()/rulePackProblem() against admin.dto/rulepack.dto, whose bounds are not BOUNDS entries",
  },
  {
    file: "components/forms/ProjectForm.tsx",
    component: "ProjectForm",
    count: 4,
    reason:
      "retention and progress carry min/max matching BOUNDS.retentionPct/progressPct (which projects.dto now spends); converting the form is a separate edit",
  },
];

function handTypedByComponent(): Map<string, number> {
  const counts = new Map<string, number>();
  for (const { file, sf } of files) {
    for (const attr of boundAttributes(sf)) {
      if (!isHandTyped(attr)) continue;
      const key = `${file}#${enclosingName(attr)}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  return counts;
}

describe("numeric inputs spend the shared BOUNDS", () => {
  it("finds the form source and its bounds, so a move cannot empty this guard", () => {
    expect(files.length).toBeGreaterThan(40);
    expect(files.some((f) => f.file.includes("QuoteBuilder"))).toBe(true);
    expect(files.some((f) => f.file.includes("MaterialForm"))).toBe(true);
    // The attribute scan itself finds bounds: measured at 24 spending BOUNDS directly.
    const spending = files.flatMap(({ sf }) =>
      boundAttributes(sf).filter((a) => {
        const v = attributeValue(a);
        return v !== null && analyseStatic(v).roots.has("BOUNDS");
      }),
    );
    expect(spending.length).toBeGreaterThanOrEqual(20);
  });

  it("no form writes a numeric bound by hand", () => {
    const allowed = new Map(ALLOWED.map((a) => [`${a.file}#${a.component}`, a.count]));
    const offenders = [...handTypedByComponent()]
      .filter(([key, n]) => allowed.get(key) !== n)
      .map(([key, n]) => `${key}: ${n} hand-typed (allowed ${allowed.get(key) ?? 0})`);
    // Import BOUNDS from core and spend it: `min={BOUNDS.discountPct.min}`.
    expect(offenders).toEqual([]);
  });

  it("does not let the allow-list rot: every entry still has exactly its count", () => {
    const counts = handTypedByComponent();
    expect(ALLOWED.filter((a) => counts.get(`${a.file}#${a.component}`) !== a.count)).toEqual([]);
  });

  it("the rule catches every spelling that defeated the regex, and not the approved ones", () => {
    const attr = (jsx: string, prelude = "") => {
      const sf = parseSource("probe.tsx", `${prelude}\nconst x = ${jsx};\n`);
      return boundAttributes(sf)[0]!;
    };
    for (const bad of [
      "<Input min={0} />",
      "<Input max={100} />",
      '<Input min="0" />',
      '<Input min={"0"} />',
      "<Input min={(0)} />",
      "<Input min={Number(0)} />",
      "<Input min={+0} />",
      "<Input max={1 + 99} />",
    ]) {
      expect(isHandTyped(attr(bad)), bad).toBe(true);
    }
    expect(isHandTyped(attr("<Input max={MAX} />", "const MAX = 100;"))).toBe(true);

    const imp = 'import { BOUNDS, inputMin } from "@jamquote/core";';
    expect(isHandTyped(attr("<Input min={BOUNDS.discountPct.min} />", imp))).toBe(false);
    expect(isHandTyped(attr("<Input min={inputMin(BOUNDS.coveragePerSellUnit)} />", imp))).toBe(false);
  });

  it("the subscription payment form is not exempt and validates before it sends", () => {
    const admin = files.find((f) => f.file === "app/admin/AdminConsole.tsx")!;
    const billing = admin.sf.statements.find(
      (s): s is ts.FunctionDeclaration => ts.isFunctionDeclaration(s) && s.name?.text === "TenantBilling",
    );
    expect(billing, "TenantBilling moved or was renamed — re-key this check").toBeDefined();
    // The AST rung, not a render: TenantBilling is reached only through a tenant
    // drawer with a live payments load. The behaviour of the validation itself is
    // tested against the real DTO below; this proves the send path calls it.
    const send = callsTo(billing!, "recordSubscriptionPayment");
    expect(send).toHaveLength(1);
    let handler: ts.Node | undefined = send[0];
    while (handler && !(ts.isArrowFunction(handler) && ts.isJsxExpression(handler.parent))) handler = handler.parent;
    expect(handler, "recordSubscriptionPayment is no longer sent from a JSX handler").toBeDefined();
    expect(callsTo(handler!, "subscriptionPaymentProblem")).toHaveLength(1);
  });
});

// ─────────────────────────────────────────────────────────────── the DTO half

/**
 * The DTO side, proven by BEHAVIOUR rather than by scanning `.ts` source.
 *
 * Why not a parse: a DTO bound can be spelled `.min(0)`, `.gte(0)`, `.nonnegative()`,
 * a shared `const ratePct = z.number()…`, or a refine — a source scan would have to
 * know every one. Zod will simply answer what it accepts.
 *
 * Why not only compare values: a hand-typed `.min(0).max(100)` EQUALS `BOUNDS` today,
 * so an equality check passes over exactly the second copy this guard exists to
 * prevent. So each schema is loaded twice — once against the real `BOUNDS`, once with
 * `@jamquote/core` mocked to shifted bounds. A field that spends `BOUNDS` moves with
 * it; a hand-typed one stays put and fails. That is the property "the DTO and the form
 * move together or not at all", tested as stated.
 *
 * Limit: `positiveOnly` fields are bounded by `.positive()`, which does not read
 * `BOUNDS.min`, so for those only "zero refused, the input's min accepted" is checked.
 */

type AnyZod = { safeParse(v: unknown): { success: boolean }; _def: Record<string, unknown>; shape?: Record<string, AnyZod> };

/** Walk a Zod schema to one field: through optional/nullable/default/effects/arrays. */
function fieldOf(schema: AnyZod, path: string[]): AnyZod {
  let s = schema;
  const peel = () => {
    for (;;) {
      const d = s._def;
      if (d.innerType) s = d.innerType as AnyZod;
      else if (d.schema) s = d.schema as AnyZod;
      else if (d.typeName === "ZodArray") s = d.type as AnyZod;
      else return;
    }
  };
  for (const key of path) {
    peel();
    const next = (s as { shape?: Record<string, AnyZod> }).shape?.[key];
    if (!next) throw new Error(`no field ${path.join(".")}`);
    s = next;
  }
  return s;
}

type Dtos = Awaited<ReturnType<typeof loadDtos>>;
async function loadDtos() {
  const [quotes, invoices, business, projects, sync, catalogs] = await Promise.all([
    import("../../api/src/quotes/quotes.dto"),
    import("../../api/src/invoices/invoices.dto"),
    import("../../api/src/business/business.dto"),
    import("../../api/src/projects/projects.dto"),
    import("../../api/src/sync/sync.dto"),
    import("../../api/src/catalogs/catalogs.dto"),
  ]);
  return { quotes, invoices, business, projects, sync, catalogs };
}

/** Every DTO field that has a `BOUNDS` entry, and the entry. */
const PAIRS: { name: string; bound: keyof typeof BOUNDS; field: (d: Dtos) => AnyZod }[] = [
  { name: "quotes.create.gctRatePct", bound: "gctRatePct", field: (d) => fieldOf(d.quotes.createQuoteSchema as never, ["gctRatePct"]) },
  { name: "quotes.create.discountPct", bound: "discountPct", field: (d) => fieldOf(d.quotes.createQuoteSchema as never, ["discountPct"]) },
  { name: "invoices.create.gctRatePct", bound: "gctRatePct", field: (d) => fieldOf(d.invoices.createInvoiceSchema as never, ["gctRatePct"]) },
  { name: "invoices.create.discountPct", bound: "discountPct", field: (d) => fieldOf(d.invoices.createInvoiceSchema as never, ["discountPct"]) },
  { name: "invoices.update.gctRatePct", bound: "gctRatePct", field: (d) => fieldOf(d.invoices.updateInvoiceSchema as never, ["gctRatePct"]) },
  { name: "invoices.update.discountPct", bound: "discountPct", field: (d) => fieldOf(d.invoices.updateInvoiceSchema as never, ["discountPct"]) },
  { name: "business.defaultGctRate", bound: "gctRatePct", field: (d) => fieldOf(d.business.createBusinessSchema as never, ["defaultGctRate"]) },
  { name: "projects.progressPct", bound: "progressPct", field: (d) => fieldOf(d.projects.createProjectSchema as never, ["progressPct"]) },
  { name: "projects.retentionPct", bound: "retentionPct", field: (d) => fieldOf(d.projects.createProjectSchema as never, ["retentionPct"]) },
  { name: "sync.projects.progressPct", bound: "progressPct", field: (d) => fieldOf(d.sync.pushSchema as never, ["projects", "data", "progressPct"]) },
  { name: "catalogs.material.wastePct", bound: "wastePct", field: (d) => fieldOf(d.catalogs.createMaterialFavouriteSchema as never, ["wastePct"]) },
  { name: "catalogs.material.coveragePerSellUnit", bound: "coveragePerSellUnit", field: (d) => fieldOf(d.catalogs.createMaterialFavouriteSchema as never, ["coveragePerSellUnit"]) },
];

/** Where this field's accept/refuse edges are, measured by parsing. */
function edgeProblems(schema: AnyZod, b: NumericBound): string[] {
  const ok = (v: number) => schema.safeParse(v).success;
  const problems: string[] = [];
  const nudge = b.step === 1 ? 1 : 0.001;
  if (b.positiveOnly) {
    if (ok(0)) problems.push("accepts 0 against positiveOnly");
    if (!ok(0.01)) problems.push("refuses the input's min 0.01");
  } else {
    if (!ok(b.min)) problems.push(`refuses min ${b.min}`);
    if (ok(b.min - nudge)) problems.push(`accepts below min (${b.min - nudge})`);
  }
  if (b.max !== undefined) {
    if (!ok(b.max)) problems.push(`refuses max ${b.max}`);
    if (ok(b.max + nudge)) problems.push(`accepts above max (${b.max + nudge})`);
  }
  return problems;
}

describe("the DTOs spend the same BOUNDS", () => {
  it("each DTO field accepts exactly the BOUNDS range", async () => {
    const dtos = await loadDtos();
    expect(PAIRS.length).toBeGreaterThanOrEqual(12);
    const wrong = PAIRS.flatMap((p) => edgeProblems(p.field(dtos), BOUNDS[p.bound]).map((e) => `${p.name}: ${e}`));
    expect(wrong).toEqual([]);
  });

  it("each DTO field MOVES when BOUNDS moves — a hand-typed copy stays put and fails", async () => {
    const actual = await vi.importActual<typeof import("@jamquote/core")>("@jamquote/core");
    const shifted = Object.fromEntries(
      Object.entries(actual.BOUNDS).map(([k, b]) => [
        k,
        { ...b, min: b.min + 1, ...("max" in b ? { max: b.max - 1 } : {}) },
      ]),
    ) as unknown as typeof BOUNDS;
    vi.resetModules();
    vi.doMock("@jamquote/core", () => ({ ...actual, BOUNDS: shifted }));
    try {
      const dtos = await loadDtos();
      const wrong = PAIRS.flatMap((p) => edgeProblems(p.field(dtos), shifted[p.bound]).map((e) => `${p.name}: ${e}`));
      expect(wrong).toEqual([]);
    } finally {
      vi.doUnmock("@jamquote/core");
      vi.resetModules();
    }
  });
});

// ─────────────────────────────────────── the subscription payment form, by behaviour

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("@/lib/auth-actions", () => ({ logout: vi.fn() }));
vi.mock("@/lib/impersonation-actions", () => ({ startImpersonation: vi.fn() }));

describe("the subscription payment form refuses what the server refuses, in words", () => {
  /**
   * The executed defect: amount `0` was sent and refused as "Number must be greater
   * than 0" at `amountCents`; a 121-character reference as "String must contain at
   * most 120 character(s)" at `reference`. This builds the body the form sends and
   * asks the real DTO, so the form's rule and the server's cannot disagree silently.
   */
  it("agrees with recordSubscriptionPaymentSchema on every case", async () => {
    const { subscriptionPaymentProblem, SUBSCRIPTION_REFERENCE_MAX } = await import("@/app/admin/AdminConsole");
    const { recordSubscriptionPaymentSchema } = await import("../../api/src/admin/admin.dto");
    const body = (reference: string, amount: string) => ({
      method: "BANK_TRANSFER",
      ...(reference.trim() ? { reference: reference.trim() } : {}),
      ...(amount.trim() ? { amountCents: Math.round(Number(amount) * 100) } : {}),
    });
    const long = "x".repeat(SUBSCRIPTION_REFERENCE_MAX);
    const cases: [string, string][] = [
      ["", ""], ["ref", "2500"], ["", "0"], ["", "0.00"], ["", "-5"], ["", "0.004"], ["", "0.01"],
      [long, ""], [long + "x", ""], [`  ${long}  `, ""], [long + "x", "0"],
    ];
    const disagree = cases.filter(([r, a]) => {
      const clientOk = subscriptionPaymentProblem(r, a) === null;
      return clientOk !== recordSubscriptionPaymentSchema.safeParse(body(r, a)).success;
    });
    expect(disagree).toEqual([]);

    expect(subscriptionPaymentProblem("", "0")).toBe("Amount must be above zero, or blank for the agreed price.");
    expect(subscriptionPaymentProblem(long + "x", "")).toBe(`Reference must be ${SUBSCRIPTION_REFERENCE_MAX} characters or fewer.`);
  });
});

describe("the bounds themselves are coherent", () => {
  it("every percentage is 0–100", () => {
    for (const key of ["discountPct", "gctRatePct", "depositPct", "progressPct", "retentionPct"] as const) {
      expect(BOUNDS[key].min, key).toBe(0);
      expect(BOUNDS[key].max, key).toBe(100);
    }
  });

  it("a whole-number field carries a step, so the browser cannot offer a fraction", () => {
    expect(BOUNDS.progressPct.step).toBe(1);
  });

  it("money has no ceiling, because a real contract can be large", () => {
    expect("max" in BOUNDS.moneyDollars).toBe(false);
    expect(BOUNDS.moneyDollars.min).toBe(0);
  });

  it("coverage is positive-only, matching the server's .positive()", () => {
    expect(BOUNDS.coveragePerSellUnit.positiveOnly).toBe(true);
  });
});
