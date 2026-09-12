import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BadRequestException } from "@nestjs/common";
import { InvoiceStatus } from "@jamquote/core";
import { InvoicesService } from "./invoices.service.js";

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * The reminder endpoint must refuse client email ON ITS OWN.
 *
 * The web app disables the button, but the button is not the gate — this
 * endpoint sends by a different path than the web send routes, and a rule
 * enforced only where the UI happens to call it is not a rule. That exact
 * shape has already shipped once here: a gate the invoice button accepted and
 * dropped.
 */
function harness(invoice: Record<string, unknown> = {}) {
  const stored: any = {
    id: "inv1",
    businessId: "b1",
    clientId: "cl1",
    number: "INV-0007",
    status: InvoiceStatus.INVOICED,
    totalCents: 100_000,
    paidCents: 0,
    retentionCents: 0,
    retentionReleasedAt: null,
    dueDate: new Date("2026-08-13T00:00:00.000Z"),
    lineItems: [],
    sections: [],
    ...invoice,
  };
  const created: any[] = [];
  const prisma = {
    invoice: {
      findFirst: vi.fn(() => Promise.resolve(stored)),
      // Backs `share()`, which recordReminder now calls to mint the link.
      // Mutates `stored` so a second mint in the same test sees the token
      // already set, mirroring share()'s own idempotency.
      update: vi.fn((args: any) => {
        Object.assign(stored, args.data);
        return Promise.resolve(stored);
      }),
    },
    business: { findUnique: vi.fn(() => Promise.resolve({ name: "Blackwood Construction" })) },
    client: {
      // findFirst, not findUnique: the reminder read is now scoped by businessId
      // and deletedAt. The write side refuses a foreign clientId, but rows
      // written before that check existed were never validated, and this read is
      // the one that leaked.
      findFirst: vi.fn(() =>
        Promise.resolve({
          firstName: "Marcia",
          lastName: "Brown",
          email: "marcia@example.com",
          phone: "876-555-0100",
        }),
      ),
    },
    invoiceReminder: {
      create: vi.fn((args: any) => {
        created.push(args.data);
        return Promise.resolve(args.data);
      }),
    },
  };
  const svc = new InvoicesService(prisma as any, {} as any);
  return { svc, prisma, created };
}

const original = { ...process.env };
beforeEach(() => {
  delete process.env.RESEND_API_KEY;
  delete process.env.QUOTE_FROM_EMAIL;
});
afterEach(() => {
  process.env = { ...original };
});

describe("InvoicesService.recordReminder — the email gate", () => {
  it("refuses EMAIL with no provider key, and records nothing", () => {
    const { svc, created } = harness();
    return expect(svc.recordReminder("b1", "inv1", "EMAIL"))
      .rejects.toBeInstanceOf(BadRequestException)
      .then(() => {
        // A ledger row for mail that never left would claim a chase that did
        // not happen — the whole reason the send comes before the write.
        expect(created).toEqual([]);
      });
  });

  it("refuses EMAIL from the resend.dev test sender", async () => {
    // The dangerous case: Resend ACCEPTS this and reports success while
    // delivering only to the account owner. A key check alone would let it
    // through, which is what this endpoint used to do.
    process.env.RESEND_API_KEY = "re_test";
    process.env.QUOTE_FROM_EMAIL = "JamQuote <onboarding@resend.dev>";
    const { svc, created } = harness();
    await expect(svc.recordReminder("b1", "inv1", "EMAIL")).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(created).toEqual([]);
  });

  it("refuses EMAIL when only EMAIL_FROM (not QUOTE_FROM_EMAIL) is set", async () => {
    // EMAIL_FROM is the platform-mail fallback (password reset, subscription
    // notices) — a different sender for a different audience. The client-mail
    // gate here must read the SAME variable the web app's email routes read,
    // or the two sides can disagree about whether mail can go.
    process.env.RESEND_API_KEY = "re_test";
    process.env.EMAIL_FROM = "JamQuote <billing@jamquote.com>";
    const { svc, created } = harness();
    // Asserting on the GATE's own message, not just "some BadRequestException" —
    // reading EMAIL_FROM by mistake means `from` is defined after all, the gate
    // opens, and the code goes on to actually call Resend, which then fails for
    // an unrelated reason (invalid key) and would also throw BadRequestException.
    // Only the gate's reason text proves the refusal happened for the right cause.
    await expect(svc.recordReminder("b1", "inv1", "EMAIL")).rejects.toMatchObject({
      message: expect.stringMatching(/verified sending domain/i),
    });
    expect(created).toEqual([]);
  });

  it("still allows WHATSAPP, which needs no sending domain", async () => {
    const { svc, created } = harness();
    const out = await svc.recordReminder("b1", "inv1", "WHATSAPP");

    expect(out.body).toContain("INV-0007");
    expect(created).toHaveLength(1);
    expect(created[0].channel).toBe("WHATSAPP");
    // Recorded against the phone, not the email — stored as sent.
    expect(created[0].sentTo).toBe("876-555-0100");
  });

  it("records what was outstanding, not the invoice total", async () => {
    const { svc, created } = harness({ totalCents: 100_000, paidCents: 40_000 });
    await svc.recordReminder("b1", "inv1", "WHATSAPP");
    expect(created[0].outstandingCents).toBe(60_000);
  });

  it("refuses when retention is all that is left, because it is not owed yet", async () => {
    const { svc } = harness({ totalCents: 100_000, paidCents: 90_000, retentionCents: 10_000 });
    await expect(svc.recordReminder("b1", "inv1", "WHATSAPP")).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});

describe("InvoicesService.recordReminder — the promised link", () => {
  it("mints a share link and includes it in the WhatsApp message", async () => {
    // RemindButton.tsx tells the contractor the reminder "includes a link to
    // the invoice" — without this, that promise on screen is false.
    const { svc } = harness();
    const out = await svc.recordReminder("b1", "inv1", "WHATSAPP");
    expect(out.body).toMatch(/https?:\/\/\S+\/i\/\S+/);
  });

  it("reuses an existing share token rather than minting a second one", async () => {
    const { svc, prisma } = harness({ shareToken: "existing-token" });
    const out = await svc.recordReminder("b1", "inv1", "WHATSAPP");
    expect(out.body).toContain("existing-token");
    expect(prisma.invoice.update).not.toHaveBeenCalled();
  });

  it("still sends the reminder, without a link, if minting fails", async () => {
    // Best-effort: a DB hiccup while minting the link must not stop the
    // reminder from going out at all.
    const { svc, prisma, created } = harness();
    prisma.invoice.update.mockRejectedValueOnce(new Error("db is down"));
    const out = await svc.recordReminder("b1", "inv1", "WHATSAPP");
    expect(out.body).not.toContain("view it here");
    expect(created).toHaveLength(1);
  });
});
