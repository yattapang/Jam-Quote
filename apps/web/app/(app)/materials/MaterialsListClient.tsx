"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Card from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import MoneyText from "@/components/ui/MoneyText";
import StatusPill from "@/components/ui/StatusPill";
import DeleteRowButton from "@/components/ui/DeleteRowButton";
import EditMaterialButton from "./EditMaterialButton";
import { getMaterialFavouritesClient } from "@/lib/api-client";
import { useDebouncedValue } from "@/lib/use-debounced-value";
import type { MaterialFavourite } from "@/lib/types";
import shared from "../shared.module.css";

const UNCATEGORIZED = "Uncategorized";
const SEARCH_DEBOUNCE_MS = 300;

/** Compact "Diameter: 1/2in, Length: 20ft" summary of a material's specs, or
 * "" when it has none (older/uncategorized materials — unchanged display). */
function specsSummary(specs?: Record<string, string>): string {
  if (!specs) return "";
  return Object.entries(specs)
    .filter(([, value]) => value)
    .map(([key, value]) => `${key}: ${value}`)
    .join(", ");
}

/**
 * Materials catalog list — a search box plus a category-filter chip row
 * above the saved materials (chips mirror QuotesListClient's status-filter
 * pattern). Materials with no category/specs (the pre-existing shape) fall
 * into the "Uncategorized" bucket and render exactly as they did before this
 * feature: just name, unit, and price.
 *
 * The search box queries the API (GET /catalogs/material-favourites?q=…,
 * debounced) rather than filtering the `materials` prop client-side — that
 * prop is still the page's full initial snapshot (used unmodified for the
 * default "nothing typed, All categories" view, and to derive the category
 * chip set so chips don't shift as search results narrow), but once there
 * are hundreds of saved variants, filtering only what's already in the
 * browser stops finding anything beyond that snapshot. Typing and picking a
 * category chip both feed the same API call, so they combine correctly
 * (e.g. "cement" within the "Aggregate / Sand" category).
 */
export default function MaterialsListClient({ materials: initialMaterials }: { materials: MaterialFavourite[] }) {
  const [filter, setFilter] = useState("ALL");
  const [query, setQuery] = useState("");
  const [materials, setMaterials] = useState<MaterialFavourite[]>(initialMaterials);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const debouncedQuery = useDebouncedValue(query.trim(), SEARCH_DEBOUNCE_MS);
  // Guards against a slower, earlier request's response overwriting a
  // newer one that already landed.
  const requestRef = useRef(0);

  // Category chips always derive from the page's original full snapshot, not
  // the currently-filtered `materials` state, so the chip row doesn't
  // shrink/reflow as search results narrow.
  const categories = useMemo(() => {
    const present = new Set(initialMaterials.map((m) => m.category || UNCATEGORIZED));
    return Array.from(present).sort();
  }, [initialMaterials]);

  useEffect(() => {
    // Nothing typed and no category filter: show the full snapshot the page
    // already loaded server-side — no extra round trip for the default view.
    if (!debouncedQuery && filter === "ALL") {
      setMaterials(initialMaterials);
      setSearching(false);
      setSearchError("");
      return;
    }
    const requestId = ++requestRef.current;
    setSearching(true);
    setSearchError("");
    getMaterialFavouritesClient({
      q: debouncedQuery || undefined,
      category: filter === "ALL" ? undefined : filter,
    })
      .then((results) => {
        if (requestRef.current !== requestId) return;
        setMaterials(results);
        setSearching(false);
      })
      .catch(() => {
        if (requestRef.current !== requestId) return;
        setSearchError("Couldn't search materials — is the API running?");
        setSearching(false);
      });
  }, [debouncedQuery, filter, initialMaterials]);

  return (
    <>
      <div style={{ maxWidth: 320 }}>
        <Input
          placeholder="Search materials…"
          aria-label="Search materials"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {categories.length > 1 && (
        <div className={shared.filters}>
          <button className={filter === "ALL" ? shared.chipActive : shared.chip} onClick={() => setFilter("ALL")}>
            All
          </button>
          {categories.map((c) => (
            <button key={c} className={filter === c ? shared.chipActive : shared.chip} onClick={() => setFilter(c)}>
              {c}
            </button>
          ))}
        </div>
      )}

      {searchError && <div style={{ color: "var(--jq-crit)", fontSize: 13 }}>{searchError}</div>}

      <Card>
        {searching ? (
          <span className={shared.empty}>Searching…</span>
        ) : materials.length === 0 ? (
          <span className={shared.empty}>
            {initialMaterials.length === 0
              ? "No saved materials yet — add one here, or save a quote line with the ★ button in the quote builder."
              : "No materials match your search."}
          </span>
        ) : (
          <div className={shared.list}>
            {materials.map((m) => {
              const specs = specsSummary(m.specs);
              return (
                <div key={m.id} className={shared.row}>
                  <div className={shared.rowMain}>
                    <span className={shared.rowTitle}>
                      {m.name}
                      {m.category && <StatusPill label={m.category} kind="info" />}
                    </span>
                    {(specs || m.unit || m.description) && (
                      <span className={shared.rowSub}>
                        {specs}
                        {specs && m.unit ? " · " : ""}
                        {m.unit}
                        {(specs || m.unit) && m.description ? " · " : ""}
                        {m.description}
                      </span>
                    )}
                  </div>
                  <div className={shared.rowRight}>
                    <MoneyText cents={m.priceCents} />
                    <div style={{ display: "flex", gap: 8 }}>
                      <EditMaterialButton material={m} />
                      <DeleteRowButton
                        kind="material"
                        id={m.id}
                        confirmMessage={`Delete ${m.name}? This can't be undone.`}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </>
  );
}
