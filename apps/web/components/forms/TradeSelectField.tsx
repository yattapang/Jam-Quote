"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import fieldStyles from "@/components/ui/Field.module.css";
import styles from "./TradeSelectField.module.css";
import { createTrade, type Trade } from "@/lib/api-client";

/**
 * A reusable type-ahead trade picker: a text input that filters the trades
 * list (curated global master list + this business's own custom trades) as
 * you type, with an inline "+ Add "<typed>"…" option when nothing matches
 * exactly. Mirrors the ergonomics of ClientSelectField (pick from a list, or
 * create inline without losing your place) but as a filterable combobox
 * rather than a plain <select>, since trades are a much longer, freeform list.
 *
 * Controlled via value/onChange like a normal text field — `value` is the
 * trade NAME string (Business.tradeType is still a free string column, not a
 * foreign key), so typing and blurring without picking/adding anything keeps
 * working exactly like the plain input it replaces. Selecting an existing
 * option or using "+ Add" additionally persists/reuses a Trade row, which is
 * what populates the list for every other picker in this business (e.g. the
 * labour library, reusing this same component).
 */
export default function TradeSelectField({
  label = "Trade type",
  placeholder = "Select or type a trade…",
  trades,
  value,
  onChange,
}: {
  label?: string;
  placeholder?: string;
  trades: Trade[];
  value: string;
  onChange: (name: string) => void;
}) {
  const [options, setOptions] = useState<Trade[]>(trades);
  const [query, setQuery] = useState(value);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [highlight, setHighlight] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Keep the displayed text in sync when the caller's value changes from
  // outside (e.g. the form loading a different business record).
  useEffect(() => setQuery(value), [value]);

  const trimmed = query.trim();
  const filtered = useMemo(() => {
    if (!trimmed) return options;
    const needle = trimmed.toLowerCase();
    return options.filter((t) => t.name.toLowerCase().includes(needle));
  }, [options, trimmed]);
  const hasExactMatch = options.some((t) => t.name.toLowerCase() === trimmed.toLowerCase());
  // The add row shows whenever the list is open, not only once something has
  // been typed. It used to appear only after a non-matching query, so a
  // contractor who opened the list, scanned it, and did not see their trade
  // had no indication that adding one was even possible — the feature existed
  // and read as absent. Every other picker in the app offers an explicit
  // "+ Add new…" row up front; this now matches.
  //
  // With an empty box there is no name to save, so the row becomes a prompt
  // rather than an action: still visible, but inert and saying what to do.
  const canAdd = trimmed !== "" && !hasExactMatch;
  const showAdd = canAdd || trimmed === "";
  // Combined list the keyboard highlight index walks: filtered options, then
  // the "+ Add" row (if shown).
  const rowCount = filtered.length + (showAdd ? 1 : 0);

  function selectTrade(trade: Trade) {
    setQuery(trade.name);
    onChange(trade.name);
    setOpen(false);
    setError("");
  }

  async function addTrade() {
    const name = trimmed;
    if (!name || busy) return;
    setBusy(true);
    setError("");
    try {
      const created = await createTrade(name);
      setOptions((prev) => {
        if (prev.some((t) => t.id === created.id)) return prev;
        return [...prev, created].sort((a, b) => a.name.localeCompare(b.name));
      });
      setQuery(created.name);
      onChange(created.name);
      setOpen(false);
    } catch {
      setError("Couldn't add that trade — is the API running?");
    } finally {
      setBusy(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
      setOpen(true);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, Math.max(rowCount - 1, 0)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (highlight < filtered.length) {
        const trade = filtered[highlight];
        if (trade) selectTrade(trade);
      } else if (showAdd) {
        void addTrade();
      }
    } else if (e.key === "Escape") {
      setQuery(value);
      setOpen(false);
    }
  }

  return (
    <div className={styles.wrap}>
      {label && <span className={styles.label}>{label}</span>}
      <input
        ref={inputRef}
        className={fieldStyles.control}
        placeholder={placeholder}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          setHighlight(0);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          setOpen(false);
          const next = query.trim();
          if (next !== value) onChange(next);
        }}
        onKeyDown={handleKeyDown}
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
      />
      {error && <span className={fieldStyles.error}>{error}</span>}
      {open && (
        <div className={styles.panel} role="listbox">
          {filtered.length === 0 && !showAdd && <span className={styles.empty}>No trades found.</span>}
          {filtered.map((t, i) => (
            <button
              key={t.id}
              type="button"
              role="option"
              aria-selected={query.trim().toLowerCase() === t.name.toLowerCase()}
              className={`${styles.option} ${highlight === i ? styles.active : ""}`}
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => setHighlight(i)}
              onClick={() => selectTrade(t)}
            >
              <span>{t.name}</span>
              {t.custom && <span className={styles.badge}>custom</span>}
            </button>
          ))}
          {showAdd && (
            <button
              type="button"
              className={`${styles.addOption} ${canAdd ? "" : styles.addPrompt} ${highlight === filtered.length ? styles.active : ""}`}
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => setHighlight(filtered.length)}
              // Clicking the prompt focuses the box rather than doing nothing.
              // Disabled, it invited a click and ignored it — reported as "the
              // new row was not created", which is precisely what it looked
              // like. A control that explains what to do should also help you
              // do it.
              onClick={() => (canAdd ? void addTrade() : inputRef.current?.focus())}
              disabled={busy}
            >
              {busy
                ? "Adding…"
                : canAdd
                  ? `+ Add "${trimmed}"`
                  : "+ Add a new trade — type its name"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
