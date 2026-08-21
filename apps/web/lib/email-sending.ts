import { clientMailStatus, type ClientMailStatus } from "@jamquote/core";

/**
 * Whether THIS deployment can deliver mail to a contractor's client.
 *
 * The rule itself lives in core (`clientMailStatus`) so the web send routes and
 * the API's reminder endpoint cannot disagree about whether mail can go — they
 * send on different paths, and a gate enforced on one side only is not a gate.
 * This wrapper does nothing but read the environment.
 *
 * Server-only: these env vars are not exposed to the browser.
 */
export type EmailSendingStatus = ClientMailStatus;

export function emailSendingStatus(): EmailSendingStatus {
  return clientMailStatus({
    apiKey: process.env.RESEND_API_KEY,
    from: process.env.QUOTE_FROM_EMAIL,
  });
}
