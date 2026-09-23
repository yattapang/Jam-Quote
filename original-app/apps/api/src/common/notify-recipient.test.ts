import { describe, expect, it } from "vitest";
import { addressableEmail } from "./notify-recipient.js";

/**
 * The chain that has already been got wrong once in production.
 *
 * Three features depend on it now, so it is tested here rather than three
 * times over — or, as it was, not at all.
 */
describe("addressableEmail", () => {
  it("prefers the subscriber's own stated billing contact", () => {
    expect(
      addressableEmail({
        billingContactEmail: "accounts@blackwood.com",
        users: [{ email: "owner@blackwood.com", role: "OWNER" }],
      }),
    ).toBe("accounts@blackwood.com");
  });

  it("falls back to the OWNER", () => {
    expect(
      addressableEmail({
        billingContactEmail: null,
        users: [
          { email: "admin@blackwood.com", role: "ADMIN" },
          { email: "owner@blackwood.com", role: "OWNER" },
        ],
      }),
    ).toBe("owner@blackwood.com");
  });

  it("reaches a tenant whose only account holder is an ADMIN", () => {
    // The live bug: the query filtered to role OWNER, this tenant had none,
    // and the reminder found nobody and said nothing.
    expect(
      addressableEmail({
        billingContactEmail: null,
        users: [{ email: "admin@blackwood.com", role: "ADMIN" }],
      }),
    ).toBe("admin@blackwood.com");
  });

  it("ignores a whitespace-only billing contact rather than sending to it", () => {
    expect(
      addressableEmail({
        billingContactEmail: "   ",
        users: [{ email: "owner@blackwood.com", role: "OWNER" }],
      }),
    ).toBe("owner@blackwood.com");
  });

  it("skips users with no email on file", () => {
    expect(
      addressableEmail({
        billingContactEmail: null,
        users: [
          { email: null, role: "OWNER" },
          { email: "staff@blackwood.com", role: "STAFF" },
        ],
      }),
    ).toBe("staff@blackwood.com");
  });

  it("returns undefined when nobody is reachable, rather than an empty string", () => {
    // Callers check for a recipient before sending; an empty string would pass
    // a truthiness check somewhere and become a send to nowhere.
    expect(addressableEmail({ billingContactEmail: null, users: [] })).toBeUndefined();
  });
});
