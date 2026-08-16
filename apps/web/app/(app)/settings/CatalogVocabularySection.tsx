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
  hiddenEntries,
}: {
  categories: ApiMaterialCategory[];
  units: ApiMaterialUnit[];
  trades: Trade[];
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
        Hide categories, units or trades you never use to shorten your dropdowns. Hiding does not
        delete anything — the entry stays available to quotes you&apos;ve already sent, and you can
        restore it here any time.
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
