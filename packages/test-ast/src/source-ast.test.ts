import { describe, expect, it } from "vitest";
import ts from "typescript";
import {
  analyseStatic,
  attributeValue,
  callsTo,
  collect,
  destructuredPropertyName,
  isImportedChain,
  jsxAttributes,
  parseSource,
  reachableClosure,
  renderedExpressions,
  renderedText,
} from "./source-ast";

/**
 * The parser every apps/web source guard spends.
 *
 * Each case below that is described as a bypass DID defeat an earlier text-matching
 * guard in this repo. They are here so the parser those guards now share cannot regress
 * on any of them — the lesson of eleven generations is that a guard's matcher is where
 * its defect lives, and a matcher nobody tests is a matcher nobody can trust.
 */

/** The expression in `const probe = <expr>;`, parsed in a file carrying `prelude`. */
function probe(expr: string, prelude = ""): ts.Expression {
  const sf = parseSource("probe.tsx", `${prelude}\nconst __probe = ${expr};\n`);
  const decl = sf.statements
    .filter(ts.isVariableStatement)
    .flatMap((s) => [...s.declarationList.declarations])
    .find((d) => ts.isIdentifier(d.name) && d.name.text === "__probe");
  if (!decl?.initializer) throw new Error(`probe did not parse: ${expr}`);
  return decl.initializer;
}

const IMPORTS = `import { CURRENCY_CODES, BOUNDS, formatPlatformMoney } from "@jamquote/core";`;

describe("analyseStatic: values fixed by constants", () => {
  it.each([
    ["a digit", "3"],
    ["a unary plus — the `{+3}` bypass", "+3"],
    ["a unary minus", "-3"],
    ["a quoted digit — the `{\"3\"}` bypass", '"3"'],
    ["a template with no substitution", "`3`"],
    ["parentheses", "(3)"],
    ["arithmetic on literals", "1 + 2"],
    ["a cast — `\"JMD\" as CurrencyCode`", '"JMD" as CurrencyCode'],
    ["a non-null assertion", '"JMD"!'],
    ["a global coercion — the `String(\"JMD\")` bypass", 'String("JMD")'],
    ["a global coercion behind a cast", 'String("JMD") as CurrencyCode'],
    ["a ternary over literals", 'true ? "JMD" : "USD"'],
    ["undefined", "undefined"],
    ["an immediately-invoked arrow — the `(() => 3)()` bypass", "(() => 3)()"],
    ["an immediately-invoked function expression", "(function () { return 3; })()"],
  ])("%s", (_label, expr) => {
    expect(analyseStatic(probe(expr)).static).toBe(true);
  });

  it("an indexed import — the `CURRENCY_CODES[0]` bypass", () => {
    const result = analyseStatic(probe("CURRENCY_CODES[0]", IMPORTS));
    expect(result.static).toBe(true);
    expect([...result.roots]).toEqual(["CURRENCY_CODES"]);
  });

  it("a property read of a local const object — the `C.jmd` bypass", () => {
    expect(analyseStatic(probe("C.jmd", 'const C = { jmd: "JMD" };')).static).toBe(true);
  });

  it("a const bound to a literal — the `const JMD = \"JMD\"` bypass", () => {
    const result = analyseStatic(probe("JMD", 'const JMD = "JMD";'));
    expect(result.static).toBe(true);
    expect(result.roots.has("JMD")).toBe(true);
  });

  it("a let that is never reassigned — the `let` bypass", () => {
    expect(analyseStatic(probe("X", 'let X = "JMD";')).static).toBe(true);
  });

  it("a nested read of an import, reporting it as the root", () => {
    // `BOUNDS.discountPct.min` is static AND from the approved source; the roots are how
    // a bounds guard tells it apart from a hand-typed `0`.
    const result = analyseStatic(probe("BOUNDS.discountPct.min", IMPORTS));
    expect(result.static).toBe(true);
    expect([...result.roots]).toEqual(["BOUNDS"]);
  });

  it("a pure literal has no roots", () => {
    expect([...analyseStatic(probe("0")).roots]).toEqual([]);
  });
});

describe("analyseStatic: values computed from data", () => {
  it.each([
    ["a property of a parameter", "r.currency", "function f(r) {}"],
    ["optional chaining on state", "pricing?.currency", "let pricing = load();"],
    ["nullish coalescing over data", "r.currency ?? currency", "function f(r, currency) {}"],
    ["a parameter", "code", "function f(code) {}"],
    ["a destructured name", "currency", "const { currency } = props;"],
    ["a call to a function declared in the file", "money(5)", "function money(c) { return c; }"],
    ["a call to an imported function", "formatPlatformMoney(5, 'JMD')", IMPORTS],
    ["an undeclared name", "somethingUnknown", ""],
    // The class the first version got wrong: it read every undeclared function call as
    // a pure global, so these were "constants".
    ["a call to an undeclared function", "load()", ""],
    ["an impure global — `fetch(\"/api\")`", 'fetch("/api")', ""],
    ["a global method call", "Date.now()", ""],
    ["an immediately-invoked arrow reading its own parameter", "((x) => x)(load())", ""],
  ])("%s", (_label, expr, prelude) => {
    expect(analyseStatic(probe(expr, prelude)).static).toBe(false);
  });

  it("a let that IS reassigned", () => {
    expect(analyseStatic(probe("X", 'let X = "JMD"; X = load();')).static).toBe(false);
  });

  it("a file's own `String` is not the global conversion", () => {
    const prelude = "function String(v) { return fetchSomething(v); }";
    expect(analyseStatic(probe('String("JMD")', prelude)).static).toBe(false);
  });

  it("a name is judged by the declaration that BINDS it, not by name file-wide", () => {
    // This test used to assert the opposite: that a module constant reads as data
    // because an unrelated function has a parameter of the same name. That was the
    // parser's flaw, not a rule — an independent review showed it lets a genuine
    // hardcoded `const currency = "JMD"` through whenever any other function in a large
    // component reuses the name, without anyone trying to evade anything.
    const sf = parseSource(
      "shadow.tsx",
      'const code = "JMD";\nconst atModule = code;\nfunction f(code) { const inside = code; return inside; }\n',
    );
    const init = (name: string) =>
      collect(sf, ts.isVariableDeclaration).find(
        (d) => ts.isIdentifier(d.name) && d.name.text === name,
      )!.initializer!;
    // At module scope `code` is the constant.
    expect(analyseStatic(init("atModule")).static).toBe(true);
    // Inside `f`, `code` is the parameter, which is data.
    expect(analyseStatic(init("inside")).static).toBe(false);
  });

  it("an import on its own, unread", () => {
    // A bare imported binding could be a function or a mutable object.
    expect(analyseStatic(probe("BOUNDS", IMPORTS)).static).toBe(false);
  });

  it("a self-referencing initializer does not loop and is not a constant", () => {
    expect(analyseStatic(probe("A", "const A = A;")).static).toBe(false);
  });
});

describe("analyseStatic: class static fields", () => {
  it("a static field with a literal initializer, read off the class", () => {
    const result = analyseStatic(probe("L.CAP", "class L { static CAP = 100; }"));
    expect(result.static).toBe(true);
  });

  it("a static field written to elsewhere is data, not a constant", () => {
    const prelude = "class L { static CAP = 100; } function reset() { L.CAP = load(); }";
    expect(analyseStatic(probe("L.CAP", prelude)).static).toBe(false);
  });

  it("an instance (non-static) field is not treated as a class-static read", () => {
    const prelude = "class L { CAP = 100; } const l = new L();";
    expect(analyseStatic(probe("l.CAP", prelude)).static).toBe(false);
  });

  it("a class EXPRESSION's static field — the `const L = class { static CAP = 100 }` bypass", () => {
    const result = analyseStatic(probe("L.CAP", "const L = class { static CAP = 100; };"));
    expect(result.static).toBe(true);
  });

  it("a class expression's static field written to elsewhere is data", () => {
    const prelude = "const L = class { static CAP = 100; }; function reset() { L.CAP = load(); }";
    expect(analyseStatic(probe("L.CAP", prelude)).static).toBe(false);
  });

  it("a static GETTER returning a literal — the `static get CAP()` bypass", () => {
    const result = analyseStatic(probe("L.CAP", "class L { static get CAP() { return 100; } }"));
    expect(result.static).toBe(true);
  });

  it("a static getter reading data is not static", () => {
    const prelude = "class L { static get CAP() { return load(); } }";
    expect(analyseStatic(probe("L.CAP", prelude)).static).toBe(false);
  });

  it("`L.CAP = 100` outside the declaration is data, consistent with bindingTainted", () => {
    const prelude = "class L { static CAP; } L.CAP = 100;";
    expect(analyseStatic(probe("L.CAP", prelude)).static).toBe(false);
  });
});

describe("analyseStatic: void and IIFE-via-call/apply", () => {
  it("`void 0 ?? 100` is static — void always evaluates to undefined", () => {
    expect(analyseStatic(probe("void 0 ?? 100")).static).toBe(true);
  });

  it("`void load()` is still static — the operand's staticness does not matter", () => {
    expect(analyseStatic(probe("void load()")).static).toBe(true);
  });

  it("an IIFE invoked via `.call` — the `(() => 100).call(null)` bypass", () => {
    expect(analyseStatic(probe("(() => 100).call(null)")).static).toBe(true);
  });

  it("an IIFE invoked via `.apply`", () => {
    expect(analyseStatic(probe("(() => 100).apply(null)")).static).toBe(true);
  });

  it("an IIFE via `.call` that reads a parameter is still data", () => {
    expect(analyseStatic(probe("((x) => x).call(null, load())")).static).toBe(false);
  });
});

describe("isImportedChain: telling the approved constant from a merely-static value", () => {
  const named = 'import { BOUNDS } from "@jamquote/core";';
  const aliased = 'import { BOUNDS as B } from "@jamquote/core";';
  const namespace = 'import * as C from "@jamquote/core";';

  it("a bare named import", () => {
    expect(isImportedChain(probe("BOUNDS", named), "@jamquote/core", "BOUNDS")).toBe(true);
  });

  it("a property chain off a named import", () => {
    expect(isImportedChain(probe("BOUNDS.discountPct.min", named), "@jamquote/core", "BOUNDS")).toBe(true);
  });

  it("an aliased named import", () => {
    expect(isImportedChain(probe("B.discountPct.min", aliased), "@jamquote/core", "BOUNDS")).toBe(true);
  });

  it("a namespace import", () => {
    expect(isImportedChain(probe("C.BOUNDS.discountPct.min", namespace), "@jamquote/core", "BOUNDS")).toBe(true);
  });

  it("bypass: arithmetic on the imported value is not a bare read", () => {
    expect(isImportedChain(probe("BOUNDS.depositPct.max + 50", named), "@jamquote/core", "BOUNDS")).toBe(false);
  });

  it("bypass: wrapped in a call is not a bare read", () => {
    expect(isImportedChain(probe("Math.min(BOUNDS.x, 50)", named), "@jamquote/core", "BOUNDS")).toBe(false);
  });

  it("bypass: a local binding sharing the imported name", () => {
    expect(isImportedChain(probe("BOUNDS.cap", "const BOUNDS = { cap: 100 };"), "@jamquote/core", "BOUNDS")).toBe(
      false,
    );
  });

  it("bypass: a write through the import anywhere in the file defeats a later bare read", () => {
    const prelude = `${named}\n(BOUNDS as any).wastePct.max = 50;`;
    expect(isImportedChain(probe("BOUNDS.discountPct.min", prelude), "@jamquote/core", "BOUNDS")).toBe(false);
  });

  it("a compound assignment or ++ through the import also defeats it", () => {
    expect(isImportedChain(probe("BOUNDS.x", `${named}\nBOUNDS.y += 1;`), "@jamquote/core", "BOUNDS")).toBe(false);
    expect(isImportedChain(probe("BOUNDS.x", `${named}\nBOUNDS.y++;`), "@jamquote/core", "BOUNDS")).toBe(false);
  });

  it("an unrelated write to a same-named local binding does not taint the import", () => {
    const prelude = `${named}\nfunction f() { const other = { z: 1 }; other.z = 2; }`;
    expect(isImportedChain(probe("BOUNDS.discountPct.min", prelude), "@jamquote/core", "BOUNDS")).toBe(true);
  });
});

describe("callsTo: import-resolved callee", () => {
  const moduleSpecifier = "@/lib/quote-totals";
  const importedFrom = { moduleSpecifier, exportedName: "lineUnitLabel" };
  const imp = `import { lineUnitLabel } from "${moduleSpecifier}";`;

  it("a direct call to the real import", () => {
    const sf = parseSource("c1.tsx", `${imp}\nlineUnitLabel(l);`);
    expect(callsTo(sf, "lineUnitLabel", importedFrom)).toHaveLength(1);
  });

  it("an aliased import, and a namespace-import property", () => {
    const aliased = parseSource("c2.tsx", `import { lineUnitLabel as f } from "${moduleSpecifier}";\nf(l);`);
    expect(callsTo(aliased, "lineUnitLabel", importedFrom)).toHaveLength(1);

    const ns = parseSource("c3.tsx", `import * as QT from "${moduleSpecifier}";\nQT.lineUnitLabel(l);`);
    expect(callsTo(ns, "lineUnitLabel", importedFrom)).toHaveLength(1);
  });

  it("bypass: a same-named property on an object literal built on the spot does not count", () => {
    const sf = parseSource(
      "c4.tsx",
      "({ lineUnitLabel: (u: string) => u.toLowerCase() }).lineUnitLabel(l.rateUnit);",
    );
    expect(callsTo(sf, "lineUnitLabel", importedFrom)).toHaveLength(0);
  });

  it("bypass: a locally declared function with the same name does not count", () => {
    const sf = parseSource("c5.tsx", "function lineUnitLabel(l: any) { return l; }\nlineUnitLabel(l);");
    expect(callsTo(sf, "lineUnitLabel", importedFrom)).toHaveLength(0);
  });

  it("without importedFrom, matching stays spelling-based (existing callers keep working)", () => {
    const sf = parseSource("c6.tsx", "function lineUnitLabel(l: any) { return l; }\nlineUnitLabel(l);");
    expect(callsTo(sf, "lineUnitLabel")).toHaveLength(1);
  });
});

describe("callsTo: declaration-resolved callee", () => {
  it("a call to the specific local declaration", () => {
    const sf = parseSource("d1.ts", "function pricingProblem() { return null; }\npricingProblem();");
    const decl = collect(sf, ts.isFunctionDeclaration).find((d) => d.name?.text === "pricingProblem")!;
    expect(callsTo(sf, "pricingProblem", { declaration: decl })).toHaveLength(1);
  });

  it("a call through a never-written local alias of the declaration", () => {
    const sf = parseSource(
      "d2.ts",
      "function pricingProblem() { return null; }\nconst f = pricingProblem;\nf();",
    );
    const decl = collect(sf, ts.isFunctionDeclaration).find((d) => d.name?.text === "pricingProblem")!;
    expect(callsTo(sf, "pricingProblem", { declaration: decl })).toHaveLength(1);
  });

  it("bypass: a same-named shadowing declaration does not resolve to the original", () => {
    const sf = parseSource(
      "d3.ts",
      [
        "function pricingProblem() { return null; }",
        "{",
        "  const pricingProblem = () => null;",
        "  pricingProblem();",
        "}",
      ].join("\n"),
    );
    const outer = collect(sf, ts.isFunctionDeclaration).find((d) => d.name?.text === "pricingProblem")!;
    expect(callsTo(sf, "pricingProblem", { declaration: outer })).toHaveLength(0);
  });
});

describe("destructuredPropertyName", () => {
  it("a shorthand destructure", () => {
    const sf = parseSource("d.tsx", "function f({ rateUnit }) { return rateUnit; }");
    const id = collect(sf, ts.isIdentifier).find((n) => n.text === "rateUnit" && ts.isReturnStatement(n.parent))!;
    expect(destructuredPropertyName(id)).toBe("rateUnit");
  });

  it("a renamed destructure", () => {
    const sf = parseSource("d.tsx", "function f({ rateUnit: ru }) { return ru; }");
    const id = collect(sf, ts.isIdentifier).find((n) => n.text === "ru" && ts.isReturnStatement(n.parent))!;
    expect(destructuredPropertyName(id)).toBe("rateUnit");
  });

  it("a plain parameter is not a destructure", () => {
    const sf = parseSource("d.tsx", "function f(rateUnit) { return rateUnit; }");
    const id = collect(sf, ts.isIdentifier).find((n) => n.text === "rateUnit" && ts.isReturnStatement(n.parent))!;
    expect(destructuredPropertyName(id)).toBeUndefined();
  });
});

describe("parseSource: a syntax error is not silently parsed", () => {
  it("throws on unparseable text instead of returning a best-effort guess", () => {
    expect(() => parseSource("broken.ts", "const x = (;")).toThrow(/does not parse/);
  });

  it("does not throw on ordinary valid source", () => {
    expect(() => parseSource("fine.tsx", "const x = <div>{1}</div>;")).not.toThrow();
  });
});

describe("callsTo", () => {
  const sf = parseSource(
    "calls.tsx",
    [
      "formatPlatformMoney(1, a);",
      "formatPlatformMoney(Number(r.amountCents), \"JMD\");", // the paren-crossing bypass
      "x.formatPlatformMoney(2, b);",
      "x?.formatPlatformMoney(3, c);",
      "(formatPlatformMoney)(4, d);",
      "formatPlatformMoney(",
      "  5,",
      "  e,",
      ");",
      "notFormatPlatformMoney(6, f);",
    ].join("\n"),
  );

  it("finds every call however it is written, and no near-miss", () => {
    expect(callsTo(sf, "formatPlatformMoney")).toHaveLength(6);
  });

  it("returns real argument nodes, so a call inside an argument is not a boundary", () => {
    const second = callsTo(sf, "formatPlatformMoney")[1]!;
    expect(second.arguments).toHaveLength(2);
    expect(analyseStatic(second.arguments[1]!).static).toBe(true);
  });
});

describe("jsxAttributes and attributeValue", () => {
  const sf = parseSource(
    "attrs.tsx",
    [
      'import { BOUNDS } from "@jamquote/core";',
      'const a = <input min={0} max="100" />;',
      'const b = <input min={"0"} />;', // the quoted-brace bypass
      "const c = <input min={BOUNDS.discountPct.min} />;",
      "const d = <input disabled />;",
    ].join("\n"),
  );

  it("finds the attribute on every element", () => {
    expect(jsxAttributes(sf, "min")).toHaveLength(3);
  });

  it("reads a quoted value, a braced value and a braced string alike", () => {
    const values = jsxAttributes(sf, "min").map((a) => attributeValue(a)!);
    expect(values.map((v) => analyseStatic(v).static)).toEqual([true, true, true]);
    // All three are constants. What separates a hand-typed bound from the approved one
    // is the ROOT: the first two come from nowhere, the third from BOUNDS — and a bounds
    // guard reads exactly that. This test first expected three empty root sets and never
    // imported BOUNDS, so it asserted the wrong distinction twice over.
    expect(values.map((v) => [...analyseStatic(v).roots])).toEqual([[], [], ["BOUNDS"]]);
  });

  it("returns null for a bare boolean attribute", () => {
    expect(attributeValue(jsxAttributes(sf, "disabled")[0]!)).toBeNull();
  });
});

describe("renderedText", () => {
  it("sees bare text content, which renderedExpressions cannot", () => {
    // `<span>3</span>` was the first-generation hardcoded-count defect, and it is a
    // JsxText node, not a JsxExpression. This file first shipped only the latter.
    const sf = parseSource("text.tsx", "const x = <div>\n  <span>3</span>\n  <b>{n}</b>\n</div>;");
    expect(renderedText(sf).map((t) => t.text)).toEqual(["3"]);
    expect(renderedExpressions(sf)).toHaveLength(1);
  });

  it("drops whitespace-only runs between elements", () => {
    const sf = parseSource("ws.tsx", "const x = <div>\n  \n  <span />\n</div>;");
    expect(renderedText(sf)).toEqual([]);
  });
});

/**
 * Every case an independent review of the first version CONFIRMED by execution.
 *
 * The first version tracked names file-wide rather than by binding, gave up on any call
 * that was not a value conversion, and never looked at destructuring writes or spread
 * attributes. Each block below is the reviewer's list, kept so a later change to the
 * parser cannot quietly reopen any of it.
 */
describe("review of the first version: constants it reported as data (bypasses)", () => {
  it.each([
    ["an enum member", "C.JMD", 'enum C { JMD = "JMD" }'],
    ["a method call on a string literal", '"JMD".slice(0)', ""],
    ["another method on a literal", '"jmd".toUpperCase()', ""],
    ["a spread-and-join of a literal", '[..."JMD"].join("")', ""],
    ["a const arrow returning a literal", "cur()", 'const cur = () => "JMD";'],
    ["a frozen literal object", 'Object.freeze({ jmd: "JMD" }).jmd', ""],
    ["String.raw over a literal", "String.raw`JMD`", ""],
    ["a shorthand property of a const", "o.cur", 'const cur = "JMD"; const o = { cur };'],
    ["a destructuring default over a literal source", "c", 'const { c = "JMD" } = {};'],
    [
      "a module const beside an unrelated reassigned let of the same name",
      "cur",
      'const cur = "JMD"; function g() { let cur = 1; cur = load(); return cur; }',
    ],
  ])("%s", (_label, expr, prelude) => {
    expect(analyseStatic(probe(expr, prelude)).static).toBe(true);
  });
});

describe("review of the first version: data it reported as constants (false alarms)", () => {
  it.each([
    ["an array destructuring assignment", "x", "let x = 0; [x] = load();"],
    ["an object destructuring assignment", "x", "let x = 0; ({ x } = load());"],
    ["a for-of target", "x", 'let x = "a"; for (x of rows) {}'],
    ["mutation through a property", "o.a", "const o = { a: 1 }; o.a = load();"],
    ["mutation through an array method", "a[0]", "const a = [1]; a.push(load());"],
    ["a locally declared undefined", "undefined", "const undefined = load();"],
  ])("%s", (_label, expr, prelude) => {
    expect(analyseStatic(probe(expr, prelude)).static).toBe(false);
  });
});

describe("review of the first version: callsTo and spread attributes", () => {
  const sf = parseSource(
    "review-calls.tsx",
    [
      'import { formatPlatformMoney } from "@jamquote/core";',
      "const f = formatPlatformMoney;",
      'f(1, "JMD");',
      'formatPlatformMoney.call(null, 2, "JMD");',
      'formatPlatformMoney.apply(null, [3, "JMD"]);',
      'x["formatPlatformMoney"](4, "JMD");',
      '(0, formatPlatformMoney)(5, "JMD");',
    ].join("\n"),
  );

  it("finds a call through an alias, .call, .apply, an element access and a comma", () => {
    expect(callsTo(sf, "formatPlatformMoney")).toHaveLength(5);
  });

  it("exposes .call and .apply arguments as the arguments the callee receives", () => {
    // A guard on the currency argument must read "JMD", not `null`, the receiver.
    for (const call of callsTo(sf, "formatPlatformMoney")) {
      expect(call.arguments.length, call.getText()).toBeGreaterThanOrEqual(2);
      expect(analyseStatic(call.arguments[1]!).static, call.getText()).toBe(true);
    }
  });

  it("reports an attribute supplied through a spread of an object literal", () => {
    const spread = parseSource("spread.tsx", "const a = <input {...{ min: 0 }} />;");
    const found = jsxAttributes(spread, "min");
    expect(found).toHaveLength(1);
    expect(analyseStatic(attributeValue(found[0]!)!).static).toBe(true);
  });
});

describe("renderedExpressions", () => {
  const sf = parseSource(
    "render.tsx",
    'const x = <div title={t}><span>{+3}</span><b>{count}</b>{"3"}</div>;',
  );

  it("returns content expressions and never attribute values", () => {
    const rendered = renderedExpressions(sf);
    expect(rendered).toHaveLength(3);
    expect(rendered.filter((e) => analyseStatic(e).static)).toHaveLength(2);
  });
});

describe("reachableClosure", () => {
  it("follows edges from every externally-referenced name", () => {
    const edges = new Map([["A", new Set(["B"])], ["B", new Set(["C"])]]);
    expect(reachableClosure(new Set(["A"]), edges)).toEqual(new Set(["A", "B", "C"]));
  });

  it("a pair referencing only each other is not reachable from nothing external", () => {
    const edges = new Map([["A", new Set(["B"])], ["B", new Set(["A"])]]);
    expect(reachableClosure(new Set(), edges)).toEqual(new Set());
  });

  it("a name with no outgoing edge is still live if it is external", () => {
    expect(reachableClosure(new Set(["Z"]), new Map())).toEqual(new Set(["Z"]));
  });
});
