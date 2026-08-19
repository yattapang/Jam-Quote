import { API_BASE_URL } from "@/lib/api-client";

/**
 * Fetching a quote by its public share token.
 *
 * Deliberately NOT `serverRequest`: that attaches the signed-in tenant's
 * bearer token, and this runs for a client who has no account and never will.
 * The share token IS the authorisation, and sending a stale session cookie
 * alongside it would only confuse which credential was doing the work.
 */

export interface PublicQuoteLine {
  id: string;
  category: string;
  description: string;
  quantity: string | number;
  rateUnit: string;
  unitLabel: string | null;
  unitPriceCents: number;
  gctTreatment: string;
  heading?: string | null;
}

export interface PublicQuote {
  number: string;
  status: string;
  validUntil: string | null;
  terms: string | null;
  detailLevel: string;
  gctRate: string | number;
  discountPct: string | number;
  depositCents: number;
  subtotalCents: number;
  gctCents: number;
  totalCents: number;
  lineItems: PublicQuoteLine[];
  sections: { id: string; title: string; lineItems: PublicQuoteLine[] }[];
  clientName: string | null;
  business: {
    name: string;
    addressLine: string | null;
    town: string | null;
    parish: string | null;
    trn: string | null;
  };
}

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
