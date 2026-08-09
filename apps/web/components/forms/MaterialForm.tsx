"use client";

import { useEffect, useId, useMemo, useState } from "react";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import fieldStyles from "@/components/ui/Field.module.css";
import { modalStyles } from "@/components/ui/Modal";
import { composeMaterialNamePreview } from "@/lib/material-display";
import { useMaterialSchema } from "@/lib/use-material-schema";
import type { ApiMaterialCategory, NewMaterialFavouriteInput } from "@/lib/api-client";
import type { MaterialFavourite } from "@/lib/types";

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
    ...(values.categoryDefId ? { categoryDefId: values.categoryDefId } : {}),
    ...(values.unitId ? { unitId: values.unitId } : {}),
    ...(values.supplierId ? { supplierId: values.supplierId } : {}),
    priceCents: Math.round((Number(values.priceDollars) || 0) * 100),
    specs: Object.keys(specs).length ? specs : undefined,
    description: values.description.trim() || undefined,
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

  const category = useMemo(
    () => schema?.categories.find((c) => c.id === values.categoryDefId),
    [schema, values.categoryDefId],
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
   */
  function changeCategory(nextId: string) {
    const next = schema?.categories.find((c) => c.id === nextId);
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
      await onSubmit(values, category);
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
          ...(schema?.categories ?? []).map((c) => ({
            value: c.id,
            label: c.custom ? `${c.label} (yours)` : c.label,
          })),
        ]}
        value={values.categoryDefId}
        onChange={(e) => changeCategory(e.target.value)}
        disabled={loading}
      />
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
            ...(schema?.units ?? []).map((u) => ({
              value: u.id,
              label: u.custom ? `${u.label} (yours)` : u.label,
            })),
          ]}
          value={values.unitId}
          onChange={(e) => set("unitId", e.target.value)}
          disabled={loading}
        />
        <Input
          label="Price $"
          type="number"
          value={values.priceDollars}
          onChange={(e) => set("priceDollars", e.target.value)}
        />
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
