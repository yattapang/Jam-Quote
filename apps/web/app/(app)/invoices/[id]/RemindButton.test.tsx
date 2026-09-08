// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

/**
 * The chase button, as a contractor meets it.
 *
 * This suite exists because of a report that read: *"I got the send reminder
 * button but there was no whatsapp and email is still enabled"* — two separate
 * problems in one sentence, neither visible to a unit test:
 *
 * - **WhatsApp looked absent.** It was present but disabled, because that
 *   invoice's client had no phone on file, and the only explanation was a
 *   `title` tooltip. There is no hover on a phone, so a greyed control with no
 *   words reads as missing.
 * - **Email was enabled** when it should have been gated.
 *
 * The fix stated each blocker in the open. These tests hold that: not just
 * *disabled*, but **disabled and saying why**.
 */

const sendInvoiceReminder = vi.fn();
const refresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh, push: vi.fn() }),
}));

vi.mock("@/lib/api-client", () => ({
  sendInvoiceReminder: (...args: unknown[]) => sendInvoiceReminder(...args),
  // `toIntlPhone` lives in WhatsAppButton, which imports this module; stubbing
  // the module keeps the component tree loadable without a network layer.
  shareQuote: vi.fn(),
  ApiError: class ApiError extends Error {},
}));

import RemindButton from "./RemindButton";

const NO_REMINDERS: never[] = [];

beforeEach(() => {
  sendInvoiceReminder.mockReset().mockResolvedValue({ body: "Hi Marcia, ...", subject: "s" });
  refresh.mockReset();
  vi.stubGlobal("open", vi.fn());
});

function renderButton(props: Partial<Parameters<typeof RemindButton>[0]> = {}) {
  render(
    <RemindButton
      invoiceId="inv1"
      clientPhone="876-555-0100"
      clientEmail="marcia@example.com"
      reminders={NO_REMINDERS}
      {...props}
    />,
  );
  return userEvent.setup();
}

describe("RemindButton — WhatsApp", () => {
  it("is available when the client has a phone number", async () => {
    const user = renderButton();
    await user.click(screen.getByRole("button", { name: /send reminder/i }));
    expect(screen.getByRole("button", { name: /whatsapp/i })).toBeEnabled();
  });

  it("is present but DISABLED when there is no phone on file", async () => {
    // The owner read this as "there was no whatsapp". It was there, greyed.
    const user = renderButton({ clientPhone: undefined });
    await user.click(screen.getByRole("button", { name: /send reminder/i }));
    expect(screen.getByRole("button", { name: /whatsapp/i })).toBeDisabled();
  });

  it("SAYS why it is unavailable, in text and not only a tooltip", async () => {
    // The actual fix. A title attribute is invisible on the phone a contractor
    // is holding, which is where an invoice gets chased from.
    const user = renderButton({ clientPhone: undefined });
    await user.click(screen.getByRole("button", { name: /send reminder/i }));
    expect(screen.getByText(/no phone number on file/i)).toBeInTheDocument();
  });

  it("records the chase and opens WhatsApp with the composed message", async () => {
    const user = renderButton();
    await user.click(screen.getByRole("button", { name: /send reminder/i }));
    await user.click(screen.getByRole("button", { name: /whatsapp/i }));

    // Recorded first, opened second: opening a chat then failing to compose
    // would hand the contractor a half-written message.
    expect(sendInvoiceReminder).toHaveBeenCalledWith("inv1", "WHATSAPP");
    expect(window.open).toHaveBeenCalled();
  });
});

describe("RemindButton — email", () => {
  it("is DISABLED when there is no verified sending domain", async () => {
    const user = renderButton({ emailUnavailableReason: "No verified sending domain yet." });
    await user.click(screen.getByRole("button", { name: /send reminder/i }));
    expect(screen.getByRole("button", { name: /^email$/i })).toBeDisabled();
    expect(screen.getByText(/no verified sending domain/i)).toBeInTheDocument();
  });

  it("is DISABLED when the client has no email address", async () => {
    // A second, independent reason. The first version of this component gated
    // only on the sending domain and left it live for a client with no address.
    const user = renderButton({ clientEmail: undefined });
    await user.click(screen.getByRole("button", { name: /send reminder/i }));
    expect(screen.getByRole("button", { name: /^email$/i })).toBeDisabled();
    expect(screen.getByText(/no email address on file/i)).toBeInTheDocument();
  });

  it("does not open WhatsApp when the email channel is used", async () => {
    const user = renderButton();
    await user.click(screen.getByRole("button", { name: /send reminder/i }));
    await user.click(screen.getByRole("button", { name: /^email$/i }));

    expect(sendInvoiceReminder).toHaveBeenCalledWith("inv1", "EMAIL");
    expect(window.open).not.toHaveBeenCalled();
  });
});

describe("RemindButton — the chase history", () => {
  it("says nothing when the invoice has never been chased", () => {
    renderButton();
    expect(screen.queryByText(/reminded/i)).not.toBeInTheDocument();
  });

  it("shows how many times and when, which is the point of the ledger", () => {
    // "Have I already chased this?" is the question nobody can answer from
    // memory a fortnight into a job.
    renderButton({
      reminders: [
        { id: "r2", channel: "WHATSAPP", outstandingCents: 1000, sentAt: "2026-08-21T10:00:00.000Z" },
        { id: "r1", channel: "WHATSAPP", outstandingCents: 1000, sentAt: "2026-08-14T10:00:00.000Z" },
      ],
    });
    expect(screen.getByText(/reminded 2/i)).toBeInTheDocument();
  });
});

describe("RemindButton — when the API refuses", () => {
  it("shows the API's own reason rather than blaming the network", async () => {
    // "Nothing is outstanding on this invoice" is a deliberate rule. Reporting
    // it as "is the API running?" sent the owner to check a healthy server.
    sendInvoiceReminder.mockRejectedValue(new Error("Nothing is outstanding on this invoice."));
    const user = renderButton();
    await user.click(screen.getByRole("button", { name: /send reminder/i }));
    await user.click(screen.getByRole("button", { name: /whatsapp/i }));

    expect(await screen.findByText(/nothing is outstanding/i)).toBeInTheDocument();
  });
});
