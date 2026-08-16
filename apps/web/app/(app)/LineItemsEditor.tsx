"use client";

import { useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { QuoteDetailLevel, type GctTreatment } from "@jamquote/core";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import Modal from "@/components/ui/Modal";
import fieldStyles from "@/components/ui/Field.module.css";
import MaterialForm, {
  InlineAddRow,
  materialPayloadFromValues,
  type MaterialFormValues,
} from "@/components/forms/MaterialForm";
import MaterialPickerField from "@/components/forms/MaterialPickerField";
import LabourRateForm, {
  labourRatePayloadFromValues,
  type LabourRateFormValues,
} from "@/components/forms/LabourRateForm";
import EquipmentForm, {
  equipmentPayloadFromValues,
  type EquipmentFormValues,
} from "@/components/forms/EquipmentForm";
import QuickJobForm from "@/components/forms/QuickJobForm";
import {
  createEquipmentItem,
  createJob,
  createLabourRate,
  createMaterialFavourite,
  createMaterialUnit,
  updateMaterialFavourite,
  type ApiMaterialCategory,
  type ApiMaterialUnit,
  type Trade,
} from "@/lib/api-client";
import { compareCatalogRows, isAddNewOption, mergeCatalogRow } from "@/lib/catalog-options";
import {
  ADD_HEADING_VALUE,
  applyJobPick,
  applyJobUnitEdit,
  applyKindChange,
  applyLabourRatePick,
  applyEquipmentPick,
  equipmentPickerOptions,
  labourRatePickerOptions,
  quickJobPayloadFromValues,
  categoryHeadingOptions,
  computeCoverageQuantity,
  coverageConfigForLine,
  coverageConfigFromFavourite,
  gctOptions,
  headingToValue,
  jobPickerOptions,
  lineKindOptions,
  materialPickPatch,
  newLine,
  patchLine,
  rateUnitOptions,
  removeLineByKey,
  applyUnitChoice,
  unitOptions,
  unitValue,
  toCents,
  valueToHeading,
  RATE_UNIT_PREFIX,
  LineKind,
  type DraftLine,
  type QuickJobFormValues,
  type SelectOption,
} from "@/lib/line-editor";
import { materialLineDescription } from "@/lib/material-display";
import { lineUnitLabel } from "@/lib/quote-totals";
import type { EquipmentItem, Job, LabourRate, MaterialFavourite } from "@/lib/types";
import { invalidateMaterialSchema, useMaterialSchema } from "@/lib/use-material-schema";
import shared from "./shared.module.css";
import styles from "./LineItemsEditor.module.css";

/** Sentinel value for the category filter's "+ New category…" row. Namespaced
 * so it can never collide with a real category label a contractor typed. */
const ADD_CATEGORY = "__jq_add_category__";

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


/** The editor row markup for one line item. Kind is the first control — it
 * decides which library the "Saved" cell offers (Material/Labour/Job) or
 * whether it offers one at all (Equipment has none), and which vocabulary
 * the Unit cell offers. Each line's Heading cell is either the
 * built-in/custom-heading Select, or — while the user is naming a brand-new
 * heading for that line — an inline text input. Desktop keeps the original
 * fixed multi-column grid (LineItemsEditor.module.css `.lineRow`); at
 * <=767px the same markup reflows into a stacked card with small field
 * labels, so nothing overflows a phone viewport. */
function LineRows({
  lines,
  headingOptions,
  favouriteCategories,
  materialFilters,
  jobs,
  labourRates,
  equipment,
  unitOptionsFor,
  unitsLoading,
  favourites,
  measuredQtyByKey,
  savingFavKey,
  addingHeadingKey,
  newHeadingText,
  addingMaterialKey,
  addingMaterialBusy,
  onPatch,
  onRemove,
  onKindChange,
  onHeadingChange,
  onNewHeadingTextChange,
  onCommitNewHeading,
  onCancelNewHeading,
  onMaterialFilterChange,
  onPickFavourite,
  onPickLabourRate,
  onPickEquipment,
  onPickJob,
  onSaveFavourite,
  onOpenAddMaterial,
  onCancelAddMaterial,
  onCreateMaterial,
  onAddMaterialBusyChange,
  onOpenAddLabourRate,
  onOpenAddJob,
  onOpenAddEquipment,
  onUnitChange,
  onMeasuredQtyChange,
}: {
  lines: DraftLine[];
  headingOptions: SelectOption[];
  /** Distinct categories present across saved materials, for the per-line
   * category filter dropdown. Empty when no saved material has a category
   * yet, in which case the filter is hidden entirely (backward compatible). */
  favouriteCategories: string[];
  /** Selected category filter per line key ("" / absent = all categories). */
  materialFilters: Record<string, string>;
  /** The Job Library — the Saved picker's source once a line's kind is JOB. */
  jobs: Job[];
  /** The labour-rate book — the Saved picker's source once a line's kind is
   * LABOUR. */
  labourRates: LabourRate[];
  equipment: EquipmentItem[];
  /** Sold-by options for one line — per line, because a line whose saved unit
   * is no longer in the vocabulary still has to show it. Only consulted for
   * MATERIAL/EQUIPMENT kinds; LABOUR uses rateUnitOptions directly and JOB
   * edits jobUnit as free text. */
  unitOptionsFor: (line: DraftLine) => SelectOption[];
  unitsLoading: boolean;
  /** Needed to look up a line's picked material's coverage config (see
   * coverageConfigForLine) — a line only knows the material's id, not its
   * measureUnit/coveragePerSellUnit/wastePct. */
  favourites: MaterialFavourite[];
  /** The measured-quantity text typed per line, keyed by line key. Not part
   * of DraftLine/the saved document — see LineItemsEditor's own state decl
   * for why. */
  measuredQtyByKey: Record<string, string>;
  savingFavKey: string | null;
  addingHeadingKey: string | null;
  newHeadingText: string;
  addingMaterialKey: string | null;
  addingMaterialBusy: boolean;
  onPatch: (key: string, p: Partial<DraftLine>) => void;
  onRemove: (key: string) => void;
  onKindChange: (key: string, kind: LineKind) => void;
  onHeadingChange: (key: string, value: string) => void;
  onNewHeadingTextChange: (value: string) => void;
  onCommitNewHeading: (key: string) => void;
  onCancelNewHeading: () => void;
  onMaterialFilterChange: (key: string, value: string) => void;
  onPickFavourite: (key: string, favourite: MaterialFavourite) => void;
  onPickLabourRate: (key: string, rateId: string) => void;
  onPickEquipment: (key: string, itemId: string) => void;
  onPickJob: (key: string, jobId: string) => void;
  onSaveFavourite: (key: string) => void;
  onOpenAddMaterial: (key: string) => void;
  onCancelAddMaterial: () => void;
  onCreateMaterial: (
    key: string,
    values: MaterialFormValues,
    category: ApiMaterialCategory | undefined,
  ) => Promise<void>;
  onAddMaterialBusyChange: (busy: boolean) => void;
  /** Opens the "+ Add new labour rate…" / "+ Add new job…" / "+ Add new
   * equipment…" modal for the given line — the other three kinds' answer to
   * onOpenAddMaterial above. */
  onOpenAddLabourRate: (key: string) => void;
  onOpenAddJob: (key: string) => void;
  onOpenAddEquipment: (key: string) => void;
  onUnitChange: (key: string, value: string) => void;
  onMeasuredQtyChange: (key: string, value: string) => void;
}) {
  // Hoisted out of the per-line map — the same options for every LABOUR line
  // on this document, so there is no reason to rebuild the list per row.
  const labourOptions: SelectOption[] = labourRatePickerOptions(labourRates);
  const equipmentOptions = equipmentPickerOptions(equipment);

  return (
    <div className={styles.linesWrap}>
      {lines.map((l) => {
        const materialFilter = materialFilters[l.key] ?? "";
        // Only offered when the picked material has coverage configured
        // (see coverageConfigForLine) — most lines have none, and this stays
        // silent for them exactly like sellUnitsRequired does in core. A kind
        // change always clears materialFavouriteId (see applyKindChange), so
        // this is naturally null for every non-MATERIAL line too.
        const coverageConfig = coverageConfigForLine(l, favourites);
        const measuredQtyText = measuredQtyByKey[l.key] ?? "";
        const coverage = coverageConfig
          ? computeCoverageQuantity(measuredQtyText, coverageConfig, lineUnitLabel(l))
          : null;
        return (
        <div key={l.key} className={styles.lineRow}>
          <div className={`${styles.fieldCell} ${styles.full}`}>
            <span className={styles.mobileLabel}>Kind</span>
            <Select
              aria-label="Line kind"
              options={lineKindOptions}
              value={l.kind}
              onChange={(e) => onKindChange(l.key, e.target.value as LineKind)}
            />
          </div>
          <div className={`${styles.fieldCell} ${styles.full}`}>
            <span className={styles.mobileLabel}>Saved</span>
            {l.kind === LineKind.MATERIAL && (
              <>
                {/* Always rendered, even with no categories yet — previously this
                    disappeared entirely for a business whose materials had none,
                    so the one place categories are visible on this screen was
                    invisible exactly when a contractor had none to see. */}
                <Select
                  aria-label="Filter saved materials by category"
                  options={[
                    { value: "", label: "All categories" },
                    ...favouriteCategories.map((c) => ({ value: c, label: c })),
                    { value: ADD_CATEGORY, label: "+ New category…" },
                  ]}
                  value={materialFilter}
                  onChange={(e) => {
                    // A category exists to classify materials, so creating one
                    // from a FILTER would leave you filtered to an empty set —
                    // the new category would immediately hide every material you
                    // have. Instead this opens the add-material form, where the
                    // category field creates one inline and it lands attached to
                    // a material, which is the only state where it is useful.
                    if (e.target.value === ADD_CATEGORY) onOpenAddMaterial(l.key);
                    else onMaterialFilterChange(l.key, e.target.value);
                  }}
                  style={{ marginBottom: 6 }}
                />
                <MaterialPickerField
                  category={materialFilter || undefined}
                  onPick={(fav) => onPickFavourite(l.key, fav)}
                  onAddNew={() => onOpenAddMaterial(l.key)}
                />
              </>
            )}
            {l.kind === LineKind.LABOUR && (
              <Select
                aria-label="Saved labour rate"
                options={labourOptions}
                value=""
                onChange={(e) => {
                  if (isAddNewOption(e.target.value)) return onOpenAddLabourRate(l.key);
                  if (e.target.value) onPickLabourRate(l.key, e.target.value);
                }}
              />
            )}
            {l.kind === LineKind.JOB && (
              <Select
                aria-label="Saved job"
                options={jobPickerOptions(l, jobs)}
                value={l.jobId ?? ""}
                onChange={(e) => {
                  if (isAddNewOption(e.target.value)) return onOpenAddJob(l.key);
                  if (e.target.value) onPickJob(l.key, e.target.value);
                }}
              />
            )}
            {l.kind === LineKind.EQUIPMENT && (
              <Select
                aria-label="Saved equipment"
                options={equipmentOptions}
                // Resets to the placeholder after each pick, like the labour
                // picker: a line keeps no equipment id, so there is nothing to
                // show as "currently selected" without inventing one.
                value=""
                onChange={(e) => {
                  if (isAddNewOption(e.target.value)) return onOpenAddEquipment(l.key);
                  onPickEquipment(l.key, e.target.value);
                }}
                // No longer disabled when the library is empty — that used to
                // be the bug: an empty equipment list left no way to add one
                // from here. The always-present "+ Add new equipment…" row
                // (equipmentPickerOptions) is exactly that way now.
              />
            )}
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
            {l.kind === LineKind.LABOUR ? (
              // Labour is denominated in the time vocabulary only (hour/day/
              // week/…) — no sold-by units, no "+ Add new unit". Routed
              // through the same tested applyUnitChoice used for materials so
              // there is one rule for "picking a time unit clears unitLabel".
              <Select
                aria-label="Unit"
                options={rateUnitOptions}
                value={l.rateUnit}
                onChange={(e) => onPatch(l.key, applyUnitChoice(`${RATE_UNIT_PREFIX}${e.target.value}`))}
              />
            ) : l.kind === LineKind.JOB ? (
              // A job's unit is its own free-text label ("sq ft"), not picked
              // from a vocabulary — editable in place, kept in sync with
              // unitLabel by applyJobUnitEdit so it actually prints.
              <Input
                aria-label="Unit"
                placeholder="e.g. sq ft"
                value={l.jobUnit ?? ""}
                onChange={(e) => onPatch(l.key, applyJobUnitEdit(e.target.value))}
              />
            ) : (
              <Select
                aria-label="Unit"
                options={unitOptionsFor(l)}
                value={unitValue(l)}
                onChange={(e) => onUnitChange(l.key, e.target.value)}
                disabled={unitsLoading}
              />
            )}
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

          {coverageConfig && (
            <div className={`${styles.fieldCell} ${styles.coverageCell}`}>
              <span className={styles.mobileLabel}>Measured quantity</span>
              <div className={styles.coverageInputRow}>
                <Input
                  aria-label={`Measured quantity, in ${coverageConfig.measureUnit}`}
                  type="number"
                  placeholder={`Measured qty (${coverageConfig.measureUnit})`}
                  value={measuredQtyText}
                  onChange={(e) => onMeasuredQtyChange(l.key, e.target.value)}
                />
                <span className={styles.coverageUnit}>{coverageConfig.measureUnit}</span>
              </div>
              {coverage && (
                <span className={fieldStyles.hint}>
                  {coverage.explanation}
                  {/* Once the contractor overrides Qty by hand — they know
                      their supplier's boxes run short — the working above
                      still describes what the calculator suggested, not what
                      the line will actually bill. Saying so keeps the hint
                      from quietly contradicting the field beside it. */}
                  {l.quantity !== coverage.quantity && ` · billing ${l.quantity}`}
                </span>
              )}
            </div>
          )}

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
  jobs: initialJobs = [],
  labourRates: initialLabourRates = [],
  equipment: initialEquipment = [],
  trades = [],
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
  /** The business's job-type library — a line's "Saved" picker offers these
   * once its kind is JOB. Each carries a server-computed unitCostCents and
   * its component snapshot. */
  jobs?: Job[];
  /** The business's labour-rate book — a line's "Saved" picker offers these
   * once its kind is LABOUR. Every line kind is available on every document
   * now, so this is always fetched (unlike the old "+ Add labour" button,
   * which hid itself when the prop was omitted). */
  labourRates?: LabourRate[];
  /** The business's equipment library, offered when a line's kind is
   * EQUIPMENT. Optional so a caller that has not fetched it still renders. */
  equipment?: EquipmentItem[];
  /** Trades list for the "+ Add new labour rate…" modal's trade picker
   * (LabourRateForm). Optional/defaulted so a caller that hasn't fetched it
   * still renders — the trade field just falls back to plain free text. */
  trades?: Trade[];
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
  // Local copies of the job/labour-rate/equipment libraries, seeded from
  // props exactly like `favourites` above — these three arrive as props too,
  // so without a local copy a job created via "+ Add new job…" would never
  // show up in that line's own dropdown (the prop the parent passed down
  // never changes). Appended to, never replaced, on a successful create.
  const [jobs, setJobs] = useState<Job[]>(initialJobs);
  const [labourRates, setLabourRates] = useState<LabourRate[]>(initialLabourRates);
  const [equipment, setEquipment] = useState<EquipmentItem[]>(initialEquipment);
  // Which of the three non-material "+ Add new…" modals is open, and for
  // which line — mutually exclusive by construction (one state slot, set via
  // openAddEntity below), and cleared whenever the material modal opens
  // (openAddMaterial) so the two families can never show at once either.
  const [addingEntity, setAddingEntity] = useState<
    { kind: "labour" | "job" | "equipment"; key: string } | null
  >(null);
  const [addingEntityBusy, setAddingEntityBusy] = useState(false);
  // Per-line saved-material category filter ("" = all categories). Keyed by
  // line key so each line's picker narrows independently.
  const [materialFilters, setMaterialFilters] = useState<Record<string, string>>({});
  // The line whose Sold-by cell asked for a unit the vocabulary doesn't have.
  const [addingUnitKey, setAddingUnitKey] = useState<string | null>(null);
  const [addedUnits, setAddedUnits] = useState<ApiMaterialUnit[]>([]);
  // The measured-quantity text typed per line (e.g. "40" against "m²"),
  // keyed by line key. Deliberately NOT part of DraftLine/the saved document
  // shape — there is no field for it on the API's line schema, and inventing
  // one would need a migration for a value that is only ever an input aid.
  // The consequence: reopening a saved quote shows the computed sell-unit
  // quantity (12 boxes) without remembering the 40 m² that produced it.
  const [measuredQtyByKey, setMeasuredQtyByKey] = useState<Record<string, string>>({});

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

  /**
   * Recomputes a line's SELL-UNIT quantity from a typed measured quantity —
   * the only two triggers for recomputation are this and a material change
   * (pickFavourite/createMaterialForLine below), never a bare render, so a
   * manual edit of the Qty field itself is never stomped: nothing here runs
   * again until the contractor types into this input or picks a different
   * material.
   */
  const onMeasuredQtyChange = (key: string, value: string) => {
    setMeasuredQtyByKey((m) => ({ ...m, [key]: value }));
    const line = lines.find((l) => l.key === key);
    if (!line) return;
    const config = coverageConfigForLine(line, favourites);
    if (!config) return;
    const computed = computeCoverageQuantity(value, config, lineUnitLabel(line));
    // A blank/cleared measured quantity leaves `quantity` exactly where the
    // contractor last set it (typed or computed) rather than zeroing it out.
    if (computed) patch(key, { quantity: computed.quantity });
  };

  /** Applies a material's coverage config to whatever measured quantity is
   * already sitting in state for that line, so switching materials mid-entry
   * (or picking one after already typing a measured quantity) recomputes
   * rather than leaving the old material's sell-unit count on the line. When
   * the newly picked material has no coverage configured, any stale measured
   * quantity is dropped — the input disappears along with it, and keeping
   * the text around would only resurface confusingly if a coverage material
   * were picked again later. */
  function coveragePatchForNewMaterial(
    key: string,
    fav: Pick<MaterialFavourite, "measureUnit" | "coveragePerSellUnit" | "wastePct" | "unit">,
  ): Partial<DraftLine> {
    const config = coverageConfigFromFavourite(fav);
    if (!config) {
      setMeasuredQtyByKey((m) => {
        if (!(key in m)) return m;
        const next = { ...m };
        delete next[key];
        return next;
      });
      return {};
    }
    const measuredQty = measuredQtyByKey[key];
    if (!measuredQty) return {};
    const computed = computeCoverageQuantity(measuredQty, config, fav.unit?.trim() || "unit");
    return computed ? { quantity: computed.quantity } : {};
  }

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
   * full favourite object rather than just an id). Field-setting itself is
   * materialPickPatch (lib/line-editor.ts) — description composed from the
   * favourite's name + spec values via materialLineDescription, price, the
   * sold-by unit snapshot, and materialFavouriteId so ★ Save-as-favourite can
   * later update this exact variant precisely (see saveFavourite). */
  const pickFavourite = (key: string, fav: MaterialFavourite) => {
    const coveragePatch = coveragePatchForNewMaterial(key, fav);
    patch(key, { ...materialPickPatch(fav), ...coveragePatch });
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
    const coveragePatch = coveragePatchForNewMaterial(key, created);
    patch(key, { ...materialPickPatch(created), ...coveragePatch });
    setAddingMaterialKey(null);
  };

  /** Opens the material modal from either of its trigger points (the category
   * filter's "+ New category…" row, or MaterialPickerField's own "+ Add
   * material…" row), closing the labour/job/equipment modal first so only
   * one of the four "+ Add new…" modals is ever visible at once. */
  const openAddMaterial = (key: string) => {
    setAddingEntity(null);
    setAddingMaterialKey(key);
  };

  /** Opens the labour/job/equipment "+ Add new…" modal for a line, closing
   * the material modal first for the same reason. */
  const openAddEntity = (kind: "labour" | "job" | "equipment", key: string) => {
    setAddingMaterialKey(null);
    setAddingEntity({ kind, key });
  };

  /** "+ Add new labour rate…" from a LABOUR line's Saved picker: creates a
   * new rate, appends it to the local book (see the `labourRates` state doc
   * above — it arrives as a prop, so without this local copy the new rate
   * would never appear in any line's dropdown), and applies it to the line
   * that opened the modal exactly like picking an existing one would. */
  const createLabourRateForLine = async (key: string, values: LabourRateFormValues) => {
    const created = await createLabourRate(labourRatePayloadFromValues(values));
    setLabourRates((rs) => (rs.some((r) => r.id === created.id) ? rs : [...rs, created]));
    patch(key, applyLabourRatePick(created));
    setAddingEntity(null);
  };

  /** "+ Add new job…" from a JOB line's Saved picker. The quick-create form's
   * three fields (name/unit/rate) become a one-component job via
   * quickJobPayloadFromValues — see that function's doc in lib/line-editor.ts
   * for why a component is required to avoid saving a job at $0. */
  const createJobForLine = async (key: string, values: QuickJobFormValues) => {
    const created = await createJob(quickJobPayloadFromValues(values));
    setJobs((js) => (js.some((j) => j.id === created.id) ? js : [...js, created]));
    patch(key, applyJobPick(created));
    setAddingEntity(null);
  };

  /** "+ Add new equipment…" from an EQUIPMENT line's Saved picker. */
  const createEquipmentForLine = async (key: string, values: EquipmentFormValues) => {
    const created = await createEquipmentItem(equipmentPayloadFromValues(values));
    setEquipment((es) => (es.some((e) => e.id === created.id) ? es : [...es, created]));
    patch(key, applyEquipmentPick(created));
    setAddingEntity(null);
  };

  /** Switches a line's kind (the "Kind" cell) — applyKindChange drops every
   * tie to the old library (materialFavouriteId/jobId/jobComponents/
   * unitLabel) while deliberately keeping description/quantity/price/heading,
   * since reclassifying a line is not resetting it (see line-editor.ts). */
  const onKindChange = (key: string, kind: LineKind) => patch(key, applyKindChange(kind));

  /** Picks a saved labour rate into a LABOUR-kind line's "Saved" cell —
   * description, cadence and price come from applyLabourRatePick; quantity
   * and heading are left exactly as the contractor already had them. */
  const onPickLabourRate = (key: string, rateId: string) => {
    const rate = labourRates.find((r) => r.id === rateId);
    if (rate) patch(key, applyLabourRatePick(rate));
  };

  /** Picks a saved equipment item into an EQUIPMENT-kind line — name, hire
   * cadence and rate come from applyEquipmentPick; quantity and heading stay
   * as the contractor had them, and the price remains editable because
   * marking up a hire is their business. */
  const onPickEquipment = (key: string, itemId: string) => {
    const item = equipment.find((e) => e.id === itemId);
    if (item) patch(key, applyEquipmentPick(item));
  };

  /** Picks a saved job type into a JOB-kind line's "Saved" cell — description,
   * computed unit cost and the component snapshot come from applyJobPick;
   * quantity and heading are left exactly as the contractor already had
   * them. */
  const onPickJob = (key: string, jobId: string) => {
    const job = jobs.find((j) => j.id === jobId);
    if (job) patch(key, applyJobPick(job));
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
  const hasAssemblyLine = lines.some((l) => l.jobId);

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
          jobs={jobs}
          labourRates={labourRates}
          equipment={equipment}
          unitOptionsFor={(l) => unitOptions(l, units)}
          unitsLoading={unitsLoading}
          favourites={favourites}
          measuredQtyByKey={measuredQtyByKey}
          savingFavKey={savingFavKey}
          addingHeadingKey={addingHeadingKey}
          newHeadingText={newHeadingText}
          addingMaterialKey={addingMaterialKey}
          addingMaterialBusy={addingMaterialBusy}
          onPatch={patch}
          onRemove={removeLine}
          onKindChange={onKindChange}
          onHeadingChange={onHeadingChange}
          onNewHeadingTextChange={setNewHeadingText}
          onCommitNewHeading={commitNewHeading}
          onCancelNewHeading={cancelNewHeading}
          onMaterialFilterChange={setMaterialFilter}
          onPickFavourite={pickFavourite}
          onPickLabourRate={onPickLabourRate}
          onPickEquipment={onPickEquipment}
          onPickJob={onPickJob}
          onSaveFavourite={saveFavourite}
          onOpenAddMaterial={openAddMaterial}
          onCancelAddMaterial={() => setAddingMaterialKey(null)}
          onCreateMaterial={createMaterialForLine}
          onAddMaterialBusyChange={setAddingMaterialBusy}
          onOpenAddLabourRate={(key) => openAddEntity("labour", key)}
          onOpenAddJob={(key) => openAddEntity("job", key)}
          onOpenAddEquipment={(key) => openAddEntity("equipment", key)}
          onUnitChange={onUnitChange}
          onMeasuredQtyChange={onMeasuredQtyChange}
        />
        {/* The same action repeated at the foot of the list. On a real quote
            the list is long — especially on a phone, where each line is a
            stacked card — so after filling in the last one the button that
            adds the next is a full scroll away, back past everything you just
            typed. Adding a line is the most repeated action on this screen;
            it should be where your thumb already is. */}
        <div className={styles.addLineFooter}>
          <Button
            variant="outlineAccent"
            size="sm"
            onClick={() => onLinesChange((ls) => [...ls, newLine()])}
          >
            + Add line
          </Button>
        </div>
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

      {/* The labour/job/equipment "+ Add new…" modals — one state slot
          (addingEntity) shared by all three, so opening one always means the
          other two (and the material modal, via openAddMaterial/openAddEntity
          above) are closed. Closing is blocked while a create is in flight,
          same as the material modal's addingMaterialBusy guard. */}
      {addingEntity?.kind === "labour" && (
        <Modal title="Add labour rate" onClose={() => (addingEntityBusy ? undefined : setAddingEntity(null))}>
          <LabourRateForm
            submitLabel="Add labour rate"
            trades={trades}
            onCancel={() => setAddingEntity(null)}
            onSubmit={(values) => createLabourRateForLine(addingEntity.key, values)}
            onBusyChange={setAddingEntityBusy}
          />
        </Modal>
      )}
      {addingEntity?.kind === "job" && (
        <Modal title="Add job" onClose={() => (addingEntityBusy ? undefined : setAddingEntity(null))}>
          <QuickJobForm
            submitLabel="Add job"
            onCancel={() => setAddingEntity(null)}
            onSubmit={(values) => createJobForLine(addingEntity.key, values)}
            onBusyChange={setAddingEntityBusy}
          />
        </Modal>
      )}
      {addingEntity?.kind === "equipment" && (
        <Modal title="Add equipment" onClose={() => (addingEntityBusy ? undefined : setAddingEntity(null))}>
          <EquipmentForm
            submitLabel="Add equipment"
            onCancel={() => setAddingEntity(null)}
            onSubmit={(values) => createEquipmentForLine(addingEntity.key, values)}
            onBusyChange={setAddingEntityBusy}
          />
        </Modal>
      )}
    </section>
  );
}
