/**
 * Not losing a quote to the back button.
 *
 * A contractor building a quote at a client's kitchen table pressed back and
 * lost the lot. Nothing had touched the server yet, so there was nothing to
 * return to.
 *
 * **Why this is local and not a server-side autosave.** Saving a real DRAFT on
 * every line change was the obvious fix and is the wrong one: creating a quote
 * calls `reserveQuoteNumber`, which increments `Business.nextQuoteSeq`
 * irreversibly. Every abandoned attempt would burn a number, so a contractor's
 * quotes would run QT-0141, QT-0144, QT-0149 with no explanation — gaps a
 * client or an auditor can see — and the list would fill with empty drafts
 * they then have to tidy.
 *
 * Local recovery costs nothing, burns no numbers, and covers MORE cases than a
 * server autosave would: the back button, a refresh, a crashed browser, a
 * phone that killed the tab to reclaim memory, and a flat battery. The quote
 * is still only "real" when the contractor says it is.
 *
 * The trade it does NOT cover: switching device. That needs a server draft,
 * and it is not worth a permanently gappy numbering sequence.
 */

const PREFIX = "jamquote:draft:";

/** Stale drafts are worse than none — being offered a half-quote from three
 * weeks ago is confusing rather than helpful, and by then the prices have
 * probably moved. */
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export interface StoredDraft<T> {
  savedAt: number;
  values: T;
}

/**
 * One key per editing context.
 *
 * A NEW quote and an edit of QT-0139 are different drafts and must not
 * overwrite each other — otherwise opening an edit would offer to restore
 * something typed on a different quote entirely.
 */
export function draftKey(mode: "new" | "edit", quoteId?: string): string {
  return `${PREFIX}${mode === "edit" && quoteId ? `edit:${quoteId}` : "new"}`;
}

/** Writes, and never throws. Storage can be full, disabled, or blocked in a
 * private window — none of which should break the editor the contractor is
 * typing into. Losing the safety net is survivable; losing the form is not. */
export function saveDraft<T>(key: string, values: T): void {
  try {
    const payload: StoredDraft<T> = { savedAt: Date.now(), values };
    window.localStorage.setItem(key, JSON.stringify(payload));
  } catch {
    /* storage unavailable — the editor carries on without recovery */
  }
}

/** Reads back a draft, or undefined when there is nothing usable. */
export function loadDraft<T>(key: string, now: number = Date.now()): StoredDraft<T> | undefined {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as StoredDraft<T>;
    if (typeof parsed?.savedAt !== "number" || !parsed.values) return undefined;
    if (now - parsed.savedAt > MAX_AGE_MS) {
      clearDraft(key);
      return undefined;
    }
    return parsed;
  } catch {
    // Corrupt or from an older shape of the form. Drop it rather than letting
    // a parse error take down the page the contractor came here to use.
    clearDraft(key);
    return undefined;
  }
}

export function clearDraft(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    /* nothing to do */
  }
}

/**
 * Whether a stored draft is worth offering back.
 *
 * An untouched form autosaves too — the effect fires on mount — so without
 * this an empty draft would prompt "restore?" on every visit and train the
 * contractor to dismiss the banner without reading it. Then the one time it
 * matters, they dismiss that too.
 */
export function draftIsWorthRestoring(values: {
  lines?: unknown[];
  clientId?: string;
}): boolean {
  const hasLines = (values.lines?.length ?? 0) > 0;
  return hasLines || Boolean(values.clientId);
}

/** "2 minutes ago" — how long the recovered work has been sitting there.
 * Reassures the contractor that this is THEIR quote from just now, not
 * something unfamiliar. */
export function draftAge(savedAt: number, now: number = Date.now()): string {
  const mins = Math.floor((now - savedAt) / 60_000);
  if (mins < 1) return "just now";
  if (mins === 1) return "1 minute ago";
  if (mins < 60) return `${mins} minutes ago`;
  const hours = Math.floor(mins / 60);
  if (hours === 1) return "1 hour ago";
  if (hours < 24) return `${hours} hours ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "yesterday" : `${days} days ago`;
}
