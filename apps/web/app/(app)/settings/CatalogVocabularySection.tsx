"use client";

import { useMemo, useState } from "react";
import Card from "@/components/ui/Card";
import StatusPill from "@/components/ui/StatusPill";
import fieldStyles from "@/components/ui/Field.module.css";
import {
  hideCatalogEntry,
  unhideCatalogEntry,
  type ApiHiddenCatalogEntry,
  type ApiMaterialCategory,
  type ApiMaterialUnit,
  type CatalogEntryKind,
  type Trade,
} from "@/lib/api-client";
import { invalidateMaterialSchema } from "@/lib/use-material-schema";
import { buildHiddenSet, isHidden, orderForDisplay, withHiddenToggled } from "@/lib/catalog-visibility";
import shared from "../shared.module.css";
import styles from "./CatalogVocabularySection.module.css";

/**
 * "Catalog & vocabulary" (Phase 3, PLANNING.md — "Archive & hide vocabulary").
 *
 * Lists every material category, material unit and trade this business can
 * see — curated (shared, from JamQuote) and its own — with a control to hide
 * or restore each one. Fetched with includeHidden=true server-side (see
 * getMaterialSchema/getTrades in lib/api-server.ts) so a hidden row is still
 * here to be restored: an entry that vanished the moment it was hidden could
 * never be brought back from this screen.
 *
 * Deliberately its own settings card with explicit hide/restore buttons
 * rather than an inline "x" on the pickers themselves — PLANNING.md calls
 * out that archiving must be reversible and a destructive-looking control
 * should not sit beside the controls used to just pick a value.
 */

/** A row from any of the three groups, normalized to what this screen
 * actually renders — done once here so the three groups below share one
 * row component instead of three near-identical ones. */
interface Row {
  id: string;
  label: string;
  custom: boolean;
}

function toRows(items: readonly { id: string; label: string; custom: boolean }[]): Row[] {
  return items.map((i) => ({ id: i.id, label: i.label, custom: i.custom }));
}

export default function CatalogVocabularySection({
  categories,
  units,
  trades,
  materials,
  labourRates,
  equipment,
  hiddenEntries,
}: {
  categories: ApiMaterialCategory[];
  units: ApiMaterialUnit[];
  trades: Trade[];
  /** The library items themselves. All three arrive with hidden rows INCLUDED
   * — a row that vanished the moment it was hidden could never be restored. */
  materials: { id: string; name: string }[];
  labourRates: { id: string; trade: string; skillTier?: string | null }[];
  equipment: { id: string; name: string }[];
  hiddenEntries: ApiHiddenCatalogEntry[];
}) {
  const [hiddenSet, setHiddenSet] = useState(() => buildHiddenSet(hiddenEntries));
  // Tracks in-flight "kind:rowId" toggles so only the row being changed shows
  // a busy state — a slow request for one row must not freeze the others.
  const [busyKeys, setBusyKeys] = useState<ReadonlySet<string>>(new Set());
  const [error, setError] = useState("");

  const categoryRows = useMemo(() => toRows(categories), [categories]);
  const unitRows = useMemo(() => toRows(units), [units]);
  const tradeRows = useMemo(
    () => toRows(trades.map((t) => ({ id: t.id, label: t.name, custom: t.custom }))),
    [trades],
  );

  // `custom: true` on all three: these are the contractor's OWN rows, never
  // curated platform ones, so the "Yours" badge is always right.
  const materialRows = useMemo(
    () => toRows(materials.map((m) => ({ id: m.id, label: m.name, custom: true }))),
    [materials],
  );
  const labourRateRows = useMemo(
    () =>
      toRows(
        labourRates.map((r) => ({
          id: r.id,
          label: r.skillTier ? `${r.trade} — ${r.skillTier}` : r.trade,
          custom: true,
        })),
      ),
    [labourRates],
  );
  const equipmentRows = useMemo(
    () => toRows(equipment.map((e) => ({ id: e.id, label: e.name, custom: true }))),
    [equipment],
  );

  async function toggle(kind: CatalogEntryKind, rowId: string, currentlyHidden: boolean) {
    const key = `${kind}:${rowId}`;
    setBusyKeys((prev) => new Set(prev).add(key));
    setError("");
    try {
      if (currentlyHidden) {
        await unhideCatalogEntry(kind, rowId);
      } else {
        await hideCatalogEntry(kind, rowId);
      }
      setHiddenSet((prev) => withHiddenToggled(prev, kind, rowId, !currentlyHidden));
      // Without this the materials/quote-builder pickers keep offering (or
      // keep omitting) this row until a full page reload, which reads
      // exactly like the hide/restore having silently failed.
      invalidateMaterialSchema();
    } catch {
      setError("Couldn't update that — is the API running?");
    } finally {
      setBusyKeys((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  }

  return (
    <Card>
      <h2 className={styles.title}>Catalog &amp; vocabulary</h2>
      <p className={styles.blurb}>
        Hide anything you never use to shorten your dropdowns — the words you pick from
        (categories, units, trades) or the saved items themselves. Hiding one does not hide the
        other: hiding the trade &ldquo;Tiler&rdquo; shortens the trade list, while hiding the rate
        &ldquo;Tiler — Master&rdquo; takes it out of the quote line picker. Hiding never deletes
        anything — it stays on quotes you&apos;ve already sent, and you can restore it here any
        time.
      </p>

      {error && <span className={fieldStyles.error}>{error}</span>}

      <div className={styles.groups}>
        <CatalogGroup
          title="Material categories"
          rows={categoryRows}
          kind="MATERIAL_CATEGORY"
          hiddenSet={hiddenSet}
          busyKeys={busyKeys}
          onToggle={toggle}
        />
        <CatalogGroup
          title="Material units"
          rows={unitRows}
          kind="MATERIAL_UNIT"
          hiddenSet={hiddenSet}
          busyKeys={busyKeys}
          onToggle={toggle}
        />
        <CatalogGroup
          title="Trades"
          rows={tradeRows}
          kind="TRADE"
          hiddenSet={hiddenSet}
          busyKeys={busyKeys}
          onToggle={toggle}
        />
        <CatalogGroup
          title="Saved materials"
          rows={materialRows}
          kind="MATERIAL"
          hiddenSet={hiddenSet}
          busyKeys={busyKeys}
          onToggle={toggle}
        />
        <CatalogGroup
          title="Labour rates"
          rows={labourRateRows}
          kind="LABOUR_RATE"
          hiddenSet={hiddenSet}
          busyKeys={busyKeys}
          onToggle={toggle}
        />
        <CatalogGroup
          title="Equipment"
          rows={equipmentRows}
          kind="EQUIPMENT"
          hiddenSet={hiddenSet}
          busyKeys={busyKeys}
          onToggle={toggle}
        />
      </div>
    </Card>
  );
}

function CatalogGroup({
  title,
  rows,
  kind,
  hiddenSet,
  busyKeys,
  onToggle,
}: {
  title: string;
  rows: Row[];
  kind: CatalogEntryKind;
  hiddenSet: ReadonlySet<string>;
  busyKeys: ReadonlySet<string>;
  onToggle: (kind: CatalogEntryKind, rowId: string, currentlyHidden: boolean) => void;
}) {
  const ordered = orderForDisplay(rows, hiddenSet, kind);

  return (
    <div className={styles.group}>
      <div className={styles.groupTitle}>{title}</div>
      {ordered.length === 0 ? (
        <span className={shared.empty}>Nothing here yet.</span>
      ) : (
        <div className={shared.list}>
          {ordered.map((row) => {
            const hidden = isHidden(hiddenSet, kind, row.id);
            const busy = busyKeys.has(`${kind}:${row.id}`);
            return (
              <div key={row.id} className={`${styles.row} ${hidden ? styles.rowHidden : ""}`}>
                <div className={shared.rowMain}>
                  <span className={styles.rowTitle}>
                    {row.label}
                    {hidden && <StatusPill label="Hidden" kind="neutral" />}
                    {row.custom ? (
                      <StatusPill label="Yours" kind="info" />
                    ) : (
                      <span className={styles.curated}>Curated</span>
                    )}
                  </span>
                </div>
                <div className={shared.rowRight}>
                  <button
                    type="button"
                    className={styles.toggle}
                    onClick={() => onToggle(kind, row.id, hidden)}
                    disabled={busy}
                  >
                    {busy ? "…" : hidden ? "Restore" : "Hide"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
