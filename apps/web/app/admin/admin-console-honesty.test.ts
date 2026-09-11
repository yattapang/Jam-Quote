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
  return tagAt(src, open);
}

/** The whole open tag beginning at `open`, brace- and quote-aware. */
function tagAt(src: string, open: number): string | null {
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

/** The value of one JSX attribute on an open tag: `{...}` contents, or a quoted string. */
function attribute(tag: string, name: string): string | null {
  const at = tag.search(new RegExp(`\\s${name}\\s*=`));
  if (at < 0) return null;
  const eq = tag.indexOf("=", at);
  let i = eq + 1;
  while (i < tag.length && /\s/.test(tag[i]!)) i++;
  if (tag[i] === '"' || tag[i] === "'") {
    const quote = tag[i]!;
    const end = tag.indexOf(quote, i + 1);
    return end < 0 ? null : tag.slice(i + 1, end);
  }
  if (tag[i] !== "{") return null;
  let depth = 0;
  for (let j = i; j < tag.length; j++) {
    if (tag[j] === "{") depth++;
    else if (tag[j] === "}") {
      depth--;
      if (depth === 0) return tag.slice(i + 1, j);
    }
  }
  return null;
}

/**
 * Is this `<a>` tag a link that goes nowhere and does nothing?
 *
 * ## Why this parses the handler instead of matching it
 *
 * The first version was one regex —
 * `/href="#"[^>]*onClick=\{\(e\) => e\.preventDefault\(\)\}/` — and a review broke
 * it eight ways without changing the defect at all: deleting the spaces around the
 * arrow, dropping the parens on the parameter, typing the parameter, putting the
 * body in braces (the exact form the comment claimed to target), swapping the
 * attribute order, writing `href={"#"}`, writing `href=""`, or leaving `href` off
 * entirely. A guard that only recognises one spelling of a defect polices
 * formatting, not behaviour.
 *
 * So: an anchor is dead when it leads nowhere AND its click handler, with every
 * `preventDefault()` / `stopPropagation()` / `void 0` removed, has nothing left.
 */
function deadAnchor(tag: string): boolean {
  if (!/^<a[\s>]/.test(tag)) return false;

  const href = attribute(tag, "href");
  const leadsNowhere =
    href === null || ["#", "", '"#"', "'#'", "javascript:void(0)"].includes(href.trim());
  if (!leadsNowhere) return false;

  const onClick = attribute(tag, "onClick");
  if (onClick === null) return true; // nowhere to go and nothing to do

  const body = onClick
    .replace(/^\s*(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>\s*/, "") // strip the arrow head
    .replace(/^\s*\{|\}\s*$/g, "") // and a braced body
    .replace(/\b(?:e|ev|evt|event)\s*\.\s*(?:preventDefault|stopPropagation)\s*\(\s*\)/g, "")
    .replace(/\bvoid\s+0\b/g, "")
    .replace(/[\s;]/g, "");
  return body === "";
}

/**
 * Is this JSX text child a figure nobody counted?
 *
 * The Regulatory nav badge was a hardcoded `3`, one line from the real count. The
 * first guard was `/>[ ]*\d{1,6}[ ]*</`, which a review walked straight past with
 * `>{3}<`, with a newline before the digit, and with `>{"3"}<`. Normalising first
 * means the shape of the whitespace and the quoting stop mattering.
 */
function literalCount(text: string): boolean {
  const bare = text
    .trim()
    .replace(/^\{|\}$/g, "")
    .trim()
    .replace(/^["'`]|["'`]$/g, "")
    .trim();
  return /^\d{1,6}$/.test(bare);
}

/** Every JSX text child in the source: the runs between `>` and the next `<`. */
function textChildren(src: string): { text: string; index: number }[] {
  const out: { text: string; index: number }[] = [];
  for (const m of src.matchAll(/>([^<>]*)</g)) {
    const text = m[1]!;
    if (text.trim() !== "") out.push({ text, index: m.index! + 1 });
  }
  return out;
}

/**
 * The argument list of every call to `name(`, split at top level.
 *
 * Written because a regex could not do it. The currency guard was
 * `/formatPlatformMoney\([^)]*,\s*["'`]/` and a review defeated it by putting a call
 * inside the first argument: `formatPlatformMoney(Number(r.amountCents), "JMD")`.
 * `[^)]*` cannot cross the `)` of `Number(...)`, so the match never reached the
 * second argument, and a hardcoded JMD on the bank-reconciled payment ledger — the
 * precise defect the assertion exists for — passed again.
 *
 * That was the second time I fixed the spelling I had tried rather than the class.
 * Paren-, brace- and quote-aware splitting has no such edge.
 */
function callArguments(src: string, name: string): string[][] {
  const calls: string[][] = [];
  for (let at = src.indexOf(`${name}(`); at >= 0; at = src.indexOf(`${name}(`, at + 1)) {
    // Not a definition or a longer identifier ending in the same letters.
    const before = src[at - 1] ?? " ";
    if (/[A-Za-z0-9_$.]/.test(before) && before !== ".") continue;

    const open = at + name.length;
    let depth = 0;
    let quote: string | null = null;
    let current = "";
    const args: string[] = [];
    for (let i = open; i < src.length; i++) {
      const ch = src[i]!;
      if (quote) {
        current += ch;
        if (ch === quote && src[i - 1] !== "\\") quote = null;
        continue;
      }
      if (ch === '"' || ch === "'" || ch === "`") {
        quote = ch;
        current += ch;
        continue;
      }
      if (ch === "(" || ch === "[" || ch === "{") {
        depth++;
        if (depth > 1) current += ch;
        continue;
      }
      if (ch === ")" || ch === "]" || ch === "}") {
        depth--;
        if (depth === 0) {
          args.push(current.trim());
          break;
        }
        current += ch;
        continue;
      }
      if (ch === "," && depth === 1) {
        args.push(current.trim());
        current = "";
        continue;
      }
      current += ch;
    }
    calls.push(args.filter((a) => a !== ""));
  }
  return calls;
}

/** Is this argument a string literal rather than an expression? */
const isStringLiteral = (arg: string): boolean => /^["'`]/.test(arg.trim());

/**
 * The keys at the TOP level of an object literal, with nested objects ignored.
 *
 * `statutoryRetired` inside `...(touched ? { statutoryRetired } : {})` is nested and
 * therefore conditional; the same key written flat is unconditional. The previous
 * guard asserted only that the string `rpContributionsTouched` appeared SOMEWHERE in
 * the file — and it appears in its own `useState` line and in both setter wrappers,
 * so a review reinstated the unconditional send and the suite stayed green. Failure
 * mode (b), on the assertion written to prevent failure mode (b).
 */
function topLevelKeys(objectLiteral: string): string[] {
  const keys: string[] = [];
  let depth = 0;
  let quote: string | null = null;
  let line = "";
  for (let i = 0; i < objectLiteral.length; i++) {
    const ch = objectLiteral[i]!;
    if (quote) {
      if (ch === quote && objectLiteral[i - 1] !== "\\") quote = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      quote = ch;
      continue;
    }
    if (ch === "(" || ch === "[" || ch === "{") {
      depth++;
      continue;
    }
    if (ch === ")" || ch === "]" || ch === "}") {
      depth--;
      continue;
    }
    if (depth === 0) {
      if (ch === ",") {
        line = "";
        continue;
      }
      if (ch === ":") {
        const key = /([A-Za-z_$][\w$]*)\s*$/.exec(line)?.[1];
        if (key) keys.push(key);
        line = "";
        continue;
      }
      line += ch;
    }
  }
  return keys;
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

  /** Every open tag in the file, parsed once. */
  const tags: string[] = [];
  for (const m of src.matchAll(/<[A-Za-z]/g)) {
    const tag = tagAt(src, m.index!);
    if (tag) tags.push(tag);
  }

  /** Labels allowed a window, each because the query behind it really applies one. */
  const WINDOWED_OK: Record<string, string> = {
    "Quotes created (all time)":
      "names its own window, and the window it names is the one the query uses",
  };

  it("found its subjects, so nothing below can pass on an empty file", () => {
    // Every assertion in this block scans `src` or `tags`. A rename, a move or a
    // failed read would otherwise empty all of them at once, silently.
    expect(tags.length, "no JSX tags parsed").toBeGreaterThan(200);
    expect(tags.filter((t) => t.startsWith("<a")).length, "no anchors").toBeGreaterThan(0);
    expect(textChildren(src).length, "no text children").toBeGreaterThan(50);
  });

  it("no metric is labelled with a time window the query does not apply", () => {
    // A class, not a denylist. The first version listed four exact strings
    // (`"This month"`, `"Today"`, …) and a review immediately found a live survivor
    // it had not listed: `label: "Applied (YTD)"`, over a query with no date
    // predicate at all. Hand-listing the cases is the defect this register keeps
    // finding, and a guard written that way finds only what its author remembered.
    const labels = [...src.matchAll(/label:\s*"([^"]+)"/g)].map((m) => m[1]!);
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

  it("no link is an anchor to nowhere", () => {
    // Four rule-card "Source ↗" links were `href="#"` with a `preventDefault`-only
    // handler, while the real URL sat in scope and working links were 150 lines
    // above. A staffer clicking "TAJ ↗" to check a tax rate got nothing.
    const dead = tags.filter(deadAnchor);
    expect(
      dead.map((t) => t.slice(0, 120)),
      "an anchor that leads nowhere and does nothing is a dead control: give it the URL or make it text",
    ).toEqual([]);
  });

  it("the deployment badge is derived, not asserted", () => {
    // A green "PRODUCTION" pill with no check behind it, on every build, including a
    // laptop pointed at localhost. On a console whose buttons suspend tenants, that
    // is the one badge that must not be decorative.
    //
    // The word itself must not appear in this file in any form — the first version
    // allowed it outside a `{`, and `>{"PRODUCTION"}` walked past. The label is a
    // prop now, resolved on the server from the same constant every fetch uses.
    expect(src, "PRODUCTION must come from apiEnv, not from a literal here").not.toContain(
      "PRODUCTION",
    );
    expect(src, "the badge must render the resolved environment").toContain("apiEnv.label");
  });

  it("no count is a literal in the markup", () => {
    // The Regulatory nav badge was a hardcoded `3`, one line from `regChanges`: it
    // said "3 waiting" on an empty queue and stayed 3 after a staffer cleared it.
    // Any bare number rendered as element text is a figure nobody counted.
    const offenders = textChildren(src).filter((c) => literalCount(c.text));
    expect(
      offenders.map((c) => c.text.trim()),
      "render a figure from data, or do not render it",
    ).toEqual([]);
  });

  it("no money is rendered in a currency the platform may not be using", () => {
    // All seven money figures went through `formatJmd` while the platform currency
    // was editable free text, so setting it to USD showed a JMD symbol beside the
    // letters USD.
    expect(src, "platform money must spend the configured currency").not.toMatch(
      /formatJmd\(/,
    );

    // The code passed to it must never be a literal. Parsed, not matched: a review
    // defeated the regex version twice, most recently with
    // `formatPlatformMoney(Number(r.amountCents), "JMD")` — a call inside the first
    // argument, which a `[^)]*` pattern cannot see past.
    const calls = callArguments(src, "formatPlatformMoney");
    expect(calls.length, "no formatPlatformMoney calls found — check the name").toBeGreaterThan(2);
    const hardcoded = calls
      .filter((args) => args.length > 1 && isStringLiteral(args[1]!))
      .map((args) => args.join(", "));
    expect(hardcoded, "pass the configured currency, not a literal one").toEqual([]);
  });

  it("no save reports success on a value it dropped", () => {
    // The server reads an absent field as "leave unchanged", so any coercion to
    // `undefined` in a REQUEST PAYLOAD reports "Saved" over a value that never moved.
    //
    // Three spellings have now shipped: `|| undefined`, then `?? undefined` and
    // `|| void 0` after a review, then `x === "" ? undefined : Number(x)` — a
    // ternary, which is how the default tax rate was silently dropped while the
    // `taxLabel` three lines above it had an explicit refusal.
    //
    // Scoped to payloads, because the widened text pattern false-positived on four
    // legitimate uses: `undefined` as a CSS value or a `title` prop is React for "do
    // not set this attribute" and is correct. A guard that cries wolf on correct code
    // gets weakened, which is how the defect comes back.
    const mutators = [...src.matchAll(/^\s{2}(update|create|record|review|delete|promote|revoke|void|run|set)[A-Za-z]*,$/gm)]
      .map((m) => m[0]!.trim().replace(",", ""));
    expect(mutators.length, "no api-client mutators imported — check the import block").toBeGreaterThan(5);

    const offenders: string[] = [];
    for (const fn of mutators) {
      for (const args of callArguments(src, fn)) {
        for (const arg of args) {
          if (!arg.startsWith("{")) continue;
          if (/(?:\|\||\?\?|\?|:)\s*(?:undefined|void\s+0)\s*(?::|,|\}|$)/.test(arg)) {
            offenders.push(`${fn}: ${arg.slice(0, 90)}`);
          }
        }
      }
    }
    expect(
      offenders,
      "refuse the value and name the field instead of turning it into an omission",
    ).toEqual([]);
    // And the refusal says something. Both forms validate in one place, so a new
    // field is checked or it is not sent.
    expect(src).toContain("pricingProblem()");
    expect(src).toContain("rulePackProblem()");
  });

  it("a complete list is sent only when the admin touched it", () => {
    // `statutoryRetired` and `statutoryCustom` are COMPLETE lists: an empty one
    // clears, an absent one leaves alone. Both mistakes are real and both shipped.
    //
    // Omitting when empty made retirement a one-way door. Sending unconditionally
    // destroyed data, because a swallowed read reports empty lists in a 200 and one
    // save then wrote that emptiness over everything stored.
    //
    // Parsed, not grepped. The previous version asserted that the string
    // `rpContributionsTouched` appeared somewhere in the file — and it appears in its
    // own useState line and in both setter wrappers, so a review reinstated the
    // unconditional send and this test stayed green.
    const calls = callArguments(src, "updateAdminRulePack");
    expect(calls.length, "no updateAdminRulePack call found").toBe(1);
    const payload = calls[0]![0]!;
    const flat = topLevelKeys(payload);
    for (const key of ["statutoryRetired", "statutoryCustom"]) {
      expect(
        flat,
        `${key} is sent unconditionally — an empty list CLEARS it, so gate the send`,
      ).not.toContain(key);
      // Still sent somewhere, so this cannot pass by dropping the field entirely,
      // which would restore the one-way door.
      expect(payload, `${key} is not sent at all`).toContain(key);
    }
    expect(payload, "gate the send on whether the admin edited them").toContain(
      "rpContributionsTouched",
    );
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
      expect(tag, `this element promises a click it cannot honour: ${tag.slice(0, 90)}…`).toMatch(
        /onClick|href=|<(a|button|Link|select|input|textarea)\b/,
      );
    }
  });
});

describe("the guards above cannot be walked past", () => {
  // Every bypass a review demonstrated against the earlier versions, kept as a
  // test. These exercise the SAME predicates the block above uses — the previous
  // attempt gave each control test its own private copy of the regex, so editing a
  // guard could not fail its own control.

  it("a dead anchor is caught however it is spelled", () => {
    // Each of these passed the single-regex version unchanged.
    for (const tag of [
      '<a href="#" onClick={(e) => e.preventDefault()}>TAJ</a>',
      '<a href="#" onClick={(e)=>e.preventDefault()}>TAJ</a>',
      '<a href="#" onClick={e => e.preventDefault()}>TAJ</a>',
      '<a href="#" onClick={(e: React.MouseEvent) => e.preventDefault()}>TAJ</a>',
      '<a href="#" onClick={(e) => { e.preventDefault(); }}>TAJ</a>',
      '<a href="#" onClick={() => void 0}>TAJ</a>',
      '<a onClick={(e) => e.preventDefault()} href="#">TAJ</a>',
      '<a href={"#"} onClick={(e) => e.preventDefault()}>TAJ</a>',
      '<a href="" onClick={(e) => e.preventDefault()}>TAJ</a>',
      '<a href="javascript:void(0)">TAJ</a>',
      "<a>TAJ</a>",
    ]) {
      expect(deadAnchor(tagAt(tag, 0)!), tag).toBe(true);
    }
  });

  it("a working anchor is not caught", () => {
    for (const tag of [
      // A real in-page navigation keeps its anchor and its preventDefault.
      '<a href="#" onClick={(e) => { e.preventDefault(); go("tenants"); }}>View all</a>',
      '<a href={c.sourceUrl} target="_blank" rel="noopener noreferrer">Source ↗</a>',
      '<a href="https://www.jamaicatax.gov.jm/gct">TAJ ↗</a>',
    ]) {
      expect(deadAnchor(tagAt(tag, 0)!), tag).toBe(false);
    }
    // And a non-anchor is none of this guard's business.
    expect(deadAnchor('<button onClick={go}>Go</button>')).toBe(false);
  });

  it("a literal count is caught however it is written", () => {
    for (const text of ["3", " 3 ", "{3}", '{"3"}', "{`3`}", "\n  3\n", "\t3\t", "1234567890"]) {
      // The last one is longer than six digits, so it is NOT a count — a phone
      // number or an id. Everything else is.
      expect(literalCount(text), JSON.stringify(text)).toBe(text !== "1234567890");
    }
  });

  it("a rendered expression is not a literal count", () => {
    for (const text of ["{needsReviewCount}", "{regChanges.length}", "3 waiting", "{String(q)}"]) {
      expect(literalCount(text), text).toBe(false);
    }
  });

  it("a pointer cursor is not excused by a disabled element nearby", () => {
    const snippet = [
      '<input disabled={true} value="" readOnly />',
      '<div style={{ padding: 7, cursor: "pointer" }}>Past due (3)</div>',
    ].join("\n");
    const tag = enclosingOpenTag(snippet, snippet.indexOf('cursor: "pointer"'));
    expect(tag).toContain("<div");
    expect(tag).not.toMatch(/onClick|href=|<(a|button|Link|select|input|textarea)\b/);
  });

  it("a pointer cursor IS excused by a handler on its own tag", () => {
    const snippet = '<button style={{ cursor: "pointer" }} onClick={go}>Go</button>';
    expect(enclosingOpenTag(snippet, snippet.indexOf('cursor: "pointer"'))).toMatch(/onClick/);
  });

  it("a badge is not made conditional by a ternary in its style", () => {
    const snippet =
      '<span style={{ marginLeft: c.label ? 4 : 0 }}><span style={v}>Verified ✓</span></span>';
    // The nested style ternary is blanked, so the region holds no condition.
    expect(enclosingExpression(snippet, snippet.search(/>\s*Verified/)) ?? "").not.toMatch(/\?|&&/);
  });

  it("a badge IS conditional when the ternary is its own", () => {
    const snippet =
      "<td>{p.verified ? <span style={v}>Verified ✓</span> : <span>Unverified</span>}</td>";
    expect(enclosingExpression(snippet, snippet.search(/>\s*Verified/)) ?? "").toMatch(/\?/);
  });

  it("a window word is caught however it is spelled", () => {
    for (const label of ["This month", "Applied (YTD)", "Signups today", "Revenue monthly"]) {
      expect(WINDOW_WORD.test(label), label).toBe(true);
    }
    expect(WINDOW_WORD.test("Quotes created (all time)")).toBe(false);
  });
});
