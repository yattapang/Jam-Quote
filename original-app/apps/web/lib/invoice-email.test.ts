import { describe, it, expect } from "vitest";
import { buildInvoiceEmail, LOGO_CID } from "./invoice-email";
import { escapeHtml } from "./escape-html";
import { settlementOf } from "@jamquote/core";

/**
 * What a client-facing document should ASK FOR.
 *
 * This used to test `invoiceBalanceCents(total, paid)`, which is the wrong sum on
 * any contract with a retention clause — and the PDF and the covering email both
 * used it. On a $100,000 invoice with 10% held and $90,000 paid, the app's own
 * screens said "fully paid apart from retention" while the document in the
 * client's hand asked for $10,000 of money the contract says they keep.
 *
 * `invoiceBalanceCents` is gone rather than deprecated. A helper that computes a
 * plausible-looking wrong figure is worse than none: the next person to want a
 * balance would have found it and used it.
 */
describe("what a document asks the client for", () => {
  const held = { totalCents: 10_000_000, retentionCents: 1_000_000, retentionReleasedAt: null };

  it("is the whole total when nothing is paid and nothing is held", () => {
    expect(
      settlementOf({ totalCents: 18_000_000, paidCents: 0, retentionCents: 0, retentionReleasedAt: null })
        .outstandingCents,
    ).toBe(18_000_000);
  });

  it("subtracts payments already recorded", () => {
    expect(
      settlementOf({
        totalCents: 18_000_000,
        paidCents: 9_000_000,
        retentionCents: 0,
        retentionReleasedAt: null,
      }).outstandingCents,
    ).toBe(9_000_000);
  });

  it("does NOT ask for retention still held", () => {
    // The defect, in one assertion. 90% of a $100,000 invoice with 10% held is
    // everything currently payable.
    const s = settlementOf({ ...held, paidCents: 9_000_000 });
    expect(s.outstandingCents).toBe(0);
    expect(s.heldCents).toBe(1_000_000);
    expect(s.settledForNow).toBe(true);
  });

  it("asks for it once it has been released", () => {
    const s = settlementOf({
      ...held,
      paidCents: 9_000_000,
      retentionReleasedAt: new Date("2026-09-01T00:00:00.000Z"),
    });
    expect(s.outstandingCents).toBe(1_000_000);
    expect(s.heldCents).toBe(0);
  });

  it("clamps an overpayment to zero rather than showing a negative amount due", () => {
    expect(
      settlementOf({
        totalCents: 18_000_000,
        paidCents: 20_000_000,
        retentionCents: 0,
        retentionReleasedAt: null,
      }).outstandingCents,
    ).toBe(0);
  });
});

describe("buildInvoiceEmail", () => {
  const base = {
    invoiceNum: "INV-0007",
    businessName: "Blue Mountain Builders",
    clientName: "Marcia Brown",
    balanceDueCents: 9_000_000,
  };

  it("asks for the balance due, not the invoice total", () => {
    const { html } = buildInvoiceEmail(base);
    // Half of a $180,000 invoice already paid: the customer must be asked for
    // $90,000, and must never see the full total presented as owing.
    expect(html).toContain("$90,000.00");
    expect(html).not.toContain("$180,000.00");
  });

  it("names the invoice in the subject", () => {
    expect(buildInvoiceEmail(base).subject).toBe("Invoice INV-0007 from Blue Mountain Builders");
  });

  it("includes the due date label when there is one", () => {
    // The shape mapInvoice produces — already sentence-cased.
    const { html } = buildInvoiceEmail({ ...base, dueDateLabel: "Due 30 Aug 2026" });
    expect(html).toContain("(Due 30 Aug 2026)");
  });

  it("omits the due date clause entirely when the invoice has no due date", () => {
    const { html } = buildInvoiceEmail({ ...base, dueDateLabel: "" });
    expect(html).toContain("$90,000.00</strong>.");
  });

  it("reads as a receipt, not a demand, once the balance is zero", () => {
    const { subject, html } = buildInvoiceEmail({ ...base, balanceDueCents: 0 });
    expect(subject).toContain("paid in full");
    expect(html).toContain("paid in full");
    expect(html).not.toContain("amount due");
    expect(html).not.toContain("$0.00");
  });

  it("references the logo by cid when it is attached inline", () => {
    const { html } = buildInvoiceEmail({ ...base, withLogo: true });
    expect(html).toContain(`src="cid:${LOGO_CID}"`);
    // No remote or data: URI — both are blocked by default in Gmail/Outlook.
    expect(html).not.toContain("data:image");
    expect(html).not.toContain("<img src=\"http");
  });

  it("degrades to a text header when no logo is attached", () => {
    const { html } = buildInvoiceEmail({ ...base, withLogo: false });
    expect(html).not.toContain("cid:");
    expect(html).toContain("<h2");
    expect(html).toContain("Blue Mountain Builders");
  });

  it("falls back to a neutral greeting when the client has no name", () => {
    expect(buildInvoiceEmail({ ...base, clientName: "   " }).html).toContain("Hi there,");
  });

  it("escapes names so free text cannot break the markup", () => {
    const { html } = buildInvoiceEmail({
      ...base,
      businessName: "Bell & Sons <Ltd>",
      clientName: 'Ann "AJ" Grant',
    });
    expect(html).toContain("Bell &amp; Sons &lt;Ltd&gt;");
    expect(html).toContain("Ann &quot;AJ&quot; Grant");
    expect(html).not.toContain("<Ltd>");
  });
});

describe("escapeHtml", () => {
  it("escapes the characters that would otherwise be read as markup", () => {
    expect(escapeHtml('&<>"')).toBe("&amp;&lt;&gt;&quot;");
  });

  it("leaves ordinary text alone", () => {
    expect(escapeHtml("Blue Mountain Builders")).toBe("Blue Mountain Builders");
  });
});
