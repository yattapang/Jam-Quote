/**
 * The web app's own origin, for building links the API sends to a client
 * (password reset, invoice reminders, ...).
 *
 * `WEB_ORIGIN` is a comma-separated allow-list (see main.ts's CORS setup);
 * the first entry is the canonical origin to link back to. Unset in dev,
 * where localhost is the only thing running anyway.
 *
 * One copy so a second link-builder cannot drift from this one — see
 * REVIEW-FINDINGS.md F14, where the invoice reminder link was promised in the
 * UI and never wired up because this helper existed only in auth.service.ts
 * and nobody reused it.
 */
export function resolveWebBase(): string {
  const origins = process.env.WEB_ORIGIN;
  const first = origins?.split(",")[0]?.trim();
  return first || "http://localhost:3000";
}
