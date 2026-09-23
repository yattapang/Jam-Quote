import { describe, expect, it } from "vitest";
import { newDocumentGctRatePct } from "./gct-default.js";

describe("newDocumentGctRatePct", () => {
  it("starts an unregistered business at 0%, whatever its stored default", () => {
    expect(newDocumentGctRatePct({ gctRegistered: false, defaultGctRatePct: 15 })).toBe(0);
    expect(newDocumentGctRatePct({ gctRegistered: false, defaultGctRatePct: "15.00" })).toBe(0);
  });

  it("starts a registered business at its own default, from a number or a Decimal string", () => {
    expect(newDocumentGctRatePct({ gctRegistered: true, defaultGctRatePct: 15 })).toBe(15);
    expect(newDocumentGctRatePct({ gctRegistered: true, defaultGctRatePct: "16.5" })).toBe(16.5);
  });

  it("never invents a rate: a registered business with no usable default starts at 0", () => {
    for (const bad of [null, undefined, "", "abc", Number.NaN]) {
      expect(newDocumentGctRatePct({ gctRegistered: true, defaultGctRatePct: bad as never })).toBe(0);
    }
  });
});
