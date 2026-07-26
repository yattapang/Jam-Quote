"use client";

import { useMemo, useState } from "react";
import Card from "@/components/ui/Card";
import MoneyText from "@/components/ui/MoneyText";
import StatusPill from "@/components/ui/StatusPill";
import DeleteRowButton from "@/components/ui/DeleteRowButton";
import EditMaterialButton from "./EditMaterialButton";
import type { MaterialFavourite } from "@/lib/types";
import shared from "../shared.module.css";

const UNCATEGORIZED = "Uncategorized";

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
 * Materials catalog list — a category-filter chip row above the saved
 * materials, mirroring QuotesListClient's status-filter pattern. Materials
 * with no category/specs (the pre-existing shape) fall into the
 * "Uncategorized" bucket and render exactly as they did before this feature:
 * just name, unit, and price.
 */
export default function MaterialsListClient({ materials }: { materials: MaterialFavourite[] }) {
  const [filter, setFilter] = useState("ALL");

  const categories = useMemo(() => {
    const present = new Set(materials.map((m) => m.category || UNCATEGORIZED));
    return Array.from(present).sort();
  }, [materials]);

  const visible = filter === "ALL" ? materials : materials.filter((m) => (m.category || UNCATEGORIZED) === filter);

  return (
    <>
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

      <Card>
        {visible.length === 0 ? (
          <span className={shared.empty}>
            {materials.length === 0
              ? "No saved materials yet — add one here, or save a quote line with the ★ button in the quote builder."
              : "No materials in this category."}
          </span>
        ) : (
          <div className={shared.list}>
            {visible.map((m) => {
              const specs = specsSummary(m.specs);
              return (
                <div key={m.id} className={shared.row}>
                  <div className={shared.rowMain}>
                    <span className={shared.rowTitle}>
                      {m.name}
                      {m.category && <StatusPill label={m.category} kind="info" />}
                    </span>
                    {(specs || m.unit) && (
                      <span className={shared.rowSub}>
                        {specs}
                        {specs && m.unit ? " · " : ""}
                        {m.unit}
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
