"use client";

import { useCallback, useRef, useState } from "react";

/**
 * Wraps an async handler so a second call made while the first is still in
 * flight is silently ignored.
 *
 * `disabled={saving}` alone does not stop a fast double click (or a double
 * Enter, or a stray duplicate form submit): React state only updates on the
 * next render, and two clicks fired in the same event-loop turn both read the
 * pre-click value before either setState lands. Two purchase deletes went out
 * from one such guard in ProjectCosts — see its test for the click-without-a-
 * render-between repro. A `useRef` flag is written synchronously, so the
 * SECOND call sees the first is already running, no render required.
 *
 * `pending` is still plain state — it exists to drive the UI ("Saving…",
 * `disabled`), not to guard against re-entry, so its one-render lag is fine.
 *
 * Use this for anything where a duplicate call is HARMFUL: a double create, a
 * double payment, a double send. Skip it for a merely wasteful duplicate
 * (idempotent PATCH) unless the busy state is worth sharing anyway.
 */
export function useSingleFlight<Args extends unknown[]>(
  handler: (...args: Args) => Promise<void>,
) {
  const [pending, setPending] = useState(false);
  const inFlight = useRef(false);

  const run = useCallback(
    async (...args: Args) => {
      if (inFlight.current) return;
      inFlight.current = true;
      setPending(true);
      try {
        await handler(...args);
      } finally {
        inFlight.current = false;
        setPending(false);
      }
    },
    [handler],
  );

  return { run, pending };
}
