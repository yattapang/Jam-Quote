import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { formatPlatformMoney } from "@jamquote/core";
import { NoticeKind } from "@jamquote/core";

// The mailer's own module is imported AFTER the mock is registered, so every
// `new Resend(...)` inside it returns this fake and `.emails.send` captures
// the subject/html instead of hitting the network.
const sendMock = vi.fn().mockResolvedValue({ error: null });
vi.mock("resend", () => ({
  Resend: vi.fn().mockImplementation(() => ({ emails: { send: sendMock } })),
}));

describe("SubscriptionMailerService money formatting", () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    vi.resetModules();
    sendMock.mockClear();
    process.env = { ...ORIGINAL_ENV, RESEND_API_KEY: "test-key" };
  });

  afterEach(() => {
    process.env = ORIGINAL_ENV;
  });

  const RENEWS_AT = new Date("2026-09-20T00:00:00.000Z");

  // Every non-JMD currency this platform accepts, so a fix that only handles
  // USD (the finding's own example) does not slip a twin past for TTD/BBD/etc.
  const NON_JMD = ["USD", "TTD", "BBD", "GYD", "XCD"] as const;

  it.each(NON_JMD)(
    "renders the renewal reminder amount exactly as core formats %s, with no doubled symbol",
    async (currency) => {
      const { SubscriptionMailerService } = await import("./subscription-mailer.service.js");
      const svc = new SubscriptionMailerService();
      const amountCents = 100_000;

      await svc.send({
        kind: NoticeKind.RENEWAL_14,
        to: "owner@example.com",
        businessName: "Blackwood Fabrication",
        renewsAt: RENEWS_AT,
        amountCents,
        currency,
        freeQuotesPerMonth: 3,
      });

      expect(sendMock).toHaveBeenCalledTimes(1);
      const html = sendMock.mock.calls[0]![0].html as string;
      const expected = formatPlatformMoney(amountCents, currency);

      expect(html).toContain(expected);
      // The defect this guards: hand-formatting produced "USD $1,000.00" —
      // the ISO code AND a bare "$" both present — where core prints "US$1,000.00".
      expect(html).not.toMatch(/[A-Z]{3} \$/);
      expect(html).not.toContain("$$");
    },
  );

  it.each(NON_JMD)(
    "renders the REVERTED notice amount exactly as core formats %s",
    async (currency) => {
      const { SubscriptionMailerService } = await import("./subscription-mailer.service.js");
      const svc = new SubscriptionMailerService();
      const amountCents = 250_000;

      await svc.send({
        kind: NoticeKind.REVERTED,
        to: "owner@example.com",
        businessName: "Blackwood Fabrication",
        renewsAt: RENEWS_AT,
        amountCents,
        currency,
        freeQuotesPerMonth: 3,
      });

      const html = sendMock.mock.calls[0]![0].html as string;
      const expected = formatPlatformMoney(amountCents, currency);

      expect(html).toContain(expected);
      expect(html).not.toMatch(/[A-Z]{3} \$/);
    },
  );
});
