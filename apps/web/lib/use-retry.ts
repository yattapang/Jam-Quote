"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

/**
 * Retry action shared by every load-failure boundary — app/(app)/error.tsx
 * and the four catalog error.tsx files (via CatalogLoadError). In Next
 * 14.2, error.tsx's `reset` prop only clears the boundary's own error state
 * and re-renders with the SAME cached Server Component payload — it does not
 * re-issue the failed request (see node_modules/next/dist/client/components/
 * error-boundary.js: `reset` just calls the boundary's `resetErrorBoundary`,
 * there is no fetch involved). So a bare `onClick={reset}` on a caught
 * request failure re-renders the identical failure and the error returns
 * immediately — Retry does nothing.
 *
 * `router.refresh()` re-requests the current route's Server Components from
 * the server (a fresh render, fresh data), and `reset()` then clears the
 * boundary so that fresh render is allowed to show. Both are wrapped in a
 * transition so the button doesn't block on the refresh.
 */
export function useRetry(reset: () => void) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const retry = () => {
    startTransition(() => {
      router.refresh();
      reset();
    });
  };

  return { retry, isPending };
}
