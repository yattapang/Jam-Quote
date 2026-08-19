import { afterEach, describe, expect, it, vi } from "vitest";
import { emailSendingStatus } from "./email-sending";

const original = { ...process.env };
afterEach(() => {
  process.env = { ...original };
  vi.unstubAllEnvs();
});

describe("emailSendingStatus", () => {
  it("is unconfigured with no provider key", () => {
    delete process.env.RESEND_API_KEY;
    expect(emailSendingStatus().configured).toBe(false);
  });

  it("is unconfigured when a key exists but no sender is set", () => {
    // The dangerous case. Resend accepts mail from its shared test sender and
    // returns success while delivering only to the account owner — so a key
    // alone would let the app report a send that never reached the client.
    process.env.RESEND_API_KEY = "re_test";
    delete process.env.QUOTE_FROM_EMAIL;
    const status = emailSendingStatus();
    expect(status.configured).toBe(false);
    // The message has to offer the way out, not just refuse.
    if (!status.configured) expect(status.reason).toMatch(/PDF|WhatsApp/i);
  });

  it("treats the resend.dev test sender as unconfigured", () => {
    process.env.RESEND_API_KEY = "re_test";
    process.env.QUOTE_FROM_EMAIL = "JamQuote <onboarding@resend.dev>";
    expect(emailSendingStatus().configured).toBe(false);
  });

  it("catches the test sender whatever the casing", () => {
    process.env.RESEND_API_KEY = "re_test";
    process.env.QUOTE_FROM_EMAIL = "JamQuote <Onboarding@Resend.DEV>";
    expect(emailSendingStatus().configured).toBe(false);
  });

  it("is configured once a real sender is set", () => {
    process.env.RESEND_API_KEY = "re_test";
    process.env.QUOTE_FROM_EMAIL = "JamQuote <quotes@jamquote.com>";
    expect(emailSendingStatus().configured).toBe(true);
  });
});
