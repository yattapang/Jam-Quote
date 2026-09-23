import type { PublicQuoteLineWire, PublicQuoteWire } from "@jamquote/core";
import { API_BASE_URL, ApiError } from "@/lib/api-client";

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
 * The business logo for a shared quote, fetched server-side and scoped by the
 * SAME share token as the quote itself (`/public/quotes/:token/logo` on the
 * API — see PublicQuotesController.logo). Rendered as a data URI rather than
 * pointed at from the browser: this page's other fetches all go through
 * API_BASE_URL, which is a server-only address in deploy, not one a client's
 * browser can reach directly.
 *
 * Undefined whenever there is no logo, the token is bad, or the fetch fails —
 * a missing logo must degrade to the text header, never break the page.
 */
export async function getSharedQuoteLogo(
  token: string,
): Promise<{ dataUri: string } | undefined> {
  try {
    const res = await fetch(`${API_BASE_URL}/public/quotes/${encodeURIComponent(token)}/logo`, {
      cache: "no-store",
    });
    if (!res.ok) return undefined;
    const contentType = res.headers.get("content-type") ?? "image/png";
    const base64 = Buffer.from(await res.arrayBuffer()).toString("base64");
    return { dataUri: `data:${contentType};base64,${base64}` };
  } catch {
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
        : "";
    // A real ApiError, not a bare Error — QuoteDecision.tsx's errorMessage()
    // only ever surfaces an ApiError's message (the server's own deliberate
    // sentence, e.g. "This quote has already been answered..."). A plain
    // Error here was invisible to that check, so the CLIENT always saw the
    // generic fallback instead of the one message that actually explains
    // what happened.
    throw new ApiError(message, res.status, payload && typeof payload === "object" ? (payload as Record<string, unknown>) : undefined);
  }
}
