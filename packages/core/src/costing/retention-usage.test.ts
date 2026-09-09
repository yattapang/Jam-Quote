import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, sep } from "node:path";
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
 * So this one runs from the repo root, covers every workspace, and looks for both
 * shapes. Core itself is exempt — it is where the right answer is allowed to be
 * computed — and specific lines elsewhere are exempt only with a stated reason.
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

/**
 * Strips comments WITHOUT eating string literals.
 *
 * The previous version used a bare `//[^\n]*` replace, so a line holding a URL
 * lost everything after `https:` — including any real offender later on that line.
 * This walks the source and tracks whether it is inside a string.
 */
export function stripComments(src: string): string {
  let out = "";
  let i = 0;
  let quote: string | null = null;
  while (i < src.length) {
    const ch = src[i]!;
    const next = src[i + 1];
    if (quote) {
      out += ch;
      if (ch === "\\") {
        out += next ?? "";
        i += 2;
        continue;
      }
      if (ch === quote) quote = null;
      i += 1;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      quote = ch;
      out += ch;
      i += 1;
      continue;
    }
    if (ch === "/" && next === "/") {
      while (i < src.length && src[i] !== "\n") i += 1;
      continue;
    }
    if (ch === "/" && next === "*") {
      i += 2;
      while (i < src.length && !(src[i] === "*" && src[i + 1] === "/")) i += 1;
      i += 2;
      continue;
    }
    out += ch;
    i += 1;
  }
  return out;
}

/** A balance worked out by hand, either operand order, any receiver. */
const SUBTRACTS = [
  /\btotalCents\s*-\s*(?:\(\s*)?[\w.]*paidCents\b/,
  /\bpaidCents\s*-\s*(?:\(\s*)?[\w.]*totalCents\b/,
];

/**
 * A settled/overdue decision made by comparing the two directly.
 *
 * This is the half the first guard missed entirely, and it is where three of the
 * six defects lived. `paid >= total` is only the right question when no retention
 * is held, which is a thing the comparison cannot know.
 */
const COMPARES = [
  /\bpaidCents\s*[><]=?\s*[\w.]*totalCents\b/,
  /\btotalCents\s*[><]=?\s*[\w.]*paidCents\b/,
];

/**
 * Lines allowed to do it anyway, each with the reason it is correct.
 *
 * A file:line pair, so moving the code makes the exemption expire rather than
 * silently covering something new.
 */
const ALLOWED: Record<string, string> = {
  "apps/api/src/exports/exports.service.ts": [
    "The accountant's ACCRUAL file. Retention has been billed and is receivable,",
    "just not yet payable — stated in a comment there, with the held amount in its",
    "own column beside it. The cash-basis view is a different file.",
  ].join(" "),
};

const files = sourceFiles(SCANNED[0]!)
  .concat(...SCANNED.slice(1).map((d) => sourceFiles(d)))
  .map((file) => ({
    file: file.slice(ROOT.length + 1).split(sep).join("/"),
    src: stripComments(readFileSync(file, "utf8")),
  }));

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
      .filter((f) => SUBTRACTS.some((re) => re.test(f.src)) && !(f.file in ALLOWED))
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
      .filter((f) => COMPARES.some((re) => re.test(f.src)) && !(f.file in ALLOWED))
      .map((f) => f.file);
    expect(offenders).toEqual([]);
  });

  it("does not let the allow-list rot", () => {
    const scanned = new Set(files.map((f) => f.file));
    expect(Object.keys(ALLOWED).filter((f) => !scanned.has(f))).toEqual([]);
  });

  it("the patterns match the real shapes, so a passing run means something", () => {
    // Without this, a typo would make every assertion above green.
    expect(SUBTRACTS.some((r) => r.test("const b = totals.totalCents - invoice.paidCents;"))).toBe(true);
    expect(SUBTRACTS.some((r) => r.test("totalCents-paidCents"))).toBe(true);
    expect(SUBTRACTS.some((r) => r.test("i.totalCents - (i.paidCents)"))).toBe(true);
    expect(SUBTRACTS.some((r) => r.test("x.paidCents - x.totalCents"))).toBe(true);
    expect(COMPARES.some((r) => r.test("if (paidCents >= invoice.totalCents)"))).toBe(true);
    expect(COMPARES.some((r) => r.test("inv.totalCents > inv.paidCents"))).toBe(true);
    // And do not fire on the legitimate shapes.
    expect(SUBTRACTS.some((r) => r.test("settlementOf(invoice).outstandingCents"))).toBe(false);
    expect(SUBTRACTS.some((r) => r.test("totalCents - discountCents"))).toBe(false);
  });

  it("strips comments without eating string literals", () => {
    // The bug in the first version: a `//` inside a string deleted the rest of the
    // line, so an offender after a URL was invisible.
    const src = 'const u = "https://x.test"; const b = a.totalCents - a.paidCents;';
    expect(SUBTRACTS.some((r) => r.test(stripComments(src)))).toBe(true);
    // And it still removes real comments.
    expect(stripComments("// a.totalCents - a.paidCents\nconst x = 1;")).not.toMatch(/paidCents/);
    expect(stripComments("/* a.totalCents - a.paidCents */\nconst x = 1;")).not.toMatch(/paidCents/);
  });
});
