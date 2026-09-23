import { newDocumentGctRatePct } from "@jamquote/core";
import type { Business } from "./types";

/**
 * The GCT rate a NEW quote/invoice builder should prefill, mirroring exactly
 * what the API saves when the contractor supplies no explicit rate
 * (quotes.service.create / invoices.service.create):
 *   input.gctRatePct ?? (business.gctRegistered ? business.defaultGctRate : 0)
 *
 * An unregistered business must never show 15% on screen and then either
 * silently save 0% (mismatched) or silently save 15% (charging GCT it isn't
 * registered to collect) — see REVIEW-FINDINGS.md, "GCT is CHARGED
 * regardless of registration". Falls back to 15 only when the business's own
 * default is unavailable/unreadable (e.g. getBusiness()'s EMPTY_BUSINESS
 * fallback), same as the pre-existing fallback behaviour.
 */
export function newDocumentGctPrefill(business: Pick<Business, "gctRegistered" | "defaultGctRatePct">): number {
  // The rule lives once, in core, and the API applies the same function on create.
  return newDocumentGctRatePct({
    gctRegistered: business.gctRegistered === true,
    defaultGctRatePct: business.defaultGctRatePct,
  });
}
