import { existsSync, readFileSync, readdirSync } from "node:fs";
import { basename, join, sep } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * No surface works out an invoice balance by hand.
 *
 * ## The defect this exists to stop coming back
 *
 * `invoiceSettlement` in core was right the whole time. Six surfaces did the
 * subtraction themselves — and `total - paid` is the wrong sum on any contract
 * with a retention clause, because retention is money the client keeps under the
 * terms rather than money they owe. All six were wrong in the same direction:
 *
 * - the PDF the client reads asked for the retained amount
 * - so did its covering email, by construction, because they shared the helper
 * - the card-payment checkout charged it
 * - a fully-settled invoice was flipped OVERDUE and chased in the nightly digest
 *
 * The word "retention" appeared **nowhere** in `InvoicePdf.tsx`.
 *
 * This is the fifth time in this codebase that a correct helper was bypassed by
 * the screen that needed it, so the guard is on the SHAPE of the mistake rather
 * than on any one file: nothing outside core may subtract a paid amount from a
 * total.
 */

const WEB = process.cwd();

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === ".next" || entry.name.startsWith("."))
      continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) sourceFiles(full, out);
    else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) out.push(full);
  }
  return out;
}

const stripComments = (src: string): string =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

/**
 * A balance worked out by hand.
 *
 * Matches `totalCents - paidCents` however it is spelled — `x.totalCents -
 * y.paidCents`, `totals.totalCents - invoice.paidCents`, with or without spaces.
 */
const HAND_ROLLED_BALANCE = /\btotalCents\s*-\s*(?:[\w.]*\.)?paidCents\b/;

/** The reverse spelling, which is the same mistake with the operands swapped. */
const HAND_ROLLED_REVERSE = /\bpaidCents\s*-\s*(?:[\w.]*\.)?totalCents\b/;

const files = sourceFiles(join(WEB, "lib"))
  .concat(sourceFiles(join(WEB, "app")))
  .concat(sourceFiles(join(WEB, "components")))
  .map((file) => ({
    file: file.slice(WEB.length + 1).split(sep).join("/"),
    src: stripComments(readFileSync(file, "utf8")),
  }));

describe("invoice balances come from core, not from arithmetic on a screen", () => {
  it("finds the source files, so a move cannot empty this guard", () => {
    expect(files.length).toBeGreaterThan(50);
  });

  it("no file subtracts paidCents from totalCents", () => {
    const offenders = files
      .filter((f) => HAND_ROLLED_BALANCE.test(f.src) || HAND_ROLLED_REVERSE.test(f.src))
      .map((f) => f.file);
    // Use `settlementOf` from core. It returns dueNowCents, heldCents and
    // outstandingCents, and the one you want on a client-facing document is
    // outstandingCents — with heldCents shown beside it, not silently dropped.
    expect(offenders).toEqual([]);
  });

  it("the pattern it looks for actually matches, so a passing run means something", () => {
    // Without this, a typo in the regex would make every assertion above green.
    expect(HAND_ROLLED_BALANCE.test("const b = totals.totalCents - invoice.paidCents;")).toBe(true);
    expect(HAND_ROLLED_BALANCE.test("totalCents-paidCents")).toBe(true);
    expect(HAND_ROLLED_REVERSE.test("i.paidCents - i.totalCents")).toBe(true);
    // And does not fire on the legitimate shapes.
    expect(HAND_ROLLED_BALANCE.test("settlementOf(invoice).outstandingCents")).toBe(false);
    expect(HAND_ROLLED_BALANCE.test("totalCents - discountCents")).toBe(false);
  });
});

describe("the client-facing document states retention rather than hiding it", () => {
  const pdf = readFileSync(join(WEB, "lib", "pdf", "InvoicePdf.tsx"), "utf8");

  it("the invoice PDF mentions retention at all", () => {
    // It did not. A client seeing a smaller "amount due" with no explanation
    // reads it as an error in their favour and queries it — or worse, does not.
    expect(pdf).toMatch(/[Rr]etention/);
  });

  it("the invoice PDF resolves its balance through core", () => {
    expect(stripComments(pdf)).toContain("settlementOf(");
  });

  it("the covering email resolves it the same way", () => {
    // These two must never disagree: the client reads the email and opens the
    // attachment, and two figures for one debt is two invoices.
    const route = join(WEB, "app", "(app)", "invoices", "[id]", "email", "route.ts");
    expect(existsSync(route), `expected ${basename(route)} to exist`).toBe(true);
    expect(stripComments(readFileSync(route, "utf8"))).toContain("settlementOf(");
  });
});
