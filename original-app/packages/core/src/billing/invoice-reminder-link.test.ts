import { describe, expect, it } from "vitest";
import { reminderMessage } from "./invoice-reminder.js";

const base = {
  businessName: "Blackwood Construction",
  clientName: "Marcia",
  invoiceNumber: "INV-0007",
  outstandingCents: 45_000_00,
  dueDate: new Date("2026-08-13T00:00:00.000Z"),
  now: new Date("2026-08-20T15:00:00.000Z"),
};

describe("reminderMessage — the invoice link", () => {
  it("includes the link when there is one", () => {
    const { body } = reminderMessage({ ...base, link: "https://jamquote.app/i/abc123" });
    expect(body).toContain("https://jamquote.app/i/abc123");
  });

  it("puts the link BEFORE the apology", () => {
    // A client who wants to check the figure should not have to read past
    // "please ignore this" to find the document.
    const { body } = reminderMessage({ ...base, link: "https://jamquote.app/i/abc123" });
    expect(body.indexOf("i/abc123")).toBeLessThan(body.indexOf("already sent it across"));
  });

  it("reads properly with no link at all", () => {
    // Minting the link is best-effort — a failure there must not leave a
    // dangling "You can view it here:" in the message.
    const { body } = reminderMessage({ ...base, link: null });
    expect(body).not.toContain("view it here");
    expect(body).toContain("INV-0007");
  });
});
