"use client";

import { useEffect, useState } from "react";
import { debounce } from "./debounce";

/**
 * Returns `value`, but delayed until `delayMs` has passed with no further
 * changes — ties a text input to a network request (materials type-ahead,
 * materials list search) without firing on every keystroke. Thin React
 * wrapper around the plain `debounce()` helper (see ./debounce.ts, which
 * carries the actual timing logic and its own unit tests) — the effect here
 * just re-creates a debounced setter whenever `value`/`delayMs` change and
 * cancels any still-pending call on cleanup.
 */
export function useDebouncedValue<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const set = debounce((v: T) => setDebounced(v), delayMs);
    set(value);
    return () => set.cancel();
  }, [value, delayMs]);
  return debounced;
}
