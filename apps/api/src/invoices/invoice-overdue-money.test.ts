import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { formatPlatformMoney } from "@jamquote/core";

// Separate file from invoice-overdue.service.test.ts because vi.mock("resend")
// is hoisted file-wide — the existing suite runs with no RESEND_API_KEY set
// and asserts the digest fails closed, so it cannot share a module registry
// with a suite that mocks Resend and supplies a key.
const sendMock = vi.fn().mockResolvedValue({ error: null });
vi.mock("resend", () => ({
  Resend: vi.fn().mockImplementation(() => ({ emails: { send: sendMock } })),
}));

describe("overdue digest money formatting", () => {
  const ORIGINAL_ENV = process.env;
  const NOW = new Date("2026-08-20T09:00:00.000Z");

  beforeEach(() => {
    vi.resetModules();
    sendMock.mockClear();
    process.env = { ...ORIGINAL_ENV, RESEND_API_KEY: "test-key" };
  });

  afterEach(() => {
    process.env = ORIGINAL_ENV;
  });

  function build(currency: string) {
    const prisma = {
      invoice: {
        findMany: vi.fn().mockResolvedValue([]),
        update: vi.fn().mockResolvedValue({}),
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
      business: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "biz-1",
            name: "Blackwood",
            currency,
            billingContactEmail: "bills@blackwood.jm",
            users: [{ email: "owner@blackwood.jm", role: "OWNER" }],
            invoices: [
              {
                number: "INV-0001",
                totalCents: 500_000,
                paidCents: 100_000,
                retentionCents: 0,
                retentionReleasedAt: null,
                dueDate: new Date("2026-08-01T00:00:00.000Z"),
              },
            ],
          },
        ]),
        update: vi.fn().mockResolvedValue({}),
      },
    };
    return prisma;
  }

  const NON_JMD = ["USD", "TTD", "BBD", "GYD", "XCD"] as const;

  it.each(NON_JMD)(
    "formats the digest amount exactly as core's formatter for %s, with no doubled symbol",
    async (currency) => {
      const { InvoiceOverdueService } = await import("./invoice-overdue.service.js");
      const prisma = build(currency);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const svc = new InvoiceOverdueService(prisma as any);

      await svc.run(NOW);

      expect(sendMock).toHaveBeenCalledTimes(1);
      const call = sendMock.mock.calls[0]![0];
      const outstandingCents = 400_000; // 500_000 - 100_000
      const expected = formatPlatformMoney(outstandingCents, currency);

      expect(call.subject).toContain(expected);
      expect(call.html).toContain(expected);
      // The finding: a local `money()` hardcoded to "$" printed "$4,000.00" for
      // every currency, including ones whose real symbol differs (e.g. "TT$",
      // "US$"). Assert the platform symbol actually appears, not a bare "$".
      expect(call.html).not.toMatch(/[A-Z]{3} \$/);
      expect(call.html).not.toContain("$$");
    },
  );
});
