"use client";

import { useState } from "react";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import fieldStyles from "@/components/ui/Field.module.css";
import { modalStyles } from "@/components/ui/Modal";
import { MATERIAL_CATEGORIES, specFieldsFor, specsForCategoryChange } from "@/lib/material-categories";
import type { NewMaterialFavouriteInput } from "@/lib/api-client";
import type { MaterialFavourite } from "@/lib/types";

export interface MaterialFormValues {
  name: string;
  unit: string;
  priceDollars: string;
  /** "" means no category — matches MaterialFavourite.category being unset. */
  category: string;
  /** Keyed by the selected category's spec field labels (see
   * specFieldsFor). Fields outside the current category's set are dropped
   * on submit rather than carried along silently. */
  specs: Record<string, string>;
  /** Optional free-text notes (supplier, finish, etc.) — also searched by
   * the API's `q` param alongside name and specs values. */
  description: string;
}

export const emptyMaterialForm: MaterialFormValues = {
  name: "",
  unit: "",
  priceDollars: "",
  category: "",
  specs: {},
  description: "",
};

/** Prefills the form's values from an existing saved material (edit flow). */
export function materialFormValuesFromMaterial(m: MaterialFavourite): MaterialFormValues {
  return {
    name: m.name,
    unit: m.unit ?? "",
    priceDollars: String(m.priceDollars),
    category: m.category ?? "",
    specs: m.specs ?? {},
    description: m.description ?? "",
  };
}

export function materialPayloadFromValues(values: MaterialFormValues): NewMaterialFavouriteInput {
  const category = values.category.trim() || undefined;
  // Only keep spec values for fields the chosen category actually asks for,
  // and drop blanks — an all-blank specs object collapses to undefined so a
  // material with no filled-in specs stores the same as one with none at all.
  const fields = specFieldsFor(category);
  const specs: Record<string, string> = {};
  for (const field of fields) {
    const value = values.specs[field]?.trim();
    if (value) specs[field] = value;
  }
  return {
    name: values.name.trim(),
    unit: values.unit.trim() || undefined,
    priceCents: Math.round((Number(values.priceDollars) || 0) * 100),
    category,
    specs: Object.keys(specs).length ? specs : undefined,
    description: values.description.trim() || undefined,
  };
}

/**
 * The saved-material field set shared by AddMaterialButton and the inline
 * "+ Add material…" modal opened from the quote builder's line-item picker.
 */
export default function MaterialForm({
  initial = emptyMaterialForm,
  submitLabel = "Save material",
  onCancel,
  onSubmit,
  onBusyChange,
}: {
  initial?: MaterialFormValues;
  submitLabel?: string;
  onCancel: () => void;
  onSubmit: (values: MaterialFormValues) => Promise<void> | void;
  onBusyChange?: (busy: boolean) => void;
}) {
  const [values, setValues] = useState<MaterialFormValues>(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  // Set when switching category would drop spec values the previous
  // category had (field label not shared with the new category) — see
  // changeCategory below. Cleared on the next successful, lossless change.
  const [categoryWarning, setCategoryWarning] = useState("");

  const set = <K extends keyof MaterialFormValues>(key: K, value: MaterialFormValues[K]) =>
    setValues((v) => ({ ...v, [key]: value }));
  const setSpec = (field: string, value: string) =>
    setValues((v) => ({ ...v, specs: { ...v.specs, [field]: value } }));
  const specFields = specFieldsFor(values.category);

  /** Changing category used to silently discard any spec values that
   * belonged to the old category — a contractor who'd filled in
   * Dimension/Length/Grade for Lumber and then fixed a wrong category pick
   * would lose that input with no warning. specsForCategoryChange (see
   * material-categories.ts) carries over values whose field label the two
   * categories share (e.g. "Type" on Cement <-> Aggregate/Sand) and reports
   * everything else so it can be surfaced here instead of vanishing quietly. */
  function changeCategory(nextCategory: string) {
    const { specs, dropped } = specsForCategoryChange(values.specs, values.category, nextCategory);
    setCategoryWarning(
      dropped.length > 0
        ? `Cleared ${dropped.join(", ")} — not used by ${nextCategory || "no category"}.`
        : "",
    );
    setValues((v) => ({ ...v, category: nextCategory, specs }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!values.name.trim()) return setError("Name is required.");
    setSaving(true);
    onBusyChange?.(true);
    setError("");
    try {
      await onSubmit(values);
    } catch {
      setError("Couldn't save — is the API running?");
      setSaving(false);
      onBusyChange?.(false);
    }
  }

  return (
    <form className={modalStyles.form} onSubmit={submit}>
      <Input label="Name" value={values.name} onChange={(e) => set("name", e.target.value)} autoFocus placeholder="e.g. Cement" />
      <Select
        label="Category"
        options={[{ value: "", label: "No category" }, ...MATERIAL_CATEGORIES.map((c) => ({ value: c.name, label: c.name }))]}
        value={values.category}
        onChange={(e) => changeCategory(e.target.value)}
      />
      {categoryWarning && <span className={fieldStyles.hint}>{categoryWarning}</span>}
      {specFields.length > 0 && (
        <div className={modalStyles.row2}>
          {specFields.map((field) => (
            <Input
              key={field}
              label={field}
              value={values.specs[field] ?? ""}
              onChange={(e) => setSpec(field, e.target.value)}
            />
          ))}
        </div>
      )}
      <div className={modalStyles.row2}>
        <Input label="Unit" value={values.unit} onChange={(e) => set("unit", e.target.value)} placeholder="e.g. bag" />
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
