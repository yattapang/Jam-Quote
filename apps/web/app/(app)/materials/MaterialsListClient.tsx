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
import { useMaterialSchema } from "@/lib/use-material-schema";
import type { MaterialFavourite } from "@/lib/types";
import shared from "../shared.module.css";

const UNCATEGORIZED = "Uncategorized";
const SEARCH_DEBOUNCE_MS = 300;

/**
 * Compact "Diameter: 1/2in, Length: 20ft" summary of a material's specs, or ""
 * when it has none.
 *
 * As of Phase 2a specs are keyed by attribute KEY ("bagSize"), not by display
 * label ("Bag size"), so the key is translated through the category's
 * attributes. Without that the list would read "bagSize: 42.5kg". Pre-2a rows
 * whose category is unknown fall back to the raw key, which is what they
 * always showed.
 */
function specsSummary(
  specs: Record<string, string> | undefined,
  attributes: { key: string; label: string }[] | undefined,
): string {
  if (!specs) return "";
  const labelByKey = new Map((attributes ?? []).map((a) => [a.key, a.label]));
  return Object.entries(specs)
    .filter(([, value]) => value)
    .map(([key, value]) => `${labelByKey.get(key) ?? key}: ${value}`)
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

  const { schema } = useMaterialSchema();

  /**
   * Category chips always derive from the page's original full snapshot, not
   * the currently-filtered `materials` state, so the chip row doesn't
   * shrink/reflow as search results narrow.
   *
   * Two shapes coexist here. A Phase 2a material carries categoryDefId and no
   * legacy `category` string, so keying chips off `category` alone would file
   * every newly-created material under "Uncategorized". Chips are therefore
   * keyed by categoryDefId when present (labelled from the schema) and fall
   * back to the legacy string for pre-2a rows.
   */
  const categories = useMemo(() => {
    const labelById = new Map((schema?.categories ?? []).map((c) => [c.id, c.label]));
    const present = new Map<string, string>();
    for (const m of initialMaterials) {
      if (m.categoryDefId) {
        // Until the schema loads, fall back to the legacy label so the chip is
        // never blank; migrated rows retain it.
        present.set(m.categoryDefId, labelById.get(m.categoryDefId) ?? m.category ?? "Category");
      } else if (m.category) {
        present.set(m.category, m.category);
      } else {
        present.set(UNCATEGORIZED, UNCATEGORIZED);
      }
    }
    return Array.from(present, ([value, label]) => ({ value, label })).sort((a, b) =>
      a.label.localeCompare(b.label),
    );
  }, [initialMaterials, schema]);

  /** A chip value is a categoryDefId when the schema knows it, otherwise a
   * legacy category string — they go to different query params. */
  const filterParams = useMemo(() => {
    if (filter === "ALL") return {};
    const isCategoryDefId = (schema?.categories ?? []).some((c) => c.id === filter);
    return isCategoryDefId ? { categoryDefId: filter } : { category: filter };
  }, [filter, schema]);

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
      ...filterParams,
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
  }, [debouncedQuery, filter, filterParams, initialMaterials]);

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
            <button
              key={c.value}
              className={filter === c.value ? shared.chipActive : shared.chip}
              onClick={() => setFilter(c.value)}
            >
              {c.label}
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
              const category = m.categoryDefId
                ? schema?.categories.find((c) => c.id === m.categoryDefId)
                : undefined;
              const specs = specsSummary(m.specs, category?.attributes);
              // unitId supersedes the legacy free-text unit; fall back to it so
              // pre-2a rows keep rendering while the schema loads.
              const unitLabel = m.unitId
                ? (schema?.units.find((u) => u.id === m.unitId)?.label ?? m.unit)
                : m.unit;
              const categoryLabel = category?.label ?? m.category;
              return (
                <div key={m.id} className={shared.row}>
                  <div className={shared.rowMain}>
                    <span className={shared.rowTitle}>
                      {m.name}
                      {categoryLabel && <StatusPill label={categoryLabel} kind="info" />}
                    </span>
                    {(specs || unitLabel || m.description) && (
                      <span className={shared.rowSub}>
                        {specs}
                        {specs && unitLabel ? " · " : ""}
                        {unitLabel}
                        {(specs || unitLabel) && m.description ? " · " : ""}
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
