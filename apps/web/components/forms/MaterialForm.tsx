"use client";

import { useEffect, useId, useMemo, useState } from "react";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import fieldStyles from "@/components/ui/Field.module.css";
import { modalStyles } from "@/components/ui/Modal";
import {
  ADD_NEW_OPTION_VALUE,
  compareCatalogRows,
  isAddNewOption,
  mergeCatalogRow,
  persistableOptionValue,
} from "@/lib/catalog-options";
import { composeMaterialNamePreview } from "@/lib/material-display";
import { invalidateMaterialSchema, useMaterialSchema } from "@/lib/use-material-schema";
import {
  createMaterialCategory,
  createMaterialUnit,
  type ApiMaterialCategory,
  type ApiMaterialUnit,
  type NewMaterialFavouriteInput,
} from "@/lib/api-client";
import type { MaterialFavourite } from "@/lib/types";
import styles from "./MaterialForm.module.css";

export interface MaterialFormValues {
  /** Only meaningful when nameCustom is true — otherwise the server composes
   * the name from the category's attributes and this is just the preview. */
  name: string;
  /** Set the moment the contractor edits the name field, pinning it against
   * recomposition. */
  nameCustom: boolean;
  /** MaterialUnit id; "" means no unit. */
  unitId: string;
  /** "My usual supplier" — the Supplier whose price currently populates
   * priceDollars. Set by applying a row from the price comparison; "" means
   * none. Not the price comparison itself, which lives in MaterialPriceEntry. */
  supplierId: string;
  priceDollars: string;
  /** MaterialCategoryDef id; "" means no category. */
  categoryDefId: string;
  /** Keyed by MaterialAttributeDef.key (pre-2a this was keyed by display
   * label; the migration rewrote existing rows). */
  specs: Record<string, string>;
  description: string;
  /** The unit the contractor MEASURES the job in (e.g. "m²", "sq ft") — free
   * text, distinct from unitId (how the material is SOLD). Only meaningful
   * alongside coveragePerSellUnit/wastePct below. */
  measureUnit: string;
  /** How much of measureUnit one sell unit covers, e.g. "1.5" m² per box.
   * Kept as a string like the other numeric fields until submit. */
  coveragePerSellUnit: string;
  /** Waste allowance percentage (0-100), applied before rounding up to whole
   * sell units at quote time. */
  wastePct: string;
}

export const emptyMaterialForm: MaterialFormValues = {
  name: "",
  nameCustom: false,
  unitId: "",
  supplierId: "",
  priceDollars: "",
  categoryDefId: "",
  specs: {},
  description: "",
  measureUnit: "",
  coveragePerSellUnit: "",
  wastePct: "",
};

/** Prefills the form from an existing saved material (edit flow). */
export function materialFormValuesFromMaterial(m: MaterialFavourite): MaterialFormValues {
  return {
    name: m.name,
    // Pre-2a materials were all marked nameCustom by the migration, since
    // their names were hand-typed and already shown to customers.
    nameCustom: m.nameCustom ?? true,
    unitId: m.unitId ?? "",
    supplierId: m.supplierId ?? "",
    priceDollars: String(m.priceDollars),
    categoryDefId: m.categoryDefId ?? "",
    specs: m.specs ?? {},
    description: m.description ?? "",
    measureUnit: m.measureUnit ?? "",
    coveragePerSellUnit: m.coveragePerSellUnit != null ? String(m.coveragePerSellUnit) : "",
    wastePct: m.wastePct != null ? String(m.wastePct) : "",
  };
}

/**
 * Drops spec values that do not belong to the chosen category before sending.
 * The server rejects unknown keys outright, so leaving a stale key in would
 * turn a category change into an unexplained 400.
 */
export function materialPayloadFromValues(
  values: MaterialFormValues,
  category: ApiMaterialCategory | undefined,
): NewMaterialFavouriteInput {
  const specs: Record<string, string> = {};
  for (const attribute of category?.attributes ?? []) {
    const value = values.specs[attribute.key]?.trim();
    if (value) specs[attribute.key] = value;
  }
  return {
    // Only send a name when it is pinned; otherwise let the server compose it,
    // so the stored name can never disagree with the attributes.
    ...(values.nameCustom && values.name.trim()
      ? { name: values.name.trim(), nameCustom: true }
      : {}),
    // persistableOptionValue, not the raw field: the "+ Add new…" sentinel is
    // an instruction to the picker, never an id, and must not survive as one
    // if it ever reaches here from a stale draft or a future caller.
    ...(persistableOptionValue(values.categoryDefId)
      ? { categoryDefId: values.categoryDefId }
      : {}),
    ...(persistableOptionValue(values.unitId) ? { unitId: values.unitId } : {}),
    ...(values.supplierId ? { supplierId: values.supplierId } : {}),
    priceCents: Math.round((Number(values.priceDollars) || 0) * 100),
    specs: Object.keys(specs).length ? specs : undefined,
    description: values.description.trim() || undefined,
    measureUnit: values.measureUnit.trim() || undefined,
    ...(values.coveragePerSellUnit.trim() && Number(values.coveragePerSellUnit) > 0
      ? { coveragePerSellUnit: Number(values.coveragePerSellUnit) }
      : {}),
    ...(values.wastePct.trim() && Number.isFinite(Number(values.wastePct))
      ? { wastePct: Number(values.wastePct) }
      : {}),
  };
}

/**
 * A price handed to the form from outside it (the edit flow's supplier price
 * comparison). Wrapped in an object rather than passed as a bare string so the
 * form keys off identity: picking the SAME supplier price twice — after
 * typing over it — still applies, which a plain value comparison would swallow.
 */
export interface AppliedPrice {
  priceDollars: string;
  /** The supplier that price came from — recorded as this material's usual
   * supplier, so "where do I buy this" survives the edit rather than being
   * thrown away with the row that was clicked. */
  supplierId: string;
}

/**
 * The saved-material field set shared by AddMaterialButton and the inline
 * "+ Add material…" modal opened from the quote builder's line-item picker.
 *
 * As of #26 Phase 2a the fields are driven by the material attribute schema
 * from the API rather than a hardcoded list, so a new material kind needs no
 * web deploy.
 */
export default function MaterialForm({
  initial = emptyMaterialForm,
  submitLabel = "Save material",
  onCancel,
  onSubmit,
  onBusyChange,
  appliedPrice,
}: {
  initial?: MaterialFormValues;
  submitLabel?: string;
  onCancel: () => void;
  onSubmit: (values: MaterialFormValues, category: ApiMaterialCategory | undefined) => Promise<void> | void;
  onBusyChange?: (busy: boolean) => void;
  /** Optional — only the edit flow supplies it (EditMaterialButton). The add
   * flows leave it undefined and behave exactly as before: a material has to
   * exist before it can have supplier prices to compare. */
  appliedPrice?: AppliedPrice;
}) {
  const { schema, loading, failed } = useMaterialSchema();
  const [values, setValues] = useState<MaterialFormValues>(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [droppedWarning, setDroppedWarning] = useState("");
  const listId = useId();

  // Rows created from the "+ Add new…" options this session. The schema cache
  // is invalidated on every successful create, but that only takes effect on
  // the NEXT mount — this form is usually inside a modal that is about to be
  // submitted and closed, so the new row is spliced in locally to appear at
  // once rather than after a refetch the contractor never waits for.
  const [addedCategories, setAddedCategories] = useState<ApiMaterialCategory[]>([]);
  const [addedUnits, setAddedUnits] = useState<ApiMaterialUnit[]>([]);
  const [addingCategory, setAddingCategory] = useState(false);
  const [addingUnit, setAddingUnit] = useState(false);
  // Explains a create that selected an existing row instead of adding one —
  // without it the contractor types a label, sees the list not grow, and has
  // no way to tell whether it worked.
  const [categoryNote, setCategoryNote] = useState("");
  const [unitNote, setUnitNote] = useState("");

  const categories = useMemo(
    () =>
      addedCategories.reduce<ApiMaterialCategory[]>(
        (rows, row) => mergeCatalogRow(rows, row, compareCatalogRows),
        schema?.categories ?? [],
      ),
    [schema, addedCategories],
  );
  const units = useMemo(
    () =>
      addedUnits.reduce<ApiMaterialUnit[]>(
        (rows, row) => mergeCatalogRow(rows, row, compareCatalogRows),
        schema?.units ?? [],
      ),
    [schema, addedUnits],
  );

  const category = useMemo(
    () => categories.find((c) => c.id === values.categoryDefId),
    [categories, values.categoryDefId],
  );
  // Drives the "Covers per <unit>" label below — reads naturally ("Covers per
  // box") only once a sold-by unit is actually chosen; otherwise falls back
  // to a generic phrase rather than showing nothing.
  const soldByUnit = useMemo(
    () => units.find((u) => u.id === values.unitId),
    [units, values.unitId],
  );

  // Only price and supplier move — the contractor's name, category and specs
  // are theirs, and a supplier row has nothing to say about them.
  useEffect(() => {
    if (appliedPrice) {
      setValues((v) => ({
        ...v,
        priceDollars: appliedPrice.priceDollars,
        supplierId: appliedPrice.supplierId,
      }));
    }
  }, [appliedPrice]);

  const set = <K extends keyof MaterialFormValues>(key: K, value: MaterialFormValues[K]) =>
    setValues((v) => ({ ...v, [key]: value }));
  const setSpec = (key: string, value: string) =>
    setValues((v) => ({ ...v, specs: { ...v.specs, [key]: value } }));

  /** The name as it will be stored: composed unless the contractor pinned one. */
  const composedName = category
    ? composeMaterialNamePreview(category.label, category.attributes, values.specs)
    : "";
  const effectiveName = values.nameCustom ? values.name : composedName;

  /**
   * Changing category carries over any spec value whose attribute KEY the two
   * categories share (e.g. "length" on Lumber and Roofing) and reports the
   * rest, rather than silently discarding input the contractor typed — the
   * defect fixed in Phase 1, preserved here against the new key-based shape.
   *
   * Takes the row as well as its id so a just-created category can be applied
   * before it has reached `categories` — looking it up would find nothing and
   * clear every spec on the way in.
   */
  function applyCategory(nextId: string, next: ApiMaterialCategory | undefined) {
    const nextKeys = new Set((next?.attributes ?? []).map((a) => a.key));
    const carried: Record<string, string> = {};
    const dropped: string[] = [];

    for (const attribute of category?.attributes ?? []) {
      const value = values.specs[attribute.key]?.trim();
      if (!value) continue;
      if (nextKeys.has(attribute.key)) carried[attribute.key] = value;
      else dropped.push(attribute.label);
    }

    setDroppedWarning(
      dropped.length > 0
        ? `Cleared ${dropped.join(", ")} — not used by ${next?.label ?? "no category"}.`
        : "",
    );
    setValues((v) => ({ ...v, categoryDefId: nextId, specs: carried }));
  }

  function changeCategory(nextId: string) {
    setCategoryNote("");
    // The sentinel opens the inline row and is never written to state, so the
    // controlled <select> snaps straight back to the real selection.
    if (isAddNewOption(nextId)) return setAddingCategory(true);
    applyCategory(nextId, categories.find((c) => c.id === nextId));
  }

  function changeUnit(nextId: string) {
    setUnitNote("");
    if (isAddNewOption(nextId)) return setAddingUnit(true);
    set("unitId", nextId);
  }

  /**
   * Both creates are idempotent server-side, so a label matching something the
   * contractor (or the platform) already has comes back as that EXISTING row.
   * That is a success, not a clash: select it, say so quietly, and let
   * mergeCatalogRow drop the duplicate.
   */
  async function addCategory(label: string) {
    const created = await createMaterialCategory(label);
    invalidateMaterialSchema();
    const alreadyKnown = categories.some((c) => c.id === created.id);
    setAddedCategories((prev) => mergeCatalogRow(prev, created, compareCatalogRows));
    applyCategory(created.id, created);
    setAddingCategory(false);
    setCategoryNote(alreadyKnown ? `Already on your list — selected ${created.label}.` : "");
  }

  async function addUnit(label: string) {
    const created = await createMaterialUnit(label);
    invalidateMaterialSchema();
    const alreadyKnown = units.some((u) => u.id === created.id);
    setAddedUnits((prev) => mergeCatalogRow(prev, created, compareCatalogRows));
    set("unitId", created.id);
    setAddingUnit(false);
    setUnitNote(alreadyKnown ? `Already on your list — selected ${created.label}.` : "");
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!effectiveName.trim()) {
      return setError(
        category
          ? "Fill in at least one attribute, or type a name of your own."
          : "Name is required.",
      );
    }
    setSaving(true);
    onBusyChange?.(true);
    setError("");
    try {
      // Second guard, after materialPayloadFromValues': every caller's onSubmit
      // receives ids that are ids, whether or not it routes through the payload
      // builder (the quote builder also reads these values directly).
      await onSubmit(
        {
          ...values,
          categoryDefId: persistableOptionValue(values.categoryDefId),
          unitId: persistableOptionValue(values.unitId),
        },
        category,
      );
    } catch {
      setError("Couldn't save — is the API running?");
      setSaving(false);
      onBusyChange?.(false);
    }
  }

  return (
    <form className={modalStyles.form} onSubmit={submit}>
      <Select
        label="Category"
        options={[
          { value: "", label: loading ? "Loading…" : "No category" },
          ...categories.map((c) => ({
            value: c.id,
            label: c.custom ? `${c.label} (yours)` : c.label,
          })),
          // Dropped while the row is open: re-picking the sentinel would change
          // nothing in state, so React would have no re-render with which to
          // pull the native <select> back off it.
          ...(addingCategory
            ? []
            : [{ value: ADD_NEW_OPTION_VALUE, label: "+ Add new category…" }]),
        ]}
        value={values.categoryDefId}
        onChange={(e) => changeCategory(e.target.value)}
        disabled={loading}
      />
      {addingCategory && (
        <InlineAddRow
          label="New category"
          placeholder="e.g. Rebar"
          errorText="Couldn't add that category — is the API running?"
          onAdd={addCategory}
          onCancel={() => setAddingCategory(false)}
        />
      )}
      {categoryNote && <span className={fieldStyles.hint}>{categoryNote}</span>}
      {droppedWarning && <span className={fieldStyles.hint}>{droppedWarning}</span>}
      {failed && (
        <span className={fieldStyles.hint}>
          Couldn&apos;t load the material categories — you can still save with a name and price.
        </span>
      )}

      {category && category.attributes.length > 0 && (
        <div className={modalStyles.row2}>
          {category.attributes.map((attribute) => {
            const value = values.specs[attribute.key] ?? "";
            const isEnum = attribute.kind === "ENUM";
            // A value the vocabulary does not have yet is allowed — the server
            // records it as this contractor's own option. Flagging it keeps a
            // typo visible instead of silently becoming vocabulary.
            const isNewValue =
              isEnum &&
              value.trim() !== "" &&
              !attribute.options.some(
                (o) => o.label.toLowerCase() === value.trim().toLowerCase(),
              );
            return (
              <div key={attribute.id}>
                <Input
                  label={attribute.required ? `${attribute.label} *` : attribute.label}
                  type={attribute.kind === "NUMBER" ? "number" : "text"}
                  list={isEnum ? `${listId}-${attribute.key}` : undefined}
                  value={value}
                  onChange={(e) => setSpec(attribute.key, e.target.value)}
                  placeholder={attribute.unit ? `in ${attribute.unit}` : undefined}
                />
                {isEnum && (
                  <datalist id={`${listId}-${attribute.key}`}>
                    {attribute.options.map((o) => (
                      <option key={o.id} value={o.label} />
                    ))}
                  </datalist>
                )}
                {isNewValue && (
                  <span className={fieldStyles.hint}>
                    New — &ldquo;{value.trim()}&rdquo; will be added to your {attribute.label} list.
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}

      <Input
        label="Name"
        value={effectiveName}
        // Typing pins the name. Until then it tracks the attributes, so a
        // contractor who changes Species sees the name follow rather than
        // silently keeping a stale one.
        onChange={(e) => setValues((v) => ({ ...v, name: e.target.value, nameCustom: true }))}
        placeholder={category ? "Composed from the attributes above" : "e.g. Cement"}
      />
      {values.nameCustom && category && (
        <span className={fieldStyles.hint}>
          Custom name.{" "}
          <button
            type="button"
            className={fieldStyles.linkButton}
            onClick={() => setValues((v) => ({ ...v, nameCustom: false, name: "" }))}
          >
            Use &ldquo;{composedName}&rdquo; instead
          </button>
        </span>
      )}

      <div className={modalStyles.row2}>
        <Select
          label="Sold by"
          options={[
            { value: "", label: "No unit" },
            ...units.map((u) => ({
              value: u.id,
              label: u.custom ? `${u.label} (yours)` : u.label,
            })),
            ...(addingUnit ? [] : [{ value: ADD_NEW_OPTION_VALUE, label: "+ Add new unit…" }]),
          ]}
          value={values.unitId}
          onChange={(e) => changeUnit(e.target.value)}
          disabled={loading}
        />
        <Input
          label="Price $"
          type="number"
          value={values.priceDollars}
          onChange={(e) => set("priceDollars", e.target.value)}
        />
      </div>
      {addingUnit && (
        <InlineAddRow
          label="New unit"
          placeholder="e.g. per pallet"
          errorText="Couldn't add that unit — is the API running?"
          onAdd={addUnit}
          onCancel={() => setAddingUnit(false)}
        />
      )}
      {unitNote && <span className={fieldStyles.hint}>{unitNote}</span>}

      <div className={styles.coverageGroup}>
        {/* The abstract explanation was not enough — reported as "I do not know
            how to properly apply the coverage aspect". A worked example in a
            trade the contractor recognises beats a description of the feature,
            because the hard part is not what the fields mean but what to TYPE
            in them. */}
        <span className={styles.coverageTitle}>
          Coverage — optional, for materials you measure one way and buy another
        </span>
        <span className={fieldStyles.hint}>
          Example: tile measured in <strong>m²</strong>, sold by the{" "}
          <strong>{soldByUnit ? soldByUnit.label : "box"}</strong>, where one{" "}
          {soldByUnit ? soldByUnit.label : "box"} covers <strong>4</strong> m², with{" "}
          <strong>10</strong>% waste. On a quote you then type 40 m² and JamQuote
          works out 11 {soldByUnit ? `${soldByUnit.label}es` : "boxes"} — 40 plus 10%
          is 44, divided by 4, rounded up.
        </span>
        <span className={fieldStyles.hint}>
          Leave all three blank for anything you simply buy and count, like a bag
          of cement.
        </span>
        <div className={styles.coverageRow}>
          <Input
            label="Measured in"
            placeholder="e.g. m², sq ft, litre"
            value={values.measureUnit}
            onChange={(e) => set("measureUnit", e.target.value)}
          />
          <Input
            label={`Covers per ${soldByUnit ? soldByUnit.label : "sell unit"}`}
            type="number"
            min={0}
            step="any"
            placeholder="e.g. 1.5"
            value={values.coveragePerSellUnit}
            onChange={(e) => set("coveragePerSellUnit", e.target.value)}
          />
          <Input
            label="Waste %"
            type="number"
            min={0}
            max={100}
            step="any"
            placeholder="e.g. 10"
            value={values.wastePct}
            onChange={(e) => set("wastePct", e.target.value)}
          />
        </div>
      </div>

      <label className={fieldStyles.field}>
        <span className={fieldStyles.label}>Description</span>
        <textarea
          className={fieldStyles.control}
          rows={2}
          placeholder="Optional notes — supplier, finish, anything worth searching for later"
          value={values.description}
          onChange={(e) => set("description", e.target.value)}
        />
      </label>

      {error && <span className={modalStyles.error}>{error}</span>}
      <div className={modalStyles.actions}>
        <Button variant="ghost" type="button" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
        <Button variant="primary" type="submit" disabled={saving}>
          {saving ? "Saving…" : submitLabel}
        </Button>
      </div>
    </form>
  );
}

/**
 * The label prompt behind a "+ Add new…" option. Owns its own text/busy/error
 * so the surrounding form only has to say what to create and what to call the
 * failure — the two pickers here and the supplier one in SupplierPricePanel
 * are otherwise the same interaction.
 *
 * Exported for the shared line editor's own "+ Add new unit…" prompt, which
 * creates against the same MaterialUnit vocabulary this form's unit picker
 * reads.
 */
export function InlineAddRow({
  label,
  placeholder,
  errorText,
  onAdd,
  onCancel,
}: {
  label: string;
  placeholder: string;
  /** Shown when onAdd rejects; the caller words it for its own catalogue. */
  errorText: string;
  onAdd: (label: string) => Promise<void>;
  onCancel: () => void;
}) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function add() {
    const trimmed = text.trim();
    if (!trimmed) return setError("Type a name first.");
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await onAdd(trimmed);
    } catch {
      setError(errorText);
      setBusy(false);
    }
  }

  return (
    <div className={styles.addRow}>
      <Input
        label={label}
        placeholder={placeholder}
        value={text}
        onChange={(e) => setText(e.target.value)}
        // This row lives inside the material <form>: without the preventDefault
        // an Enter here would submit the half-filled material instead.
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            void add();
          } else if (e.key === "Escape") {
            onCancel();
          }
        }}
        error={error || undefined}
        autoFocus
      />
      <Button variant="secondary" size="sm" type="button" onClick={() => void add()} disabled={busy}>
        {busy ? "Adding…" : "Add"}
      </Button>
      <Button variant="ghost" size="sm" type="button" onClick={onCancel} disabled={busy}>
        Cancel
      </Button>
    </div>
  );
}
