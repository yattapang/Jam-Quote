"use client";

import { useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { formatJmd, LineCategory, QuoteDetailLevel, type GctTreatment } from "@jamquote/core";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import Modal from "@/components/ui/Modal";
import MoneyText from "@/components/ui/MoneyText";
import MaterialForm, {
  InlineAddRow,
  materialPayloadFromValues,
  type MaterialFormValues,
} from "@/components/forms/MaterialForm";
import MaterialPickerField from "@/components/forms/MaterialPickerField";
import {
  createMaterialFavourite,
  createMaterialUnit,
  updateMaterialFavourite,
  type ApiMaterialCategory,
  type ApiMaterialUnit,
} from "@/lib/api-client";
import { compareCatalogRows, isAddNewOption, mergeCatalogRow } from "@/lib/catalog-options";
import {
  ADD_HEADING_VALUE,
  assemblyLine,
  categoryHeadingOptions,
  gctOptions,
  headingToValue,
  labourLine,
  newLine,
  patchLine,
  removeLineByKey,
  applyUnitChoice,
  unitOptions,
  unitValue,
  toCents,
  valueToHeading,
  type DraftLine,
  type SelectOption,
} from "@/lib/line-editor";
import { materialLineDescription } from "@/lib/material-display";
import { RATE_UNIT_LABEL } from "@/lib/quote-totals";
import type { Assembly, LabourRate, MaterialFavourite } from "@/lib/types";
import { invalidateMaterialSchema, useMaterialSchema } from "@/lib/use-material-schema";
import shared from "./shared.module.css";
import styles from "./LineItemsEditor.module.css";

/**
 * Which vocabulary a line's Unit cell edits.
 *
 * "rate" writes `rateUnit` — the labour-time cadence (HOUR/DAY/…/UNIT) every
 * line carries for the API. "soldBy" writes `unitLabel` instead: the tenant's
 * MaterialUnit vocabulary ("bag", "sheet"), which is what actually prints next
 * to the quantity on the document, with `rateUnit` left as the line already
 * had it.
 */
export type UnitField = "rate" | "soldBy";


/** The editor row markup for one line item. Each line's Heading cell is
 * either the built-in/custom-heading Select, or — while the user is naming
 * a brand-new heading for that line — an inline text input. Desktop keeps
 * the original fixed multi-column grid (LineItemsEditor.module.css
 * `.lineRow`); at <=767px the same markup reflows into a stacked card with
 * small field labels, so nothing overflows a phone viewport. */
function LineRows({
  lines,
  headingOptions,
  favouriteCategories,
  materialFilters,
  unitOptionsFor,
  unitsLoading,
  savingFavKey,
  addingHeadingKey,
  newHeadingText,
  addingMaterialKey,
  addingMaterialBusy,
  onPatch,
  onRemove,
  onHeadingChange,
  onNewHeadingTextChange,
  onCommitNewHeading,
  onCancelNewHeading,
  onMaterialFilterChange,
  onPickFavourite,
  onSaveFavourite,
  onOpenAddMaterial,
  onCancelAddMaterial,
  onCreateMaterial,
  onAddMaterialBusyChange,
  onUnitChange,
}: {
  lines: DraftLine[];
  headingOptions: SelectOption[];
  /** Distinct categories present across saved materials, for the per-line
   * category filter dropdown. Empty when no saved material has a category
   * yet, in which case the filter is hidden entirely (backward compatible). */
  favouriteCategories: string[];
  /** Selected category filter per line key ("" / absent = all categories). */
  materialFilters: Record<string, string>;
  /** Sold-by options for one line — per line, because a line whose saved unit
   * is no longer in the vocabulary still has to show it. */
  unitOptionsFor: (line: DraftLine) => SelectOption[];
  unitsLoading: boolean;
  savingFavKey: string | null;
  addingHeadingKey: string | null;
  newHeadingText: string;
  addingMaterialKey: string | null;
  addingMaterialBusy: boolean;
  onPatch: (key: string, p: Partial<DraftLine>) => void;
  onRemove: (key: string) => void;
  onHeadingChange: (key: string, value: string) => void;
  onNewHeadingTextChange: (value: string) => void;
  onCommitNewHeading: (key: string) => void;
  onCancelNewHeading: () => void;
  onMaterialFilterChange: (key: string, value: string) => void;
  onPickFavourite: (key: string, favourite: MaterialFavourite) => void;
  onSaveFavourite: (key: string) => void;
  onOpenAddMaterial: (key: string) => void;
  onCancelAddMaterial: () => void;
  onCreateMaterial: (
    key: string,
    values: MaterialFormValues,
    category: ApiMaterialCategory | undefined,
  ) => Promise<void>;
  onAddMaterialBusyChange: (busy: boolean) => void;
  onUnitChange: (key: string, value: string) => void;
}) {
  return (
    <div className={styles.linesWrap}>
      {lines.map((l) => {
        const materialFilter = materialFilters[l.key] ?? "";
        return (
        <div key={l.key} className={styles.lineRow}>
          <div className={`${styles.fieldCell} ${styles.full}`}>
            <span className={styles.mobileLabel}>Saved material</span>
            {favouriteCategories.length > 0 && (
              <Select
                aria-label="Filter saved materials by category"
                options={[{ value: "", label: "All categories" }, ...favouriteCategories.map((c) => ({ value: c, label: c }))]}
                value={materialFilter}
                onChange={(e) => onMaterialFilterChange(l.key, e.target.value)}
                style={{ marginBottom: 6 }}
              />
            )}
            <MaterialPickerField
              category={materialFilter || undefined}
              onPick={(fav) => onPickFavourite(l.key, fav)}
              onAddNew={() => onOpenAddMaterial(l.key)}
            />
          </div>
          <div className={`${styles.fieldCell} ${styles.full}`}>
            <span className={styles.mobileLabel}>Heading</span>
            {addingHeadingKey === l.key ? (
              <Input
                autoFocus
                placeholder="New heading name"
                value={newHeadingText}
                onChange={(e) => onNewHeadingTextChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    onCommitNewHeading(l.key);
                  } else if (e.key === "Escape") {
                    e.preventDefault();
                    onCancelNewHeading();
                  }
                }}
                onBlur={() => onCommitNewHeading(l.key)}
              />
            ) : (
              <Select
                options={headingOptions}
                value={headingToValue(l.heading)}
                onChange={(e) => onHeadingChange(l.key, e.target.value)}
              />
            )}
          </div>
          <div className={`${styles.fieldCell} ${styles.full}`}>
            <span className={styles.mobileLabel}>Description</span>
            <Input placeholder="Description" value={l.description} onChange={(e) => onPatch(l.key, { description: e.target.value })} />
          </div>
          <div className={styles.fieldCell}>
            <span className={styles.mobileLabel}>Qty</span>
            <Input type="number" placeholder="Qty" value={l.quantity} onChange={(e) => onPatch(l.key, { quantity: e.target.value })} />
          </div>
          <div className={styles.fieldCell}>
            <span className={styles.mobileLabel}>Unit</span>
            <Select
              aria-label="Unit"
              options={unitOptionsFor(l)}
              value={unitValue(l)}
              onChange={(e) => onUnitChange(l.key, e.target.value)}
              disabled={unitsLoading}
            />
          </div>
          <div className={styles.fieldCell}>
            <span className={styles.mobileLabel}>Unit price ($)</span>
            <Input type="number" placeholder="Unit $" value={l.unitPriceDollars} onChange={(e) => onPatch(l.key, { unitPriceDollars: e.target.value })} />
          </div>
          <div className={styles.fieldCell}>
            <span className={styles.mobileLabel}>GCT</span>
            <Select options={gctOptions} value={l.gctTreatment} onChange={(e) => onPatch(l.key, { gctTreatment: e.target.value as GctTreatment })} />
          </div>
          <div className={styles.actionsCell}>
            <button
              type="button"
              aria-label="Save as favourite material"
              title="Save this line's description & price for reuse"
              onClick={() => onSaveFavourite(l.key)}
              disabled={savingFavKey === l.key || !l.description.trim() || toCents(l.unitPriceDollars) === 0}
              className={styles.saveFavButton}
            >
              {savingFavKey === l.key ? "…" : "★"}
            </button>
            <button type="button" aria-label="Remove line" onClick={() => onRemove(l.key)} className={styles.removeButton}>
              ×
            </button>
          </div>

          {addingMaterialKey === l.key && (
            <Modal title="Add material" onClose={() => (addingMaterialBusy ? undefined : onCancelAddMaterial())}>
              <MaterialForm
                submitLabel="Add material"
                onCancel={onCancelAddMaterial}
                onSubmit={(values, category) => onCreateMaterial(l.key, values, category)}
                onBusyChange={onAddMaterialBusyChange}
              />
            </Modal>
          )}
        </div>
        );
      })}
    </div>
  );
}

/**
 * The "Line items" section of the quote builder and the invoice editor — one
 * editor, so the material picker, the saved job types, the saved labour rates
 * and the sold-by vocabulary reach both screens rather than only whichever one
 * was touched last.
 *
 * The lines themselves stay with the caller, which needs them for its totals
 * and its save payload; everything that exists only while editing them — the
 * heading being named, the favourites cache, the pickers' modals — lives here.
 */
export default function LineItemsEditor({
  documentNoun,
  lines,
  onLinesChange,
  initialCustomHeadings = [],
  favourites: initialFavourites = [],
  assemblies = [],
  labourRates,
  detailLevel,
  onDetailLevelChange,
}: {
  /** The word this document calls itself, for the picker/detail-level labels. */
  documentNoun: "quote" | "invoice";
  lines: DraftLine[];
  onLinesChange: Dispatch<SetStateAction<DraftLine[]>>;
  /** Custom section titles the document was saved with, so they stay in the
   * heading dropdown when it is reopened. */
  initialCustomHeadings?: string[];
  /** Saved materials (name + last price) offered as a reuse picker per line. */
  favourites?: MaterialFavourite[];
  /** The business's job-type library, offered via "+ Add job type". Each
   * carries a server-computed unitCostCents and its component snapshot. */
  assemblies?: Assembly[];
  /** The business's labour-rate book, offered via "+ Add labour". Omitted
   * (rather than empty) hides the button entirely. */
  labourRates?: LabourRate[];
  detailLevel: QuoteDetailLevel;
  onDetailLevelChange: (level: QuoteDetailLevel) => void;
}) {
  const [customHeadings, setCustomHeadings] = useState<string[]>(initialCustomHeadings);
  const [addingHeadingKey, setAddingHeadingKey] = useState<string | null>(null);
  const [newHeadingText, setNewHeadingText] = useState("");
  // Local copy of the saved-materials list — seeded from props, then kept in
  // sync locally when the user creates one inline ("+ Add material…") so it
  // appears immediately in the picker without navigating away or losing the
  // in-progress document.
  const [favourites, setFavourites] = useState<MaterialFavourite[]>(initialFavourites);
  const [savingFavKey, setSavingFavKey] = useState<string | null>(null);
  const [favError, setFavError] = useState("");
  const [addingMaterialKey, setAddingMaterialKey] = useState<string | null>(null);
  const [addingMaterialBusy, setAddingMaterialBusy] = useState(false);
  // Per-line saved-material category filter ("" = all categories). Keyed by
  // line key so each line's picker narrows independently.
  const [materialFilters, setMaterialFilters] = useState<Record<string, string>>({});
  // "+ Add job type" / "+ Add labour" pickers: the row being previewed and the
  // quantity to add. Closed unless the matching `adding…` flag is set.
  const [jobTypeId, setJobTypeId] = useState<string>("");
  const [jobTypeQty, setJobTypeQty] = useState("1");
  const [addingJobType, setAddingJobType] = useState(false);
  const [labourRateId, setLabourRateId] = useState<string>("");
  const [labourQty, setLabourQty] = useState("1");
  const [addingLabour, setAddingLabour] = useState(false);
  // The line whose Sold-by cell asked for a unit the vocabulary doesn't have.
  const [addingUnitKey, setAddingUnitKey] = useState<string | null>(null);
  const [addedUnits, setAddedUnits] = useState<ApiMaterialUnit[]>([]);

  // Only the sold-by cell needs the vocabulary; the rate-unit cell is a fixed
  // enum, so a screen showing that one pays for no request it didn't make
  // before.
  const { schema, loading: unitsLoading } = useMaterialSchema();
  // A unit created from a line's "+ Add new unit…" is spliced in locally: the
  // schema cache is invalidated on create, but that only takes effect on the
  // next mount, and the contractor is mid-document.
  const units = useMemo(
    () =>
      addedUnits.reduce<ApiMaterialUnit[]>(
        (rows, row) => mergeCatalogRow(rows, row, compareCatalogRows),
        schema?.units ?? [],
      ),
    [schema, addedUnits],
  );

  /** Distinct categories present across saved materials, for the per-line
   * filter dropdown. Empty (and the filter hidden) until any material has a
   * category — existing businesses with only flat, uncategorized materials
   * see no change here. */
  const favouriteCategories = useMemo(
    () => Array.from(new Set(favourites.map((f) => f.category).filter((c): c is string => !!c))).sort(),
    [favourites],
  );
  const setMaterialFilter = (key: string, value: string) =>
    setMaterialFilters((f) => ({ ...f, [key]: value }));

  const patch = (key: string, p: Partial<DraftLine>) => onLinesChange((ls) => patchLine(ls, key, p));
  const removeLine = (key: string) => onLinesChange((ls) => removeLineByKey(ls, key));

  const onUnitChange = (key: string, value: string) => {
    if (isAddNewOption(value)) return setAddingUnitKey(key);
    patch(key, applyUnitChoice(value));
  };

  /** Creates a tenant unit from a line's "+ Add new unit…" prompt and applies
   * it to that line. The create is idempotent server-side, so a label the
   * business already has comes back as the existing row. */
  const addUnitForLine = async (key: string, label: string) => {
    const created = await createMaterialUnit(label);
    invalidateMaterialSchema();
    setAddedUnits((us) => (us.some((u) => u.id === created.id) ? us : [...us, created]));
    patch(key, { unitLabel: created.label });
    setAddingUnitKey(null);
  };

  /** Fills a line's description + unit price from a picked favourite (via
   * the type-ahead MaterialPickerField, which fetches from the API directly
   * rather than the locally-cached `favourites` array, so it hands back the
   * full favourite object rather than just an id). The description is
   * composed from the favourite's name + spec values (+ its own description,
   * if set) via materialLineDescription — previously this used only
   * `fav.name`, so a variant's Dimension/Length/Grade specs never made it
   * onto the actual document line, only into the picker's dropdown label. Also
   * stamps materialFavouriteId so ★ Save-as-favourite can later update this
   * exact variant precisely (see saveFavourite). Only nudges the heading to
   * Materials when the line is still on its untouched default heading — an
   * already-customized heading is left alone. */
  const pickFavourite = (key: string, fav: MaterialFavourite) => {
    onLinesChange((ls) =>
      ls.map((l) => {
        if (l.key !== key) return l;
        const isDefaultHeading = l.heading.kind === "category" && l.heading.category === LineCategory.MATERIAL;
        return {
          ...l,
          description: materialLineDescription(fav),
          unitPriceDollars: String(fav.priceDollars),
          // `fav.unit` is the resolved MaterialUnit label for 2a materials and
          // the legacy free-text string for older ones; either way it is what
          // the customer should see next to the quantity.
          unitLabel: fav.unit,
          heading: isDefaultHeading ? { kind: "category", category: LineCategory.MATERIAL } : l.heading,
          materialFavouriteId: fav.id,
        };
      }),
    );
    // Keep the locally-cached list in sync so favouriteCategories (and any
    // other UI reading `favourites`) knows about a variant the type-ahead
    // found that this business hadn't loaded into it yet.
    setFavourites((favs) => (favs.some((f) => f.id === fav.id) ? favs : [...favs, fav]));
  };

  /**
   * Saves a line as a reusable favourite: last-price behaviour — updates an
   * existing favourite's price if one exists, otherwise creates a new one.
   * Skips silently if there's nothing meaningful to save (blank description
   * or zero price).
   *
   * Identity match, in order:
   *  1. `materialFavouriteId` — set when this line was populated by picking
   *     or creating a favourite (see pickFavourite/createMaterialForLine) and
   *     cleared the moment the description is hand-edited (see patchLine).
   *     This is exact: it can't confuse two variants that happen to share a
   *     name, because it isn't looking at the name at all.
   *  2. A fallback exact match on the *composed* description (name + specs +
   *     description, via materialLineDescription) for lines typed or edited
   *     freehand, which have no structured category/specs to compare against
   *     the plain document line — description text is genuinely all there is.
   *     This replaces the old bug: matching on `name` alone,
   *     case/whitespace-insensitively, ignoring specs and category entirely,
   *     which silently clobbered one variant's price with another's the
   *     moment two variants shared a name (e.g. "2x4" lumber in different
   *     lengths/grades). Matching the full composed text is strictly
   *     narrower — "2x4 x 16ft x Select" and "2x4 x 8ft x Select" no longer
   *     collide — without needing a confirmation prompt for the common case
   *     (re-saving the same picked material to update its price).
   */
  const saveFavourite = async (key: string) => {
    const line = lines.find((l) => l.key === key);
    if (!line) return;
    const name = line.description.trim();
    const priceCents = toCents(line.unitPriceDollars);
    if (!name || priceCents === 0) return;

    setSavingFavKey(key);
    setFavError("");
    try {
      const existing = line.materialFavouriteId
        ? favourites.find((f) => f.id === line.materialFavouriteId)
        : favourites.find((f) => materialLineDescription(f) === name);
      if (existing) {
        const updated = await updateMaterialFavourite(existing.id, { priceCents });
        setFavourites((favs) => favs.map((f) => (f.id === existing.id ? updated : f)));
      } else {
        const created = await createMaterialFavourite({ name, priceCents });
        setFavourites((favs) => [...favs, created]);
        onLinesChange((ls) => ls.map((l) => (l.key === key ? { ...l, materialFavouriteId: created.id } : l)));
      }
    } catch {
      setFavError("Couldn't save the material — is the API running?");
    } finally {
      setSavingFavKey(null);
    }
  };

  /** "+ Add material…" from a line's saved-materials picker: creates a new
   * favourite, appends it to the local list, and applies its composed
   * description/price to the line that opened the modal — all without
   * navigating away. Stamps materialFavouriteId for the same reason
   * pickFavourite does (see saveFavourite). */
  const createMaterialForLine = async (
    key: string,
    values: MaterialFormValues,
    category: ApiMaterialCategory | undefined,
  ) => {
    const created = await createMaterialFavourite(materialPayloadFromValues(values, category));
    invalidateMaterialSchema();
    setFavourites((favs) => [...favs, created]);
    onLinesChange((ls) =>
      ls.map((l) =>
        l.key === key
          ? {
              ...l,
              description: materialLineDescription(created),
              unitPriceDollars: String(created.priceDollars),
              unitLabel: created.unit,
              materialFavouriteId: created.id,
            }
          : l,
      ),
    );
    setAddingMaterialKey(null);
  };

  const selectedAssembly = assemblies.find((a) => a.id === jobTypeId);
  const selectedLabourRate = labourRates?.find((r) => r.id === labourRateId);

  const openJobTypePicker = () => {
    setJobTypeId(assemblies[0]?.id ?? "");
    setJobTypeQty("1");
    setAddingJobType(true);
  };
  /** Drops the picked job type onto the document as a new line, pre-filled
   * from the assembly's computed unit cost (still editable) and carrying its
   * component snapshot for DETAILED rendering. */
  const confirmAddJobType = () => {
    if (!selectedAssembly) return;
    const qty = Number(jobTypeQty) > 0 ? Number(jobTypeQty) : 1;
    onLinesChange((ls) => [...ls, assemblyLine(selectedAssembly, qty)]);
    setAddingJobType(false);
  };

  const openLabourPicker = () => {
    setLabourRateId(labourRates?.[0]?.id ?? "");
    setLabourQty("1");
    setAddingLabour(true);
  };
  /** Drops the picked labour rate onto the document as a new line, priced at
   * the rate book's figure and denominated in that rate's own cadence. */
  const confirmAddLabour = () => {
    if (!selectedLabourRate) return;
    const qty = Number(labourQty) > 0 ? Number(labourQty) : 1;
    onLinesChange((ls) => [...ls, labourLine(selectedLabourRate, qty)]);
    setAddingLabour(false);
  };

  const headingOptions = useMemo(
    () => [
      ...categoryHeadingOptions,
      ...customHeadings.map((title) => ({ value: `custom:${title}`, label: title })),
      { value: ADD_HEADING_VALUE, label: "+ Add heading…" },
    ],
    [customHeadings],
  );

  // Drives whether the summary/detailed toggle is offered — the setting only
  // affects job-type lines, so it's hidden until the document has at least one.
  const hasAssemblyLine = lines.some((l) => l.assemblyId);

  const onHeadingChange = (key: string, value: string) => {
    if (value === ADD_HEADING_VALUE) {
      setAddingHeadingKey(key);
      setNewHeadingText("");
      return;
    }
    patch(key, { heading: valueToHeading(value) });
  };
  /** Confirms the inline "new heading" input (Enter, or blur to also cover
   * clicking away): adds the title to the document's custom-heading list
   * (once) and selects it on the line that triggered "+ Add heading…". An
   * empty name is treated as a no-op cancel. */
  const commitNewHeading = (key: string) => {
    const title = newHeadingText.trim();
    setAddingHeadingKey(null);
    setNewHeadingText("");
    if (!title) return;
    setCustomHeadings((hs) => (hs.includes(title) ? hs : [...hs, title]));
    patch(key, { heading: { kind: "custom", title } });
  };
  const cancelNewHeading = () => {
    setAddingHeadingKey(null);
    setNewHeadingText("");
  };

  return (
    <section className={shared.section}>
      <div className={shared.sectionHead}>
        <h2 className={shared.sectionTitle}>Line items</h2>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <Button variant="outlineAccent" size="sm" onClick={() => onLinesChange((ls) => [...ls, newLine()])}>
            + Add line
          </Button>
          <Button
            variant="outlineAccent"
            size="sm"
            onClick={openJobTypePicker}
            disabled={assemblies.length === 0}
            title={assemblies.length === 0 ? "Create a job type first (Job types in the sidebar)" : "Add a saved job type as a line"}
          >
            + Add job type
          </Button>
          {labourRates && (
            <Button
              variant="outlineAccent"
              size="sm"
              onClick={openLabourPicker}
              disabled={labourRates.length === 0}
              title={labourRates.length === 0 ? "Create a labour rate first (Labour in the sidebar)" : "Add a saved labour rate as a line"}
            >
              + Add labour
            </Button>
          )}
        </div>
      </div>
      {hasAssemblyLine && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            margin: "0 0 10px",
            fontSize: 13,
            color: "var(--jq-text-muted)",
          }}
        >
          <span>Job type detail on {documentNoun}:</span>
          <div style={{ maxWidth: 200 }}>
            <Select
              aria-label={`Job type detail on ${documentNoun}`}
              options={[
                { value: QuoteDetailLevel.SUMMARY, label: "Summary (one line each)" },
                { value: QuoteDetailLevel.DETAILED, label: "Detailed (show breakdown)" },
              ]}
              value={detailLevel}
              onChange={(e) => onDetailLevelChange(e.target.value as QuoteDetailLevel)}
            />
          </div>
        </div>
      )}
      <Card>
        <LineRows
          lines={lines}
          headingOptions={headingOptions}
          favouriteCategories={favouriteCategories}
          materialFilters={materialFilters}
          unitOptionsFor={(l) => unitOptions(l, units)}
          unitsLoading={unitsLoading}
          savingFavKey={savingFavKey}
          addingHeadingKey={addingHeadingKey}
          newHeadingText={newHeadingText}
          addingMaterialKey={addingMaterialKey}
          addingMaterialBusy={addingMaterialBusy}
          onPatch={patch}
          onRemove={removeLine}
          onHeadingChange={onHeadingChange}
          onNewHeadingTextChange={setNewHeadingText}
          onCommitNewHeading={commitNewHeading}
          onCancelNewHeading={cancelNewHeading}
          onMaterialFilterChange={setMaterialFilter}
          onPickFavourite={pickFavourite}
          onSaveFavourite={saveFavourite}
          onOpenAddMaterial={setAddingMaterialKey}
          onCancelAddMaterial={() => setAddingMaterialKey(null)}
          onCreateMaterial={createMaterialForLine}
          onAddMaterialBusyChange={setAddingMaterialBusy}
          onUnitChange={onUnitChange}
        />
      </Card>
      {favError && <div style={{ color: "var(--jq-crit)", fontSize: 13 }}>{favError}</div>}

      {addingUnitKey && (
        <Modal title="Add unit" onClose={() => setAddingUnitKey(null)}>
          <InlineAddRow
            label="New unit"
            placeholder="e.g. per pallet"
            errorText="Couldn't add that unit — is the API running?"
            onAdd={(label) => addUnitForLine(addingUnitKey, label)}
            onCancel={() => setAddingUnitKey(null)}
          />
        </Modal>
      )}

      {addingJobType && (
        <Modal title="Add job type" onClose={() => setAddingJobType(false)}>
          <div style={{ display: "grid", gap: 12 }}>
            <Select
              label="Job type"
              options={assemblies.map((a) => ({
                value: a.id,
                label: `${a.name} — ${formatJmd(a.unitCostCents)}/${a.unit}`,
              }))}
              value={jobTypeId}
              onChange={(e) => setJobTypeId(e.target.value)}
            />
            <Input
              label="Quantity"
              type="number"
              min={0}
              step="any"
              value={jobTypeQty}
              onChange={(e) => setJobTypeQty(e.target.value)}
              hint={selectedAssembly ? `Priced per ${selectedAssembly.unit}` : undefined}
            />
            {selectedAssembly && (
              <div className={shared.totalRow} style={{ fontSize: 14 }}>
                <span>Line total (editable after adding)</span>
                <MoneyText
                  cents={Math.round((Number(jobTypeQty) || 0) * selectedAssembly.unitCostCents)}
                  weight={700}
                />
              </div>
            )}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 4 }}>
              <Button variant="ghost" onClick={() => setAddingJobType(false)}>
                Cancel
              </Button>
              <Button variant="primary" onClick={confirmAddJobType} disabled={!selectedAssembly}>
                Add to {documentNoun}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {addingLabour && labourRates && (
        <Modal title="Add labour" onClose={() => setAddingLabour(false)}>
          <div style={{ display: "grid", gap: 12 }}>
            <Select
              label="Labour rate"
              options={labourRates.map((r) => ({
                value: r.id,
                label: `${r.skillTier ? `${r.trade} — ${r.skillTier}` : r.trade} — ${formatJmd(r.rateCents)}/${RATE_UNIT_LABEL[r.rateUnit]}`,
              }))}
              value={labourRateId}
              onChange={(e) => setLabourRateId(e.target.value)}
            />
            <Input
              label="Quantity"
              type="number"
              min={0}
              step="any"
              value={labourQty}
              onChange={(e) => setLabourQty(e.target.value)}
              hint={selectedLabourRate ? `Priced per ${RATE_UNIT_LABEL[selectedLabourRate.rateUnit]}` : undefined}
            />
            {selectedLabourRate && (
              <div className={shared.totalRow} style={{ fontSize: 14 }}>
                <span>Line total (editable after adding)</span>
                <MoneyText
                  cents={Math.round((Number(labourQty) || 0) * selectedLabourRate.rateCents)}
                  weight={700}
                />
              </div>
            )}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 4 }}>
              <Button variant="ghost" onClick={() => setAddingLabour(false)}>
                Cancel
              </Button>
              <Button variant="primary" onClick={confirmAddLabour} disabled={!selectedLabourRate}>
                Add to {documentNoun}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </section>
  );
}
