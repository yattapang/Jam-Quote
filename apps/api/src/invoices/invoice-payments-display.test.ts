import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The payment history a contractor sees is cash that ARRIVED.
 *
 * `startCardPayment` writes a `pending` Payment row for the full invoice balance,
 * with `paidAt` defaulting to now, the moment a WiPay checkout is opened. If the
 * client abandons the page that row is never upgraded and never removed.
 *
 * The `payments-received` export was fixed to exclude those. The invoice DETAIL
 * read was not, so the panel rendered "CARD $500,000.00" in money-in green, with a
 * Void button, directly above a Paid figure of $0.00 — and disagreed with the
 * download link on the same screen. An independent review found it after the
 * export fix was already committed as complete.
 *
 * Asserted by reading the include, because a fake Prisma returns what the fake
 * says and ignores the `where` entirely — the same reason the export's filter is
 * asserted on its query.
 */
describe("the invoice payment history shows only cash that arrived", () => {
  const src = readFileSync(
    join(process.cwd(), "src", "invoices", "invoices.service.ts"),
    "utf8",
  );

  it("filters the payments include on the shared collected-status list", () => {
    const at = src.indexOf("payments: {");
    expect(at, "the detail include should carry payment history").toBeGreaterThan(-1);
    const block = src.slice(at, src.indexOf("},", at));
    expect(block).toContain("COLLECTED_PAYMENT_STATUSES");
  });

  it("uses the SAME list as the export and the Reports page", () => {
    // Three surfaces, one list, imported from core. A fourth copy is how the
    // export and the Reports page came to disagree in the first place.
    expect(src).toContain("COLLECTED_PAYMENT_STATUSES");
    expect(src).not.toMatch(/status:\s*\{\s*in:\s*\[/);
  });

  it("still keeps paidCents as the authority for the total", () => {
    // The list is what the total is made OF; it must not become the total. paidCents
    // is incremented only by a verified payment, so the two agree by construction.
    expect(src).toContain("paidCents");
  });
});
