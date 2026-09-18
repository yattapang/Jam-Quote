/**
 * For a page's SECONDARY data only: a side panel, a name lookup, a card.
 *
 * The server getters in api-server.ts rethrow when the API is reachable but
 * their request failed (an asleep API still returns empty data under
 * DemoDataBanner). For a page's primary data that is right - the route's
 * error boundary takes over. For a side widget, taking the whole page down is
 * worse, so the page wraps that one call in softLoad() and renders a visible
 * "couldn't load" state when `ok` is false, rather than an empty state that
 * reads as "you have none".
 *
 * Next's control-flow errors (redirect() on a 401/403, notFound()) are never
 * swallowed: they carry a `digest` beginning "NEXT_" and must propagate.
 *
 * Only a genuine DATA failure is absorbed into `{ ok: false }`: an `ApiError`
 * (a non-2xx response — serverRequest in api-server.ts throws this) or a
 * network failure from `fetch` itself (the request never reached the API —
 * connection refused, DNS failure, timeout). Node's `fetch` (undici) throws
 * those as a `TypeError` whose message is exactly `"fetch failed"`, with the
 * real cause on `.cause` — see serverRequest's bare `await fetch(...)`, which
 * has no try/catch of its own and lets that error propagate unchanged.
 * Anything else — in particular a `TypeError` from a bug in a mapper function
 * (e.g. reading a property off `undefined`) — is a PROGRAMMING error, not a
 * "couldn't load," and must rethrow so it surfaces as a real error instead of
 * a permanent, silent "couldn't load" that nobody investigates. A bare
 * `instanceof TypeError` check cannot tell the two apart, since a mapper bug
 * is frequently a TypeError too; the message match on Node's own fetch
 * failure wording is what actually distinguishes them.
 */
export type Loaded<T> = { ok: true; value: T } | { ok: false };

function isNextControlFlow(err: unknown): boolean {
  const digest = (err as { digest?: unknown } | null)?.digest;
  return typeof digest === "string" && digest.startsWith("NEXT_");
}

/** Name kept generic (not "ApiError") so this file has no dependency on
 * api-client.ts / api-server.ts — it only needs the shape `ApiError` actually
 * has: a `name` of "ApiError" (see `class ApiError extends Error` in
 * api-client.ts, whose constructor sets `this.name = "ApiError"`). */
function isApiError(err: unknown): boolean {
  return err instanceof Error && err.name === "ApiError";
}

/** Node's `fetch` (undici) throws exactly this for a connection-level
 * failure — see the comment above. A mapper's own `TypeError` (e.g. `Cannot
 * read properties of undefined`) never carries this message. */
function isFetchNetworkFailure(err: unknown): boolean {
  return err instanceof TypeError && err.message === "fetch failed";
}

export async function softLoad<T>(promise: Promise<T>): Promise<Loaded<T>> {
  try {
    return { ok: true, value: await promise };
  } catch (err) {
    if (isNextControlFlow(err)) throw err;
    if (!isApiError(err) && !isFetchNetworkFailure(err)) throw err;
    console.warn("[softLoad] secondary data failed to load:", err instanceof Error ? err.message : err);
    return { ok: false };
  }
}
