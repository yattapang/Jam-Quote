import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * A source guard over the staff console.
 *
 * The console was largely a design mock with a few real values threaded in. It
 * fell back to invented tenant rows whenever a section failed to load, showed
 * a hardcoded MRR that was never real, a 12-month revenue series with no data
 * source, five fictional signups and four fabricated system alerts. In a
 * console used to decide who to suspend and what to bill, invented figures are
 * worse than an outage: they are actionable and they look authoritative.
 *
 * This cannot be caught by a behaviour test — the fake values were valid
 * TypeScript and rendered perfectly. So the invariant is enforced over source
 * text: the specific fabrications must not come back, and if a new mock is
 * added it should trip the "recognisable placeholder" check.
 */
const SOURCE = readFileSync(join(__dirname, "AdminConsole.tsx"), "utf8");

/** Comments explain what was removed and why — strip them before scanning. */
const CODE = SOURCE.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

describe("the staff console shows no invented data", () => {
  it("has no hardcoded platform figures", () => {
    // Each of these was rendered to staff as though it were measured.
    for (const fabricated of ["2418540", "1,284", "108,420", '"892"', "1.9%"]) {
      expect(CODE).not.toContain(fabricated);
    }
  });

  it("invents nothing in the tenant drawer", () => {
    // The drawer is where staff decide whether to suspend or bill a business,
    // so invented figures here are the most expensive kind. It used to carry
    // seat counts and quota caps derived from a plan-name lookup, storage
    // usage, "invoices sent" as quotes x 0.6, a hardcoded per-plan price
    // table, and fixed started/renews dates with a payment rail.
    for (const fabricated of [
      '"2.1 / 10 GB"',
      "2024-08-19",
      "2025-05-19",
      '"Lynk"',
      "q * 0.6",
      "Starter: 4900",
    ]) {
      expect(CODE).not.toContain(fabricated);
    }
  });

  it("has no platform supplier directory left", () => {
    // Suppliers became tenant-owned in #31. What remained was a dead
    // /admin/suppliers fetch that 404'd on every admin page load, and a
    // "Suppliers added" tile implying the platform maintains them.
    expect(CODE).not.toContain("Suppliers added");
  });

  it("has no fictional tenant names", () => {
    for (const name of [
      "Blue Mountain Builders",
      "Reef & Rock Masonry",
      "Portmore Concrete",
      "Yallahs Roofing",
      "Spanish Town Steelworks",
      "Ocho Rios Renovations",
    ]) {
      expect(CODE).not.toContain(name);
    }
  });

  it("keeps no *Mock fallback arrays", () => {
    // The fallback is what made a failed fetch indistinguishable from real
    // data. Empty must be allowed to render as empty.
    expect(CODE).not.toMatch(/const \w*Mock\w*\s*[:=]/);
  });

  it("tells the viewer when a section failed to load", () => {
    // With the mocks gone, silence would make "could not reach the API" look
    // identical to "this platform has no tenants".
    expect(CODE).toContain("data.failed");
  });
});

/**
 * The classes of dishonesty, not the historical strings.
 *
 * A review showed the assertions above are five denylists of figures already deleted
 * plus a naming-convention check — they can only re-detect the exact past defect. They
 * passed green alongside a lifetime quote count labelled "This month", a status pill
 * that could only ever say "Active", an unconditional "Verified ✓", and a fake search
 * box. Every original fabrication was written as a literal inlined at its render site,
 * which matches no pattern here and declares no `const`.
 *
 * So these assert the SHAPE of each defect. Each one fails on the version of this file
 * from before the fix, which is the only test of a guard worth having.
 */
/**
 * Reads the open tag a character offset sits inside — `<button ... >` with all of
 * its attributes, and nothing else.
 *
 * ## Why this is parsed rather than sniffed
 *
 * The first version of these assertions looked for evidence in a WINDOW of
 * characters around the match. A review defeated three of the four by hand: it
 * re-added `cursor: "pointer"` to the dead filter pills, dropped a handler-less
 * `<input disabled={true} />` above them, and the suite went green — the evidence
 * does not even have to be on the same element. In a file of this size a generous
 * window makes almost every position pre-satisfied, so a proximity check reports on
 * the file's average density rather than on the element in front of it.
 *
 * Returns null when the offset is not inside a tag (a style factory, a plain
 * object), which the callers treat as "not an element, not this guard's business".
 */
function enclosingOpenTag(src: string, index: number): string | null {
  let open = -1;
  for (let i = index; i >= 0; i--) {
    const ch = src[i];
    if (ch === ">") return null; // a tag closed before one opened: not inside a tag
    if (ch === "<" && /[A-Za-z]/.test(src[i + 1] ?? "")) {
      open = i;
      break;
    }
  }
  if (open < 0) return null;

  let depth = 0;
  let quote: string | null = null;
  for (let i = open; i < src.length; i++) {
    const ch = src[i]!;
    if (quote) {
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") quote = ch;
    else if (ch === "{") depth++;
    else if (ch === "}") depth--;
    else if (ch === ">" && depth === 0) return src.slice(open, i + 1);
  }
  return null;
}

/**
 * The `{...}` expression an offset sits in, with NESTED braces blanked out.
 *
 * The same review defeated the badge assertion by wrapping an unconditional badge in
 * `<span style={{ marginLeft: c.label ? 4 : 0 }}>`: a `?` in a style object is not a
 * condition on the badge, but any check for a nearby `?` accepts it. Blanking nested
 * braces means only a ternary at the top level of the enclosing expression counts.
 */
function enclosingExpression(src: string, index: number): string | null {
  let depth = 0;
  let open = -1;
  for (let i = index; i >= 0; i--) {
    if (src[i] === "}") depth++;
    else if (src[i] === "{") {
      if (depth === 0) {
        open = i;
        break;
      }
      depth--;
    }
  }
  if (open < 0) return null;

  let close = -1;
  depth = 0;
  for (let i = open + 1; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") {
      if (depth === 0) {
        close = i;
        break;
      }
      depth--;
    }
  }
  if (close < 0) return null;

  // Blank every nested brace group, keeping offsets so a message can be located.
  let flattened = "";
  depth = 0;
  for (const ch of src.slice(open + 1, close)) {
    if (ch === "{") depth++;
    flattened += depth === 0 ? ch : " ";
    if (ch === "}") depth--;
  }
  return flattened;
}

/** Words that make a label a claim about a QUERY, not just about a number. */
const WINDOW_WORD =
  /\b(this month|last month|today|this week|this year|ytd|year to date|mtd|per month|monthly)\b/i;

describe("the console cannot claim a figure it does not have", () => {
  // Comments stripped first. The badge assertion matched its own explanatory
  // comment — the text it was written to police appears in the note describing the
  // defect, which is a false positive a guard should not have.
  const src = SOURCE.replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "")
    .replace(/^\s*\/\/[^\n]*$/gm, "");

  /** Labels allowed a window, each because the query behind it really applies one. */
  const WINDOWED_OK: Record<string, string> = {
    "Quotes created (all time)":
      "names its own window, and the window it names is the one the query uses",
  };

  it("no metric is labelled with a time window the query does not apply", () => {
    // A class, not a denylist. The first version listed four exact strings
    // (`"This month"`, `"Today"`, …) and a review immediately found a live survivor
    // it had not listed: `label: "Applied (YTD)"`, over a query with no date
    // predicate at all. Hand-listing the cases is the defect this register keeps
    // finding, and a guard written that way finds only what its author remembered.
    const labels = [...src.matchAll(/label:\s*"([^"]+)"/g)].map((m) => m[1]!);
    // Positive control: a guard that found no labels proves nothing, and a rename of
    // the `label:` key would otherwise empty this silently.
    expect(labels.length, "found no metric labels — has the shape changed?").toBeGreaterThan(8);

    const offenders = labels.filter((l) => WINDOW_WORD.test(l) && !(l in WINDOWED_OK));
    expect(
      offenders,
      "a window in a label is a claim about the query: either window the query or drop the word",
    ).toEqual([]);
  });

  it("every verification claim is derived, not asserted", () => {
    // It read `<span style={verified}>Verified ✓</span>` unconditionally, beneath a
    // banner saying nobody had confirmed the figures. A literal verification claim
    // in JSX must sit in a ternary at the top level of its own expression.
    const claims = [...src.matchAll(/>\s*(Verified|Code-owned)\b[^<]*</g)];
    expect(claims.length, "found no verification badges — were they renamed?").toBeGreaterThan(0);

    for (const m of claims) {
      const region = enclosingExpression(src, m.index!);
      expect(
        region ?? "",
        `"${m[0]!.trim()}" is a literal verification claim; derive it or make it conditional`,
      ).toMatch(/\?|&&/);
    }
  });

  it("does not read Subscription.status, which is only ever written 'active'", () => {
    // Three of the four branches of the old statusMap were unreachable, and its
    // fallback asserted a healthy green account for anything it did not recognise.
    // Asserting on the FIELD rather than on the names of its consumers: the column
    // used to be carried in TenantRow and discarded with `void status`, which passed
    // a name-based check while leaving the field one edit from being read again.
    expect(src, "the tenant row must not carry Subscription.status at all").not.toMatch(
      /t\.status\b/,
    );
    expect(src, "a discarded field is still a plumbed field").not.toMatch(/void status/);
    // And the honest source is still in use, so this cannot pass by deleting both.
    expect(src).toContain("subscriptionStanding(");
  });

  it("nothing that looks clickable lacks a handler", () => {
    // The tenant filter pills carried `cursor: "pointer"` and no onClick, so "Past
    // due (3)" looked like a filter and did nothing.
    const pointers = [...src.matchAll(/cursor:\s*"pointer"/g)];
    expect(pointers.length, "no pointer cursors found at all — check the pattern").toBeGreaterThan(
      0,
    );

    for (const m of pointers) {
      const tag = enclosingOpenTag(src, m.index!);
      // Not inside a tag: a style factory or a plain object, applied at call sites
      // this guard cannot see. Out of scope — the defect was a pointer cursor in an
      // INLINE style on an element with no handler of its own.
      if (tag === null) continue;
      // A <label> wrapping a form control is a real affordance — clicking it
      // activates the control — but only if it actually contains one. Checked
      // rather than allow-listed by tag name: an empty <label> with a pointer
      // cursor is exactly the lie this guard is written for.
      if (tag.startsWith("<label")) {
        const close = src.indexOf("</label>", m.index!);
        const body = close < 0 ? "" : src.slice(m.index!, close);
        if (/<(input|select|textarea)\b/.test(body)) continue;
      }
      if (tag === null) continue;
      expect(tag, `this element promises a click it cannot honour: ${tag.slice(0, 90)}…`).toMatch(
        /onClick|href=|<(a|button|Link|select|input|textarea)\b/,
      );
    }
  });
});

describe("the guards above are not satisfied by evidence elsewhere", () => {
  // The defeats a review demonstrated against the proximity versions, kept as
  // tests. Each of these passed the old check, and each is the real defect.

  it("a pointer cursor is not excused by a disabled element nearby", () => {
    const src = [
      '<input disabled={true} value="" readOnly />',
      '<div style={{ padding: 7, cursor: "pointer" }}>Past due (3)</div>',
    ].join("\n");
    const tag = enclosingOpenTag(src, src.indexOf('cursor: "pointer"'));
    expect(tag).toContain("<div");
    expect(tag).not.toMatch(/onClick|href=|<(a|button|Link|select|input|textarea)\b/);
  });

  it("an empty label is not excused, a label around a checkbox is", () => {
    const CONTROL = /<(input|select|textarea)\b/;
    expect(CONTROL.test('<label style={{ cursor: "pointer" }}>Past due</label>')).toBe(false);
    expect(
      CONTROL.test(
        '<label style={{ cursor: "pointer" }}><input type="checkbox" onChange={t} />Cap</label>',
      ),
    ).toBe(true);
  });

  it("a pointer cursor IS excused by a handler on its own tag", () => {
    const src = '<button style={{ cursor: "pointer" }} onClick={go}>Go</button>';
    expect(enclosingOpenTag(src, src.indexOf('cursor: "pointer"'))).toMatch(/onClick/);
  });

  it("a badge is not made conditional by a ternary in its style", () => {
    const src =
      '<span style={{ marginLeft: c.label ? 4 : 0 }}><span style={v}>Verified ✓</span></span>';
    // The nested style ternary is blanked, so the region holds no condition.
    expect(enclosingExpression(src, src.search(/>\s*Verified/)) ?? "").not.toMatch(/\?|&&/);
  });

  it("a badge IS conditional when the ternary is its own", () => {
    const src =
      "<td>{p.verified ? <span style={v}>Verified ✓</span> : <span>Unverified</span>}</td>";
    expect(enclosingExpression(src, src.search(/>\s*Verified/)) ?? "").toMatch(/\?/);
  });

  it("a window word is caught however it is spelled", () => {
    for (const label of ["This month", "Applied (YTD)", "Signups today", "Revenue monthly"]) {
      expect(WINDOW_WORD.test(label), label).toBe(true);
    }
    expect(WINDOW_WORD.test("Quotes created (all time)")).toBe(false);
  });
});
