import { describe, expect, it } from "vitest";
import { COLLECTED_PAYMENT_STATUSES } from "@jamquote/core";
import { INVOICE_DETAIL_INCLUDE } from "./invoices.service.js";

/**
 * The payment history a contractor sees is cash that ARRIVED.
 *
 * `startCardPayment` writes a `pending` Payment row for the full invoice balance,
 * `paidAt` defaulting to now, the moment a WiPay checkout is opened. Abandon the
 * page and that row is never upgraded and never removed.
 *
 * The `payments-received` export was fixed to exclude those; the invoice DETAIL
 * read was not. So the panel rendered "CARD $500,000.00" in money-in green, with a
 * Void button, directly above a Paid figure of $0.00 — disagreeing with the
 * download link on the same screen.
 *
 * ## Why this asserts the object and not the source
 *
 * The first version of this test read the file and checked that
 * `COLLECTED_PAYMENT_STATUSES` appeared inside the `payments:` block. A reviewer
 * deleted the filter, left a comment mentioning the constant, and **all three
 * tests passed** — one of them satisfied by the IMPORT line alone. That is
 * verbatim the failure PLANNING.md records under "a guard satisfied by an import
 * line rather than a call", reintroduced in the commit that cites it.
 *
 * So the include is exported and asserted structurally. No file reading, no
 * dependence on vitest's cwd, and nothing a comment can satisfy.
 */
describe("the invoice payment history shows only cash that arrived", () => {
  it("filters the payments include on the shared collected-status list", () => {
    expect(INVOICE_DETAIL_INCLUDE.payments.where).toEqual({
      deletedAt: null,
      status: { in: COLLECTED_PAYMENT_STATUSES },
    });
  });

  it("uses the shared list itself, not a copy of its contents", () => {
    // Identity, not equality. A local `["completed", "recorded"]` would satisfy a
    // deep-equal check and then drift the moment the shared list changed — which
    // is how the export and the Reports page came to disagree in the first place.
    expect(INVOICE_DETAIL_INCLUDE.payments.where.status.in).toBe(COLLECTED_PAYMENT_STATUSES);
  });

  it("still returns the history newest-first", () => {
    // "Did the latest one land?" is the question, so the order is part of the
    // answer and worth keeping while the where-clause is being changed.
    expect(INVOICE_DETAIL_INCLUDE.payments.orderBy).toEqual({ paidAt: "desc" });
  });
});
