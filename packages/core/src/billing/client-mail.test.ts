import { describe, expect, it } from "vitest";
import { clientMailStatus } from "./client-mail.js";

describe("clientMailStatus", () => {
  it("refuses with no provider key", () => {
    expect(clientMailStatus({ from: "a@jamquote.com" }).configured).toBe(false);
  });

  it("refuses with a key but no sender — the dangerous case", () => {
    // A key alone is what makes the app report a send that never reached
    // anyone: Resend accepts from its shared address and returns success.
    const s = clientMailStatus({ apiKey: "re_test" });
    expect(s.configured).toBe(false);
    // The message has to offer the way out, not just refuse.
    if (!s.configured) expect(s.reason).toMatch(/PDF|WhatsApp/i);
  });

  it("treats the resend.dev test sender as unconfigured", () => {
    expect(
      clientMailStatus({ apiKey: "re_test", from: "JamQuote <onboarding@resend.dev>" }).configured,
    ).toBe(false);
  });

  it("catches the test sender whatever the casing", () => {
    expect(
      clientMailStatus({ apiKey: "re_test", from: "JamQuote <Onboarding@Resend.DEV>" }).configured,
    ).toBe(false);
  });

  it("treats whitespace as absent, not as a value", () => {
    expect(clientMailStatus({ apiKey: "  ", from: "a@jamquote.com" }).configured).toBe(false);
    expect(clientMailStatus({ apiKey: "re_test", from: "   " }).configured).toBe(false);
  });

  it("allows a real verified sender", () => {
    expect(
      clientMailStatus({ apiKey: "re_test", from: "JamQuote <quotes@jamquote.com>" }).configured,
    ).toBe(true);
  });
});
