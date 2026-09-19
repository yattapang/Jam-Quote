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

  it("agrees with the API for a registered business with an unreadable default: 0, not a guessed rate", () => {
    // This web copy used to fall back to a hardcoded 15 while the API produced NaN - the
    // twin had already drifted. Both now call core's newDocumentGctRatePct.
    expect(newDocumentGctPrefill({ gctRegistered: true, defaultGctRatePct: NaN })).toBe(0);
  });

  it("starts an unregistered business at 0, even with an unreadable default", () => {
    expect(newDocumentGctPrefill({ gctRegistered: false, defaultGctRatePct: NaN })).toBe(0);
  });
});
