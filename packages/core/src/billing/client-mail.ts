/**
 * Whether mail can actually be DELIVERED to a contractor's client.
 *
 * The rule lives here, not in either app, because the web app and the API each
 * send client mail on different paths — quote/invoice emails go out from the
 * web routes, payment reminders from the API — and a rule enforced on one side
 * only is not a rule. That failure has already happened twice: a gate the
 * invoice button accepted and dropped, and an API endpoint that would send
 * while the button above it was disabled.
 *
 * Deliberately stricter than "is there an API key". Resend accepts mail from
 * its shared `onboarding@resend.dev` sender and RETURNS SUCCESS, but delivers
 * only to the account owner. So with a key and no verified domain, a
 * contractor emails a quote, everything reports ok, and the client never
 * receives anything — the worst failure this app can have, because it is
 * discovered days later if at all.
 *
 * Refusing up front is strictly better: the PDF download and the WhatsApp
 * share both work and sit next to the button.
 */

/** Resend's shared test sender. Accepts everything, delivers almost nothing. */
const TEST_SENDER = "resend.dev";

export type ClientMailStatus =
  | { configured: true }
  | { configured: false; reason: string };

export interface ClientMailConfig {
  /** The email provider key, or undefined when none is set. */
  apiKey?: string;
  /** The configured From address, or undefined when none is set. */
  from?: string;
}

export function clientMailStatus({ apiKey, from }: ClientMailConfig): ClientMailStatus {
  if (!apiKey?.trim()) {
    return { configured: false, reason: "No email provider key is set." };
  }

  if (!from?.trim()) {
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
