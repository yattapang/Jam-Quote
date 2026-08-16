"use client";

import { useMemo, useState } from "react";
import { JobComponentKind, computeJobUnitCostCents } from "@jamquote/core";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import MoneyText from "@/components/ui/MoneyText";
import { modalStyles } from "@/components/ui/Modal";
import type { NewJobInput } from "@/lib/api-client";
import { materialFavouriteLabel } from "@/lib/material-display";
import type { Job, LabourRate, MaterialFavourite } from "@/lib/types";
import styles from "./JobForm.module.css";

const kindOptions = [
  { value: JobComponentKind.MATERIAL, label: "Material" },
  { value: JobComponentKind.LABOUR, label: "Labour" },
  { value: JobComponentKind.OTHER, label: "Other" },
];

/** One draft recipe line in the builder. `unitPriceDollars`/`description`
 * are always editable — picking a material/labour source just snapshots
 * that item's current name/price into them (matches the API: components
 * store their own unitPriceCents, materialFavouriteId/labourRateId are only
 * an optional back-reference, not a live link). */
export interface JobComponentDraft {
  key: string;
  kind: JobComponentKind;
  materialFavouriteId?: string;
  labourRateId?: string;
  description: string;
  quantityPerUnit: string;
  unitPriceDollars: string;
}

export interface JobFormValues {
  name: string;
  unit: string;
  markupPct: string;
  components: JobComponentDraft[];
}

let draftCounter = 0;
function newComponentDraft(): JobComponentDraft {
  return {
    key: `c${++draftCounter}`,
    kind: JobComponentKind.MATERIAL,
    description: "",
    quantityPerUnit: "1",
    unitPriceDollars: "",
  };
}

export const emptyJobForm: JobFormValues = {
  name: "",
  unit: "",
  markupPct: "0",
  components: [newComponentDraft()],
};

export function jobFormValuesFromAssembly(job: Job): JobFormValues {
  return {
    name: job.name,
    unit: job.unit,
    markupPct: String(job.markupPct),
    components:
      job.components.length > 0
        ? job.components
            .slice()
            .sort((a, b) => a.sort - b.sort)
            .map((c) => ({
              key: `c${++draftCounter}`,
              kind: c.kind,
              materialFavouriteId: c.materialFavouriteId,
              labourRateId: c.labourRateId,
              description: c.description,
              quantityPerUnit: String(c.quantityPerUnit),
              unitPriceDollars: String(c.unitPriceCents / 100),
            }))
        : [newComponentDraft()],
  };
}

const toCents = (dollars: string) => Math.round((Number(dollars) || 0) * 100);

/** Component drafts with a description and a positive quantity — blank rows
 * left over from "+ Add component" are dropped rather than saved/costed. */
function validComponents(components: JobComponentDraft[]): JobComponentDraft[] {
  return components.filter((c) => c.description.trim() && (Number(c.quantityPerUnit) || 0) > 0);
}

export function jobPayloadFromValues(values: JobFormValues): NewJobInput {
  return {
    name: values.name.trim(),
    unit: values.unit.trim(),
    markupPct: Number(values.markupPct) || 0,
    components: validComponents(values.components).map((c) => ({
      kind: c.kind,
      materialFavouriteId: c.kind === JobComponentKind.MATERIAL ? c.materialFavouriteId : undefined,
      labourRateId: c.kind === JobComponentKind.LABOUR ? c.labourRateId : undefined,
      description: c.description.trim(),
      quantityPerUnit: Number(c.quantityPerUnit) || 0,
      unitPriceCents: toCents(c.unitPriceDollars),
    })),
  };
}

// Material option labels are composed by the shared materialFavouriteLabel
// (lib/material-display.ts) — previously this had its own copy that ignored
// specs entirely, so "2x4x8 cedar" and "2x4x16 mahogany" (same name,
// different Dimension/Length specs) looked identical in this picker even
// though the quote builder's picker told them apart. Both now render the
// same variant name + unit + price.

function labourLabel(r: LabourRate): string {
  const price = `$${r.rateDollars.toLocaleString("en-JM", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const trade = r.skillTier ? `${r.trade} — ${r.skillTier}` : r.trade;
  return `${trade} (${price}/${r.rateUnit.toLowerCase()})`;
}

/**
 * One component row: a kind selector, a source picker for Material/Labour
 * (snapshotting that item's name + price on pick) or a free-text description
 * for Other, then quantity-per-unit and unit-price fields (always editable).
 */
function ComponentRow({
  draft,
  materials,
  labourRates,
  onChange,
  onRemove,
  canRemove,
}: {
  draft: JobComponentDraft;
  materials: MaterialFavourite[];
  labourRates: LabourRate[];
  onChange: (patch: Partial<JobComponentDraft>) => void;
  onRemove: () => void;
  canRemove: boolean;
}) {
  const materialOptions = [
    { value: "", label: materials.length ? "Select a material…" : "No saved materials" },
    ...materials.map((m) => ({ value: m.id, label: materialFavouriteLabel(m) })),
  ];
  const labourOptions = [
    { value: "", label: labourRates.length ? "Select a labour rate…" : "No saved labour rates" },
    ...labourRates.map((r) => ({ value: r.id, label: labourLabel(r) })),
  ];

  function changeKind(kind: JobComponentKind) {
    onChange({ kind, materialFavouriteId: undefined, labourRateId: undefined });
  }

  function pickMaterial(id: string) {
    const m = materials.find((x) => x.id === id);
    if (!m) return onChange({ materialFavouriteId: undefined });
    onChange({
      materialFavouriteId: m.id,
      description: m.name,
      unitPriceDollars: String(m.priceDollars),
    });
  }

  function pickLabour(id: string) {
    const r = labourRates.find((x) => x.id === id);
    if (!r) return onChange({ labourRateId: undefined });
    onChange({
      labourRateId: r.id,
      description: r.skillTier ? `${r.trade} (${r.skillTier})` : r.trade,
      unitPriceDollars: String(r.rateDollars),
    });
  }

  return (
    <div className={styles.componentRow}>
      <div className={styles.componentTopRow}>
        <Select
          label="Kind"
          options={kindOptions}
          value={draft.kind}
          onChange={(e) => changeKind(e.target.value as JobComponentKind)}
        />
        {draft.kind === JobComponentKind.MATERIAL ? (
          <Select
            label="Saved material"
            options={materialOptions}
            value={draft.materialFavouriteId ?? ""}
            onChange={(e) => pickMaterial(e.target.value)}
          />
        ) : draft.kind === JobComponentKind.LABOUR ? (
          <Select
            label="Saved labour rate"
            options={labourOptions}
            value={draft.labourRateId ?? ""}
            onChange={(e) => pickLabour(e.target.value)}
          />
        ) : (
          <Input
            label="Description"
            placeholder="e.g. Waste disposal"
            value={draft.description}
            onChange={(e) => onChange({ description: e.target.value })}
          />
        )}
        <button
          type="button"
          className={styles.removeButton}
          aria-label="Remove component"
          onClick={onRemove}
          disabled={!canRemove}
        >
          ×
        </button>
      </div>
      <div className={styles.componentBottomRow}>
        {draft.kind !== JobComponentKind.OTHER && (
          <Input
            label="Description"
            value={draft.description}
            onChange={(e) => onChange({ description: e.target.value })}
          />
        )}
        <Input
          label="Qty / unit"
          type="number"
          value={draft.quantityPerUnit}
          onChange={(e) => onChange({ quantityPerUnit: e.target.value })}
        />
        <Input
          label="Unit price $"
          type="number"
          value={draft.unitPriceDollars}
          onChange={(e) => onChange({ unitPriceDollars: e.target.value })}
        />
      </div>
    </div>
  );
}

/**
 * The job ("job type") field set shared by AddAssemblyButton and
 * EditAssemblyButton — name/unit/markup plus a component builder (add/
 * remove rows, each sourced from the material/labour libraries or freeform),
 * with a live unit-cost readout computed via @jamquote/core's
 * computeJobUnitCostCents so it always matches what the API will save.
 */
export default function JobForm({
  initial = emptyJobForm,
  submitLabel = "Save job type",
  materials,
  labourRates,
  onCancel,
  onSubmit,
  onBusyChange,
}: {
  initial?: JobFormValues;
  submitLabel?: string;
  /** Saved materials/labour rates, fetched server-side by the assemblies
   * page, that populate the per-component pickers. */
  materials: MaterialFavourite[];
  labourRates: LabourRate[];
  onCancel: () => void;
  onSubmit: (values: JobFormValues) => Promise<void> | void;
  onBusyChange?: (busy: boolean) => void;
}) {
  const [values, setValues] = useState<JobFormValues>(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const set = <K extends keyof JobFormValues>(key: K, value: JobFormValues[K]) =>
    setValues((v) => ({ ...v, [key]: value }));

  const patchComponent = (key: string, patch: Partial<JobComponentDraft>) =>
    setValues((v) => ({
      ...v,
      components: v.components.map((c) => (c.key === key ? { ...c, ...patch } : c)),
    }));
  const removeComponent = (key: string) =>
    setValues((v) => ({
      ...v,
      components: v.components.length > 1 ? v.components.filter((c) => c.key !== key) : v.components,
    }));
  const addComponent = () =>
    setValues((v) => ({ ...v, components: [...v.components, newComponentDraft()] }));

  const costInputComponents = useMemo(
    () =>
      validComponents(values.components).map((c) => ({
        quantityPerUnit: Number(c.quantityPerUnit) || 0,
        unitPriceCents: toCents(c.unitPriceDollars),
      })),
    [values.components],
  );
  const markupPct = Number(values.markupPct) || 0;
  const subtotalCents = useMemo(
    () => computeJobUnitCostCents({ components: costInputComponents, markupPct: 0 }),
    [costInputComponents],
  );
  const unitCostCents = useMemo(
    () => computeJobUnitCostCents({ components: costInputComponents, markupPct }),
    [costInputComponents, markupPct],
  );
  const markupCents = unitCostCents - subtotalCents;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!values.name.trim()) return setError("Name is required.");
    if (!values.unit.trim()) return setError("Unit is required (e.g. sq ft, hour, job).");
    if (validComponents(values.components).length === 0) {
      return setError("Add at least one component with a description and quantity.");
    }
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
      <div className={modalStyles.row2}>
        <Input
          label="Name"
          placeholder="e.g. Tiling — per sq ft"
          value={values.name}
          onChange={(e) => set("name", e.target.value)}
        />
        <Input
          label="Unit"
          placeholder="e.g. sq ft"
          value={values.unit}
          onChange={(e) => set("unit", e.target.value)}
        />
      </div>
      <Input
        label="Markup %"
        type="number"
        value={values.markupPct}
        onChange={(e) => set("markupPct", e.target.value)}
        hint="Applied on top of the summed component cost."
      />

      <div className={styles.componentsWrap}>
        {values.components.map((c) => (
          <ComponentRow
            key={c.key}
            draft={c}
            materials={materials}
            labourRates={labourRates}
            onChange={(patch) => patchComponent(c.key, patch)}
            onRemove={() => removeComponent(c.key)}
            canRemove={values.components.length > 1}
          />
        ))}
      </div>
      <Button type="button" variant="outlineAccent" size="sm" onClick={addComponent}>
        + Add component
      </Button>

      <div className={styles.costBox}>
        <div className={styles.costRowMuted}>
          <span>Component subtotal</span>
          <MoneyText cents={subtotalCents} tone="muted" weight={600} />
        </div>
        <div className={styles.costRowMuted}>
          <span>Markup ({markupPct}%)</span>
          <MoneyText cents={markupCents} tone="muted" weight={600} />
        </div>
        <div className={styles.costRowGrand}>
          <span>Unit cost{values.unit.trim() ? ` / ${values.unit.trim()}` : ""}</span>
          <MoneyText cents={unitCostCents} tone="accent" />
        </div>
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
