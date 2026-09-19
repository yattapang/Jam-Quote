import { describe, expect, it } from "vitest";
import { newDocumentGctPrefill } from "./gct-prefill";

/**
 * Pins the web prefill to exactly what quotes.service.create() /
 * invoices.service.create() save when the contractor supplies no explicit
 * rate: 0 while unregistered, the business's own default while registered.
 * See REVIEW-FINDINGS.md, "GCT is CHARGED regardless of registration".
 */
describe("newDocumentGctPrefill", () => {
  it("prefills 0 for an unregistered business, regardless of its stored default", () => {
    expect(newDocumentGctPrefill({ gctRegistered: false, defaultGctRatePct: 15 })).toBe(0);
  });

  it("prefills the business's own default rate when registered", () => {
    expect(newDocumentGctPrefill({ gctRegistered: true, defaultGctRatePct: 12.5 })).toBe(12.5);
  });

  it("falls back to 15 for a registered business with an unreadable default", () => {
    expect(newDocumentGctPrefill({ gctRegistered: true, defaultGctRatePct: NaN })).toBe(15);
  });

  it("never falls back to 15 for an unregistered business, even with an unreadable default", () => {
    expect(newDocumentGctPrefill({ gctRegistered: false, defaultGctRatePct: NaN })).toBe(0);
  });
});
