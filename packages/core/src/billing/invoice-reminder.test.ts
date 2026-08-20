import { describe, expect, it } from "vitest";
import { daysLate, reminderMessage } from "./invoice-reminder.js";

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
/** An instant, not a date — used to prove the Jamaica offset is handled. */
const at = (iso: string) => new Date(iso);

describe("daysLate", () => {
  it("counts an invoice due today as 0, not 1", () => {
    // A client has until the end of the day. This is the same correction the
    // overdue sweep needed; both must agree or the screen and the message
    // disagree about whether someone is late.
    expect(daysLate(d("2026-08-20"), at("2026-08-20T15:00:00.000Z"))).toBe(0);
  });

  it("is still 0 late in the Jamaican evening, not 1", () => {
    // 2026-08-21T00:30Z is 7:30pm on the 20th in Jamaica. A UTC day boundary
    // would call this one day late while the contractor's screen still says
    // it is the due date.
    expect(daysLate(d("2026-08-20"), at("2026-08-21T00:30:00.000Z"))).toBe(0);
  });

  it("goes negative before the due date", () => {
    expect(daysLate(d("2026-08-25"), at("2026-08-20T15:00:00.000Z"))).toBe(-5);
  });

  it("counts whole days past due", () => {
    expect(daysLate(d("2026-08-13"), at("2026-08-20T15:00:00.000Z"))).toBe(7);
  });
});

describe("reminderMessage", () => {
  const base = {
    businessName: "Blackwood Construction",
    clientName: "Marcia Brown",
    invoiceNumber: "INV-0007",
    outstandingCents: 45_000_00,
    now: at("2026-08-20T15:00:00.000Z"),
  };

  it("names the OUTSTANDING amount, never the invoice total", () => {
    // Chasing the full figure on a partly paid invoice is the fastest way to
    // lose a customer, and the caller passes total - paid for this reason.
    const { body } = reminderMessage({ ...base, dueDate: d("2026-08-13") });
    expect(body).toContain("$45,000.00");
  });

  it("says days past due once it is late", () => {
    const { subject, body } = reminderMessage({ ...base, dueDate: d("2026-08-13") });
    expect(subject).toBe("Invoice INV-0007 — 7 days past due");
    expect(body).toContain("7 days past due");
  });

  it("uses a softer register before the due date", () => {
    const { subject } = reminderMessage({ ...base, dueDate: d("2026-08-23") });
    expect(subject).toBe("Invoice INV-0007 — due in 3 days");
  });

  it("says due today rather than 0 days past due", () => {
    const { subject } = reminderMessage({ ...base, dueDate: d("2026-08-20") });
    expect(subject).toBe("Invoice INV-0007 — due today");
  });

  it("still works with no due date at all", () => {
    // An invoice with no due date can never be "late" — inventing a deadline
    // would put terms on a client nobody agreed.
    const { subject, body } = reminderMessage({ ...base, dueDate: null });
    expect(subject).toBe("Payment reminder — invoice INV-0007");
    expect(body).toContain("still outstanding");
    expect(body).not.toContain("past due");
  });

  it("never accuses, because the client may have paid this morning", () => {
    const { body } = reminderMessage({ ...base, dueDate: d("2026-08-01") });
    expect(body).toContain("If you have already sent it across");
  });

  it("falls back to a greeting that reads properly with no client name", () => {
    const { body } = reminderMessage({ ...base, clientName: "  ", dueDate: null });
    expect(body).toContain("Hi there,");
  });

  it("signs off as the contractor, not as JamQuote", () => {
    // The client has a relationship with the contractor. A reminder signed by
    // the software reads as a debt collector.
    const { body } = reminderMessage({ ...base, dueDate: null });
    expect(body.trim().endsWith("Blackwood Construction")).toBe(true);
  });
});
