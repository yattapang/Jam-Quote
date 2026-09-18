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
 */
export type Loaded<T> = { ok: true; value: T } | { ok: false };

function isNextControlFlow(err: unknown): boolean {
  const digest = (err as { digest?: unknown } | null)?.digest;
  return typeof digest === "string" && digest.startsWith("NEXT_");
}

export async function softLoad<T>(promise: Promise<T>): Promise<Loaded<T>> {
  try {
    return { ok: true, value: await promise };
  } catch (err) {
    if (isNextControlFlow(err)) throw err;
    console.warn("[softLoad] secondary data failed to load:", err instanceof Error ? err.message : err);
    return { ok: false };
  }
}
