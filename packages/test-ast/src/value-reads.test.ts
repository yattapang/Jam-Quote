import { describe, expect, it } from "vitest";
import ts from "typescript";
import {
  additiveChains,
  additiveTerms,
  collect,
  declaredTypeImport,
  enclosingFunctionKey,
  parseSource,
  mayShareReceiver,
  resolveRead,
  staticStrings,
} from "./source-ast";

/**
 * The capabilities added when core's retention guard moved onto this parser. Each
 * spelling an independent review showed the guard's private resolver missed is a probe.
 */

/** The expression in `const __probe = <expr>;`, parsed in a file carrying `prelude`. */
function probe(expr: string, prelude = ""): ts.Expression {
  const sf = parseSource("probe.ts", `${prelude}\nconst __probe = ${expr};\n`);
  const decl = collect(sf, ts.isVariableDeclaration).find((d) => ts.isIdentifier(d.name) && d.name.text === "__probe");
  if (!decl?.initializer) throw new Error(`probe did not parse: ${expr}`);
  return decl.initializer;
}

const prop = (name: string) => ({ kind: "property", name });

describe("resolveRead", () => {
  it.each([
    ["dot", "a.totalCents"],
    ["bracket", 'a["totalCents"]'],
    ["optional chaining", "a?.totalCents"],
    ["?? with a static fallback", "(a?.totalCents ?? 0)"],
    ["?? with a static fallback behind a cast", "((a?.totalCents as number) ?? 0)"],
    ["|| with a static fallback — an independent review's bypass", "(a.totalCents || 0)"],
    ["&& with a static fallback", "(a.totalCents && 1)"],
    ["global Number", "Number(a.totalCents)"],
    ["unary plus", "+a.totalCents"],
  ])("%s", (_l, expr) => {
    expect(resolveRead(probe(expr, "declare const a: any;")).read).toEqual(prop("totalCents"));
  });

  it("does not unwrap || over a NON-static fallback — which side wins is data", () => {
    expect(resolveRead(probe("a.totalCents || b.taxCents", "declare const a: any, b: any;")).read.kind).toBe("other");
  });

  it("a single-assignment-then-return accessor body — an independent review's bypass", () => {
    expect(
      resolveRead(probe("totalOf(inv)", "const totalOf = (a) => { const x = a.totalCents; return x; };")).read,
    ).toEqual(prop("totalCents"));
  });

  it("does not unwrap ?? over a NON-static fallback — which side wins is data", () => {
    expect(resolveRead(probe("a.totalCents ?? b.taxCents", "declare const a: any, b: any;")).read.kind).toBe("other");
  });

  it("follows a never-written alias and reports its name", () => {
    const r = resolveRead(probe("t", "const t = inv.totalCents;"));
    expect({ read: r.read, aliases: r.aliases }).toEqual({ read: prop("totalCents"), aliases: ["t"] });
    expect(r.receiver?.getText()).toBe("inv");
  });

  it("does not follow a reassigned let", () => {
    expect(resolveRead(probe("t", "let t = inv.totalCents; t = 5;")).read).toEqual({ kind: "name", name: "t" });
  });

  it("a renamed destructuring reads the property", () => {
    expect(resolveRead(probe("t", "const { totalCents: t } = inv;")).read).toEqual(prop("totalCents"));
  });

  it.each([
    ["a const arrow accessor — the cross-function bypass", "totalOf(inv)", "const totalOf = (a) => a.totalCents;"],
    ["a function declaration accessor", "totalOf(inv)", "function totalOf(a) { return a.totalCents; }"],
    ["an accessor through ??", "totalOf(inv)", "const totalOf = (a) => a?.totalCents ?? 0;"],
  ])("%s", (_l, expr, prelude) => {
    expect(resolveRead(probe(expr, prelude)).read).toEqual(prop("totalCents"));
  });

  it.each([
    ["an accessor that was reassigned", "totalOf(inv)", "let totalOf = (a) => a.totalCents; totalOf = (a) => a.taxCents;"],
    ["an accessor reading a captured object, not its parameter", "totalOf(inv)", "const other = {}; const totalOf = (a) => other.totalCents;"],
    ["a function with more than a return", "totalOf(inv)", "function totalOf(a) { log(a); return a.totalCents; }"],
    ["an undeclared function", "totalOf(inv)", ""],
  ])("does not treat %s as a one-level accessor", (_l, expr, prelude) => {
    expect(resolveRead(probe(expr, prelude)).read.kind).toBe("other");
  });

  // Round 6: the value-preserving conversion CLASS, literal containers, getters, and a
  // field name passed as a string to a local helper. Each is a spelling an audit executed.
  it.each([
    ["BigInt", "BigInt(a.totalCents)"],
    ["String", "String(a.totalCents)"],
    ["Number.parseFloat", "Number.parseFloat(a.totalCents)"],
    ["parseInt with a radix", "parseInt(a.totalCents, 10)"],
    ["Math.trunc", "Math.trunc(a.totalCents)"],
    ["Math.abs", "Math.abs(a.totalCents)"],
    [".toString()", "a.totalCents.toString()"],
    [".valueOf()", "a.totalCents.valueOf()"],
    [".toFixed(2)", "a.totalCents.toFixed(2)"],
    ["a formatter's .format(x)", "fmt.format(a.totalCents)"],
    ["a single-substitution template", "`${a.totalCents}`"],
    ["Number over a template", "Number(`${a.totalCents}`)"],
    ["an array-literal element by constant index", "pair[0]", "const pair = [a.totalCents, a.paidCents];"],
    ["an index held in a const", "pair[I]", "const I = 0; const pair = [a.totalCents, a.paidCents];"],
    [".at(0)", "pair.at(0)", "const pair = [a.totalCents, a.paidCents];"],
    [".at(-2)", "pair.at(-2)", "const pair = [a.totalCents, a.paidCents];"],
    ["an array binding pattern", "t", "const [t, pd] = [a.totalCents, a.paidCents];"],
    ["an object-literal property", "m.due", "const m = { due: a.totalCents, got: a.paidCents };"],
    ["an object-literal property by bracket", 'm["due"]', "const m = { due: a.totalCents };"],
    ["a shorthand property of an alias", "m.t", "const t = a.totalCents; const m = { t };"],
    ["a single-return getter", "g.a", "const g = { get a() { return a.totalCents; } };"],
    ["an object pattern over a literal", "due", "const { due } = { due: a.totalCents };"],
    ["a nested literal path", "m.x[1]", "const m = { x: [0, a.totalCents] };"],
    ["a field name passed as a string to a local helper", 'pick(a, "totalCents")', "const pick = (o, k) => o[k];"],
    ["the same through a function declaration", 'pick(a, K)', 'const K = "totalCents"; function pick(o, k) { return o[k]; }'],
  ])("follows %s", (_l, expr, prelude = "") => {
    const r = resolveRead(probe(expr, `declare const a: any, fmt: any;
${prelude}`));
    expect(r.read).toEqual(prop("totalCents"));
    expect(r.receiver?.getText()).toBe("a");
  });

  it.each([
    ["a LOCAL String", "String(a.totalCents)", "const String = (x) => 'n';"],
    ["a LOCAL Math", "Math.trunc(a.totalCents)", "const Math = { trunc: (x) => 0 };"],
    ["a template with text around it", "`$${a.totalCents}`", ""],
    ["an index behind a spread", "pair[1]", "const pair = [...xs, a.totalCents];"],
    ["a key behind a later spread", "m.due", "const m = { due: a.totalCents, ...other };"],
    ["an array whose binding is reassigned", "pair[0]", "let pair = [a.totalCents]; pair = [a.taxCents];"],
    ["a method, not a getter", "g.a()", "const g = { a() { return a.totalCents; } };"],
    ["an IMPORTED helper", 'pick(a, "totalCents")', 'import { pick } from "lodash";'],
  ])("does not follow %s", (_l, expr, prelude) => {
    const r = resolveRead(probe(expr, `declare const a: any, xs: any, other: any;
${prelude}`));
    expect(r.read).not.toEqual(prop("totalCents"));
  });

  it("a parameter is known only by its name", () => {
    const sf = parseSource("p.ts", "function f(paidCents) { return paidCents; }");
    const ret = collect(sf, ts.isReturnStatement)[0]!.expression!;
    expect(resolveRead(ret).read).toEqual({ kind: "name", name: "paidCents" });
  });
});

describe("mayShareReceiver", () => {
  /** The receivers of the two reads in `const __probe = [<a>, <b>]`. */
  const share = (a: string, b: string, prelude: string) => {
    const arr = probe(`[${a}, ${b}]`, prelude) as ts.ArrayLiteralExpression;
    const [ra, rb] = arr.elements.map((el) => resolveRead(el as ts.Expression).receiver);
    return mayShareReceiver(ra, rb);
  };

  it("two distinct declared bindings are unrelated", () => {
    expect(share("q.totalCents", "pay.paidCents", "declare const q: any, pay: any;")).toBe(false);
    expect(share("q.totalCents", "pay.paidCents", "const q = load(1); const pay = load(2);")).toBe(false);
  });

  it("one binding, an alias, a clone, a derived sub-object, `this`, or anything unknown may be the same object", () => {
    expect(share("i.totalCents", "i.paidCents", "declare const i: any;")).toBe(true);
    expect(share("c.totalCents", "i.paidCents", "declare const i: any; const c = structuredClone(i);")).toBe(true);
    expect(share("c.totalCents", "i.paidCents", "declare const i: any; const c = JSON.parse(JSON.stringify(i));")).toBe(true);
    expect(share("c.totalCents", "i.paidCents", "declare const i: any; const c = { ...i };")).toBe(true);
    expect(share("this.a.totalCents", "this.b.paidCents", "")).toBe(true);
    expect(share("load().totalCents", "i.paidCents", "declare const i: any;")).toBe(true);
    expect(share("c.totalCents", "i.paidCents", "declare const i: any; let c = {}; c = i;")).toBe(true);
    expect(share("totalCents", "i.paidCents", "declare const i: any, totalCents: any;")).toBe(true);
  });
});

describe("additiveTerms and additiveChains", () => {
  const signed = (e: ts.Expression) =>
    additiveTerms(e).map((t) => `${t.sign === 1 ? "+" : "-"}${t.expr.getText()}`);

  it("flattens the left-associative `s + a.total - a.paid` (the reduce bypass)", () => {
    expect(signed(probe("s + a.totalCents - a.paidCents"))).toEqual(["+s", "+a.totalCents", "-a.paidCents"]);
  });

  it("flips signs through parentheses and unary minus", () => {
    expect(signed(probe("x - (a.totalCents - -a.paidCents)"))).toEqual(["+x", "-a.totalCents", "-a.paidCents"]);
  });

  it("returns one maximal chain per expression, including one inside a reduce callback", () => {
    const sf = parseSource("r.ts", "xs.reduce((s, a) => s + a.totalCents - a.paidCents, 0); const y = -(p + q) + r;");
    expect(additiveChains(sf).map((c) => c.getText())).toEqual(["s + a.totalCents - a.paidCents", "-(p + q) + r"]);
  });

  it("treats `x -= e` as a chain over x's own initializer and e — an independent review's bypass", () => {
    const sf = parseSource("c.ts", "let b = a.totalCents; b -= a.paidCents;");
    const [chain] = additiveChains(sf);
    expect(chain?.getText()).toBe("b -= a.paidCents");
    expect(signed(chain!)).toEqual(["+a.totalCents", "-a.paidCents"]);
  });

  it("treats `x += e` as a chain over x's own initializer and e", () => {
    const sf = parseSource("c.ts", "let b = a.totalCents; b += a.paidCents;");
    const [chain] = additiveChains(sf);
    expect(signed(chain!)).toEqual(["+a.totalCents", "+a.paidCents"]);
  });
});

describe("enclosingFunctionKey", () => {
  const keyOf = (src: string, marker = "MARK") => {
    const sf = parseSource("k.ts", src);
    return enclosingFunctionKey(collect(sf, ts.isIdentifier).find((i) => i.text === marker)!);
  };

  it("a class-field arrow is `Class#field`, not `<module>`", () => {
    expect(keyOf("class Reports { outstanding = (a) => MARK; }")).toBe("Reports#outstanding");
  });

  it("a private class-field arrow keeps its `#` name", () => {
    expect(keyOf("class Reports { #outstanding = (a) => MARK; }")).toBe("Reports##outstanding");
  });

  it("methods, functions and const arrows keep their bare names; top level is <module>", () => {
    expect(keyOf("class A { m() { MARK; } }")).toBe("m");
    expect(keyOf("function g() { MARK; }")).toBe("g");
    expect(keyOf("const h = () => MARK;")).toBe("h");
    expect(keyOf("MARK;")).toBe("<module>");
  });
});

describe("staticStrings", () => {
  it("a literal, a ternary over literals, and an alias of one", () => {
    expect(staticStrings(probe('"a"'))).toEqual(["a"]);
    expect(staticStrings(probe('ok ? "a.review" : "a.reopen"'))).toEqual(["a.review", "a.reopen"]);
    expect(staticStrings(probe("A", 'const A = "x";'))).toEqual(["x"]);
  });

  it("anything not closed is undefined, never an empty list", () => {
    expect(staticStrings(probe("`a.${k}`"))).toBeUndefined();
    expect(staticStrings(probe('ok ? "a" : name'))).toBeUndefined();
  });
});

describe("declaredTypeImport", () => {
  const recv = (src: string) => {
    const sf = parseSource("svc.ts", src);
    const call = collect(sf, ts.isCallExpression)[0]!;
    return declaredTypeImport((call.expression as ts.PropertyAccessExpression).expression);
  };

  it("a constructor parameter property typed by an import", () => {
    expect(
      recv('import { AuditService } from "./audit.service.js";\nclass S { constructor(private readonly audit: AuditService) {} f() { this.audit.record({}); } }'),
    ).toEqual({ moduleSpecifier: "./audit.service.js", exportedName: "AuditService" });
  });

  it("an aliased import reports the exported name", () => {
    expect(
      recv('import { AuditService as A } from "../admin/audit.service.js";\nclass S { audit!: A; f() { this.audit.record({}); } }'),
    ).toEqual({ moduleSpecifier: "../admin/audit.service.js", exportedName: "AuditService" });
  });

  it("a same-named LOCAL class is not the import", () => {
    expect(recv("class AuditService {}\nclass S { constructor(private audit: AuditService) {} f() { this.audit.record({}); } }")).toBeUndefined();
  });
});
