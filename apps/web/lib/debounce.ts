/**
 * Minimal trailing-edge debounce: `fn` fires `delayMs` after the most recent
 * call, and every call within the window resets the timer. Separated from
 * useDebouncedValue (which wraps this for a React state value) so the timing
 * logic itself is a plain function — testable directly with fake timers,
 * with no React renderer needed. Used by the materials type-ahead
 * (MaterialPickerField) and the materials-page search box
 * (MaterialsListClient) to avoid firing a network request on every keystroke.
 */
export function debounce<Args extends unknown[]>(
  fn: (...args: Args) => void,
  delayMs: number,
): ((...args: Args) => void) & { cancel: () => void } {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const debounced = (...args: Args) => {
    if (timer !== undefined) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = undefined;
      fn(...args);
    }, delayMs);
  };
  debounced.cancel = () => {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
  };
  return debounced;
}
