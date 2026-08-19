/**
 * Whether this deployment can actually deliver mail to a CONTRACTOR'S CLIENT.
 *
 * Deliberately stricter than "is there an API key". Resend accepts mail from
 * its shared `onboarding@resend.dev` sender and returns success, but delivers
 * it only to the account owner's own address. So with a key set and no
 * verified domain, a contractor emails a quote, the API reports ok, the UI
 * says sent — and the client never receives anything.
 *
 * A silent non-delivery is the worst failure this app can have: the contractor
 * believes a quote is with their customer and finds out days later, if at all.
 * Refusing up front is strictly better, because the PDF download and WhatsApp
 * share both work and are sitting next to the button.
 *
 * Server-only: it reads env vars that are not exposed to the browser.
 */

/** Resend's shared test sender. Accepts everything, delivers almost nothing. */
const TEST_SENDER = "resend.dev";

export type EmailSendingStatus =
  | { configured: true }
  | { configured: false; reason: string };

export function emailSendingStatus(): EmailSendingStatus {
  if (!process.env.RESEND_API_KEY) {
    return { configured: false, reason: "No email provider key is set." };
  }

  const from = process.env.QUOTE_FROM_EMAIL;
  if (!from) {
    return {
      configured: false,
      reason:
        "No verified sending domain yet, so mail would not reach your client. Download the PDF or share it on WhatsApp instead.",
    };
  }

  if (from.toLowerCase().includes(TEST_SENDER)) {
    // Configured, but pointed at the test sender — which only ever delivers
    // back to the account owner. Treated as unconfigured rather than trusted.
    return {
      configured: false,
      reason:
        "Sending is still using the test address, which only delivers to the account owner. Download the PDF or share it on WhatsApp instead.",
    };
  }

  return { configured: true };
}
