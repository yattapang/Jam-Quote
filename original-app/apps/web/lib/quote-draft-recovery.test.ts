import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearDraft,
  draftAge,
  draftIsWorthRestoring,
  draftKey,
  loadDraft,
  saveDraft,
} from "./quote-draft-recovery";

/** jsdom is not configured for this suite, so localStorage is stubbed. */
function stubStorage(store: Record<string, string> = {}) {
  vi.stubGlobal("window", {
    localStorage: {
      getItem: (k: string) => store[k] ?? null,
      setItem: (k: string, v: string) => { store[k] = v; },
      removeItem: (k: string) => { delete store[k]; },
    },
  });
  return store;
}

beforeEach(() => stubStorage());
afterEach(() => vi.unstubAllGlobals());

describe("draftKey", () => {
  it("keeps a new quote and an edit apart", () => {
    // Otherwise opening an edit would offer to restore something typed on a
    // completely different quote.
    expect(draftKey("new")).not.toBe(draftKey("edit", "q1"));
  });

  it("keeps two different edits apart", () => {
    expect(draftKey("edit", "q1")).not.toBe(draftKey("edit", "q2"));
  });

  it("falls back to the new-quote key when an edit has no id", () => {
    expect(draftKey("edit")).toBe(draftKey("new"));
  });
});

describe("saveDraft / loadDraft", () => {
  it("returns what was stored", () => {
    saveDraft("k", { lines: [{ description: "Cement" }] });
    expect(loadDraft<{ lines: unknown[] }>("k")?.values.lines).toHaveLength(1);
  });

  it("is undefined when nothing was stored", () => {
    expect(loadDraft("nothing-here")).toBeUndefined();
  });

  it("drops a draft older than a week rather than offering it back", () => {
    // A half-quote from three weeks ago confuses rather than helps, and its
    // prices have probably moved.
    const store = stubStorage();
    store["k"] = JSON.stringify({ savedAt: 0, values: { lines: [1] } });
    expect(loadDraft("k", 8 * 24 * 60 * 60 * 1000)).toBeUndefined();
    // ...and clears it, so it cannot be reconsidered later.
    expect(store["k"]).toBeUndefined();
  });

  it("survives corrupt storage instead of taking the page down", () => {
    const store = stubStorage();
    store["k"] = "{not json";
    expect(loadDraft("k")).toBeUndefined();
  });

  it("ignores a payload from an older shape of the form", () => {
    const store = stubStorage();
    store["k"] = JSON.stringify({ nope: true });
    expect(loadDraft("k")).toBeUndefined();
  });

  it("never throws when storage is unavailable", () => {
    // Private windows and full quotas both do this. Losing the safety net is
    // survivable; losing the form the contractor is typing into is not.
    vi.stubGlobal("window", {
      localStorage: {
        getItem: () => { throw new Error("denied"); },
        setItem: () => { throw new Error("denied"); },
        removeItem: () => { throw new Error("denied"); },
      },
    });
    expect(() => saveDraft("k", { a: 1 })).not.toThrow();
    expect(() => clearDraft("k")).not.toThrow();
    expect(loadDraft("k")).toBeUndefined();
  });
});

describe("draftIsWorthRestoring", () => {
  it("says no to an untouched form", () => {
    // The autosave fires on mount, so without this an empty draft would prompt
    // "restore?" every visit and train the contractor to dismiss it unread.
    expect(draftIsWorthRestoring({ lines: [], clientId: "" })).toBe(false);
  });

  it("says yes once there is a line", () => {
    expect(draftIsWorthRestoring({ lines: [{}], clientId: "" })).toBe(true);
  });

  it("says yes once a client has been chosen, even with no lines", () => {
    expect(draftIsWorthRestoring({ lines: [], clientId: "cl1" })).toBe(true);
  });
});

describe("draftAge", () => {
  const now = 1_000_000_000_000;
  it("reads as time, not a timestamp", () => {
    expect(draftAge(now - 30_000, now)).toBe("just now");
    expect(draftAge(now - 60_000, now)).toBe("1 minute ago");
    expect(draftAge(now - 20 * 60_000, now)).toBe("20 minutes ago");
    expect(draftAge(now - 3 * 3_600_000, now)).toBe("3 hours ago");
    expect(draftAge(now - 26 * 3_600_000, now)).toBe("yesterday");
    expect(draftAge(now - 72 * 3_600_000, now)).toBe("3 days ago");
  });
});
