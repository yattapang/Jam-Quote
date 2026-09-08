// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import EmailInvoiceButton from "./EmailInvoiceButton";

/**
 * The first test in this repo that renders anything.
 *
 * It exists because of a specific failure. `EmailInvoiceButton` accepted
 * `unavailableReason` and never read it, so the invoice email button stayed LIVE
 * against an unverified sending domain while the quote one was correctly
 * disabled. The owner found it by clicking. Nothing could have caught it before:
 *
 * - **TypeScript** was satisfied — an unused prop is legal.
 * - **ESLint** did warn, in every build, and the warning was read past.
 * - **No unit test** could see it, because whether a button is disabled is a
 *   property of the rendered output and nothing here rendered.
 * - **The source guard** written afterwards catches the exact shape, but only
 *   that shape. It cannot tell you the button is disabled; it can only tell you
 *   the prop appears in a `disabled=` expression.
 *
 * This can. That is the whole argument for the DOM suite: the class of defect
 * this project keeps shipping is "the screen does not do what the code appears
 * to say", and the only witness to what a screen does is the screen.
 */

describe("EmailInvoiceButton — the sending gate", () => {
  it("is available when a client has an email and sending is configured", () => {
    render(<EmailInvoiceButton invoiceId="inv1" clientEmail="marcia@example.com" />);
    expect(screen.getByRole("button", { name: /send by email/i })).toBeEnabled();
  });

  it("is DISABLED when there is no verified sending domain", () => {
    // The defect, stated as a test. This failed against the shipped code.
    render(
      <EmailInvoiceButton
        invoiceId="inv1"
        clientEmail="marcia@example.com"
        unavailableReason="No verified sending domain yet, so mail would not reach your client."
      />,
    );
    expect(screen.getByRole("button", { name: /send by email/i })).toBeDisabled();
  });

  it("says WHY it is unavailable, in the open", () => {
    // Not only as a `title`. There is no hover on the phone a contractor is
    // holding, and a dead control with no explanation reads as a bug in the app
    // rather than a deliberate limit.
    render(
      <EmailInvoiceButton
        invoiceId="inv1"
        clientEmail="marcia@example.com"
        unavailableReason="No verified sending domain yet, so mail would not reach your client."
      />,
    );
    expect(screen.getByText(/no verified sending domain/i)).toBeInTheDocument();
  });

  it("is disabled when the client has no email on file", () => {
    render(<EmailInvoiceButton invoiceId="inv1" />);
    expect(screen.getByRole("button", { name: /send by email/i })).toBeDisabled();
  });

  it("offers no way through when both reasons apply", () => {
    // Belt and braces: a client with no address AND no sending domain must not
    // somehow re-enable by cancelling out.
    render(<EmailInvoiceButton invoiceId="inv1" unavailableReason="No verified sending domain." />);
    expect(screen.getByRole("button", { name: /send by email/i })).toBeDisabled();
  });
});
