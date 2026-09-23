/**
 * Escapes text interpolated into an HTML email body.
 *
 * Business and client names are free text a contractor typed, so "Bell & Sons"
 * would otherwise reach the customer as broken markup — and a name containing
 * tags would be injected into the message outright. Shared by the quote and
 * invoice email routes so the two cannot diverge on it.
 */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
