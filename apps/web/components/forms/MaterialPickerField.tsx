"use client";

import { useEffect, useRef, useState } from "react";
import fieldStyles from "@/components/ui/Field.module.css";
import styles from "./TradeSelectField.module.css";
import { getMaterialFavouritesClient } from "@/lib/api-client";
import { useDebouncedValue } from "@/lib/use-debounced-value";
import { materialFavouriteLabel } from "@/lib/material-display";
import type { MaterialFavourite } from "@/lib/types";

const SEARCH_LIMIT = 20;
const DEBOUNCE_MS = 250;

/**
 * Type-ahead saved-material picker for a quote line: queries the API's
 * q/category/limit-filtered GET /catalogs/material-favourites as you type
 * (debounced), instead of a plain <select> listing every saved material —
 * unusable once a contractor has hundreds of variants (2x4x8 cedar vs
 * 2x4x16 mahogany, same name, different specs).
 *
 * This is the existing type-ahead pattern in the codebase (#15,
 * TradeSelectField) adapted for a server-searched list rather than an
 * already-loaded one: same combobox ergonomics (arrow keys / Enter / Escape,
 * aria roles), and it literally shares TradeSelectField's CSS module rather
 * than duplicating the panel/option/highlight styles. The one behavioural
 * difference from TradeSelectField is deliberate — this is a one-shot picker
 * ("find and apply a material to this line"), not a field whose text mirrors
 * a persisted value, so it always resets to an empty query after a pick or
 * an Escape, the same way the <select> it replaces always reset to its
 * placeholder option.
 */
export default function MaterialPickerField({
  category,
  onPick,
  onAddNew,
  placeholder = "Search saved materials…",
}: {
  /** Category filter from the line's own filter dropdown ("" = all). */
  category?: string;
  onPick: (favourite: MaterialFavourite) => void;
  /** "+ Add material…" sentinel — opens the existing MaterialForm modal
   * flow (see QuoteBuilder's addingMaterialKey). */
  onAddNew: () => void;
  placeholder?: string;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<MaterialFavourite[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [highlight, setHighlight] = useState(0);
  const debouncedQuery = useDebouncedValue(query.trim(), DEBOUNCE_MS);
  // Guards against an earlier, slower request's response landing after a
  // newer one — only the response matching the most recent request wins.
  const requestRef = useRef(0);

  useEffect(() => {
    if (!open) return;
    const requestId = ++requestRef.current;
    setLoading(true);
    setError("");
    getMaterialFavouritesClient({
      q: debouncedQuery || undefined,
      category: category || undefined,
      limit: SEARCH_LIMIT,
    })
      .then((favs) => {
        if (requestRef.current !== requestId) return;
        setResults(favs);
        setLoading(false);
      })
      .catch(() => {
        if (requestRef.current !== requestId) return;
        setError("Couldn't search materials — is the API running?");
        setLoading(false);
      });
  }, [open, debouncedQuery, category]);

  // Combined list the keyboard highlight index walks: search results, then
  // the "+ Add material" row (always present — unlike TradeSelectField's
  // "+ Add" sentinel, this isn't conditioned on there being no exact match;
  // it's the same always-available escape hatch the old <select> offered).
  const rowCount = results.length + 1;

  function selectFavourite(fav: MaterialFavourite) {
    onPick(fav);
    setQuery("");
    setOpen(false);
    setHighlight(0);
  }

  function addNew() {
    onAddNew();
    setQuery("");
    setOpen(false);
    setHighlight(0);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
      setOpen(true);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, rowCount - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (highlight < results.length) {
        const fav = results[highlight];
        if (fav) selectFavourite(fav);
      } else {
        addNew();
      }
    } else if (e.key === "Escape") {
      setQuery("");
      setOpen(false);
    }
  }

  return (
    <div className={styles.wrap}>
      <input
        className={fieldStyles.control}
        placeholder={placeholder}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          setHighlight(0);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={handleKeyDown}
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        aria-label={placeholder}
      />
      {error && <span className={fieldStyles.error}>{error}</span>}
      {open && (
        <div className={styles.panel} role="listbox">
          {loading && results.length === 0 && <span className={styles.empty}>Searching…</span>}
          {!loading && results.length === 0 && (
            <span className={styles.empty}>
              {query.trim() ? "No matching materials." : "No saved materials yet."}
            </span>
          )}
          {results.map((f, i) => (
            <button
              key={f.id}
              type="button"
              role="option"
              aria-selected={false}
              className={`${styles.option} ${highlight === i ? styles.active : ""}`}
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => setHighlight(i)}
              onClick={() => selectFavourite(f)}
            >
              <span>{materialFavouriteLabel(f)}</span>
            </button>
          ))}
          <button
            type="button"
            className={`${styles.addOption} ${highlight === results.length ? styles.active : ""}`}
            onMouseDown={(e) => e.preventDefault()}
            onMouseEnter={() => setHighlight(results.length)}
            onClick={addNew}
          >
            + Add material…
          </button>
        </div>
      )}
    </div>
  );
}
