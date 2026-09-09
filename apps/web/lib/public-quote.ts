import type { PublicQuoteLineWire, PublicQuoteWire } from "@jamquote/core";
import { API_BASE_URL } from "@/lib/api-client";

/**
 * Fetching a quote by its public share token.
 *
 * Deliberately NOT `serverRequest`: that attaches the signed-in tenant's
 * bearer token, and this runs for a client who has no account and never will.
 * The share token IS the authorisation, and sending a stale session cookie
 * alongside it would only confuse which credential was doing the work.
 */

/**
 * NOT declared here. Both shapes come from `@jamquote/core`'s wire contract —
 * see `packages/core/src/wire/public-quote.ts`.
 *
 * That contract is `.strict()`, unlike the rest of `wire/`, because this is the
 * only unauthenticated surface in the API: an unexpected field is a disclosure,
 * not a shrug. The boundary widened silently once — the view reused the tenant's
 * Prisma include and every line arrived carrying `markupPct`, the contractor's
 * margin.
 *
 * The declarations replaced here also had `quantity` and `gctRate` as
 * `string | number`, unions nobody could resolve. A serialized Prisma Decimal is
 * always a string, and the API tests now prove it.
 *
 * `heading` is the one addition: the PAGE groups lines under a section title and
 * hangs it on the line for rendering. It never comes from the API, which is why
 * it is added here rather than in the contract.
 */
export type PublicQuoteLine = PublicQuoteLineWire & { heading?: string | null };

export type PublicQuote = Omit<PublicQuoteWire, "lineItems" | "sections"> & {
  lineItems: PublicQuoteLine[];
  sections: { id: string; title: string; lineItems: PublicQuoteLine[] }[];
};

/** Undefined for an unknown, revoked or still-draft token — the API returns
 * the same 404 for all three so the response cannot be used to probe which
 * tokens are real. */
export async function getSharedQuote(token: string): Promise<PublicQuote | undefined> {
  try {
    const res = await fetch(`${API_BASE_URL}/public/quotes/${encodeURIComponent(token)}`, {
      // Never cached: the first fetch is what records the client's view and
      // moves the quote to VIEWED, and a cached response would also keep
      // showing a revoked link.
      cache: "no-store",
    });
    if (!res.ok) return undefined;
    return (await res.json()) as PublicQuote;
  } catch {
    // An unreachable API must render "link unavailable", not a stack trace to
    // someone who is not a user of this product.
    return undefined;
  }
}

/**
 * The client's answer, sent with the share token as the only credential.
 *
 * Same reasoning as the fetch above: no bearer token, because there is no
 * account behind this. Throws with the API's own message so the page can say
 * "this quote has already been answered" rather than a generic failure — the
 * commonest cause is two people opening the same link.
 */
export async function submitQuoteDecision(
  token: string,
  body: { decision: "ACCEPT" | "DECLINE"; name: string; reason?: string },
): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/public/quotes/${token}/decision`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const payload = await res.json().catch(() => null);
    const message =
      payload && typeof payload === "object" && "message" in payload
        ? String((payload as { message: unknown }).message)
        : "Couldn't send your answer. Please try again.";
    throw new Error(message);
  }
}
