"use client";

import { useState } from "react";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import { modalStyles } from "@/components/ui/Modal";
import type { NewMaterialFavouriteInput } from "@/lib/api-client";

export interface MaterialFormValues {
  name: string;
  unit: string;
  priceDollars: string;
}

export const emptyMaterialForm: MaterialFormValues = { name: "", unit: "", priceDollars: "" };

export function materialPayloadFromValues(values: MaterialFormValues): NewMaterialFavouriteInput {
  return {
    name: values.name.trim(),
    unit: values.unit.trim() || undefined,
    priceCents: Math.round((Number(values.priceDollars) || 0) * 100),
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

  const set = <K extends keyof MaterialFormValues>(key: K, value: MaterialFormValues[K]) =>
    setValues((v) => ({ ...v, [key]: value }));

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
      <div className={modalStyles.row2}>
        <Input label="Unit" value={values.unit} onChange={(e) => set("unit", e.target.value)} placeholder="e.g. bag" />
        <Input
          label="Price $"
          type="number"
          value={values.priceDollars}
          onChange={(e) => set("priceDollars", e.target.value)}
        />
      </div>
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
