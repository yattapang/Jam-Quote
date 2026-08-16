"use client";

import { useState } from "react";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import { modalStyles } from "@/components/ui/Modal";
import { emptyQuickJobForm, type QuickJobFormValues } from "@/lib/line-editor";

/**
 * Quick add-a-job-type form behind a quote/invoice line's "+ Add new job…"
 * row. Deliberately NOT the full JobForm (name/unit/markup/component
 * builder) — stacking that whole recipe editor in a modal on top of a
 * half-written document is too much form for the moment a contractor just
 * wants to price one job on the fly. Three fields only.
 *
 * The rate typed here becomes a single component behind the scenes (see
 * quickJobPayloadFromValues in lib/line-editor.ts) so the job doesn't save at
 * $0 — a job's cost is computed from its components, not stored directly.
 * The job this creates opens on the Jobs page afterwards as a normal
 * one-component job, which can be broken into real material/labour
 * components whenever there's time for that refinement.
 */
export default function QuickJobForm({
  submitLabel = "Add job",
  onCancel,
  onSubmit,
  onBusyChange,
}: {
  submitLabel?: string;
  onCancel: () => void;
  onSubmit: (values: QuickJobFormValues) => Promise<void> | void;
  onBusyChange?: (busy: boolean) => void;
}) {
  const [values, setValues] = useState<QuickJobFormValues>(emptyQuickJobForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const set = <K extends keyof QuickJobFormValues>(key: K, value: QuickJobFormValues[K]) =>
    setValues((v) => ({ ...v, [key]: value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!values.name.trim()) return setError("Name is required.");
    if (!values.unit.trim()) return setError("Unit is required (e.g. sq ft, hour, job).");
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
      <Input
        label="Name"
        placeholder="e.g. Interior wall painting"
        value={values.name}
        onChange={(e) => set("name", e.target.value)}
      />
      <div className={modalStyles.row2}>
        <Input
          label="Unit"
          placeholder="e.g. sq ft"
          value={values.unit}
          onChange={(e) => set("unit", e.target.value)}
        />
        <Input
          label="Rate $ per unit"
          type="number"
          value={values.rateDollars}
          onChange={(e) => set("rateDollars", e.target.value)}
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
