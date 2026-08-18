"use client";

import { useMemo, useState } from "react";
import { JobComponentKind, computeJobUnitCostCents } from "@jamquote/core";
import { ADD_NEW_OPTION_VALUE, isAddNewOption } from "@/lib/catalog-options";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import MoneyText from "@/components/ui/MoneyText";
import Modal, { modalStyles } from "@/components/ui/Modal";
import MaterialForm, { materialPayloadFromValues } from "@/components/forms/MaterialForm";
import LabourRateForm, { labourRatePayloadFromValues } from "@/components/forms/LabourRateForm";
import EquipmentForm, { equipmentPayloadFromValues } from "@/components/forms/EquipmentForm";
import { createEquipmentItem, createLabourRate, createMaterialFavourite, type NewJobInput, type Trade } from "@/lib/api-client";
import { materialFavouriteLabel } from "@/lib/material-display";
import { duplicateComponentKeys, mergeDuplicateComponents } from "@/lib/job-components";
import type { EquipmentItem, Job, LabourRate, MaterialFavourite } from "@/lib/types";
import styles from "./JobForm.module.css";

const kindOptions = [
  { value: JobComponentKind.MATERIAL, label: "Material" },
  { value: JobComponentKind.LABOUR, label: "Labour" },
  { value: JobComponentKind.EQUIPMENT, label: "Equipment" },
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
  equipmentItemId?: string;
  description: string;
  quantityPerUnit: string;
  /** What the quantity counts — "trip", "day". Blank prints bare. */
  unitLabel: string;
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
    unitLabel: "",
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
              unitLabel: c.unitLabel ?? "",
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
      unitLabel: c.unitLabel.trim() || undefined,
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

function equipmentLabel(e: EquipmentItem): string {
  const price = `$${e.rateDollars.toLocaleString("en-JM", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const unit = e.unitLabel?.trim() || e.rateUnit.toLowerCase();
  return `${e.name} (${price}/${unit})`;
}

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
  equipment,
  onChange,
  onRemove,
  onAddMaterial,
  onAddLabourRate,
  onAddEquipment,
  isDuplicate,
  onMergeDuplicates,
}: {
  draft: JobComponentDraft;
  materials: MaterialFavourite[];
  labourRates: LabourRate[];
  equipment: EquipmentItem[];
  onChange: (patch: Partial<JobComponentDraft>) => void;
  onRemove: () => void;
  onAddMaterial: () => void;
  onAddLabourRate: () => void;
  onAddEquipment: () => void;
  isDuplicate: boolean;
  onMergeDuplicates: () => void;
}) {
  // "+ Add new…" belongs on these pickers for the same reason it belongs on
  // the quote line's: a contractor building a job type discovers a missing
  // material HERE, and sending them to another screen means abandoning the
  // job half-built. The quote editor gained this; the job builder did not.
  const materialOptions = [
    { value: "", label: materials.length ? "Select a material…" : "No saved materials" },
    ...materials.map((m) => ({ value: m.id, label: materialFavouriteLabel(m) })),
    { value: ADD_NEW_OPTION_VALUE, label: "+ Add new material…" },
  ];
  const labourOptions = [
    { value: "", label: labourRates.length ? "Select a labour rate…" : "No saved labour rates" },
    ...labourRates.map((r) => ({ value: r.id, label: labourLabel(r) })),
    { value: ADD_NEW_OPTION_VALUE, label: "+ Add new labour rate…" },
  ];
  const equipmentOptions = [
    { value: "", label: equipment.length ? "Select equipment…" : "No saved equipment" },
    ...equipment.map((e) => ({ value: e.id, label: equipmentLabel(e) })),
    { value: ADD_NEW_OPTION_VALUE, label: "+ Add new equipment…" },
  ];

  function changeKind(kind: JobComponentKind) {
    // Every library link is cleared, not just the one for the old kind — a
    // stale id would quietly tie this row to a material it no longer is.
    onChange({
      kind,
      materialFavouriteId: undefined,
      labourRateId: undefined,
      equipmentItemId: undefined,
    });
  }

  /**
   * All three pickers below carry the picked item's OWN unit onto the recipe
   * row, and none of them overwrites a unit already typed there.
   *
   * They used to disagree: material and labour set no unit at all, while
   * equipment set `e.rateUnit.toLowerCase()` — inventing a word from the
   * cadence enum. An equipment item with no unit of its own therefore stamped
   * the literal "day" into the recipe, over whatever the contractor had
   * written, which is the reported "I created a custom unit and it gave me
   * day". It was also a snapshot of a FALLBACK: give that item a real unit
   * later and the recipe still says "day" forever.
   *
   * Nothing is invented now. An empty unit renders as a bare quantity
   * (componentQuantityLabel), which is the correct way to say "no unit".
   */
  const keepTypedUnit = (own: string | null | undefined): { unitLabel?: string } => {
    const theirs = draft.unitLabel?.trim();
    if (theirs) return {}; // never clobber what the contractor wrote
    const mine = own?.trim();
    return mine ? { unitLabel: mine } : {};
  };

  function pickMaterial(id: string) {
    const m = materials.find((x) => x.id === id);
    if (!m) return onChange({ materialFavouriteId: undefined });
    onChange({
      materialFavouriteId: m.id,
      description: m.name,
      unitPriceDollars: String(m.priceDollars),
      // A material sold by the bag makes the row read "2 bag".
      ...keepTypedUnit(m.unit),
    });
  }

  function pickEquipment(id: string) {
    const e = equipment.find((x) => x.id === id);
    if (!e) return onChange({ equipmentItemId: undefined });
    onChange({
      equipmentItemId: e.id,
      description: e.name,
      unitPriceDollars: String(e.rateDollars),
      ...keepTypedUnit(e.unitLabel),
    });
  }

  function pickLabour(id: string) {
    const r = labourRates.find((x) => x.id === id);
    if (!r) return onChange({ labourRateId: undefined });
    onChange({
      labourRateId: r.id,
      description: r.skillTier ? `${r.trade} (${r.skillTier})` : r.trade,
      unitPriceDollars: String(r.rateDollars),
      ...keepTypedUnit(r.unitLabel),
    });
  }

  return (
    <div className={`${styles.componentRow} ${isDuplicate ? styles.duplicateRow : ""}`}>
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
            onChange={(e) =>
              isAddNewOption(e.target.value) ? onAddMaterial() : pickMaterial(e.target.value)
            }
          />
        ) : draft.kind === JobComponentKind.EQUIPMENT ? (
          <Select
            label="Saved equipment"
            options={equipmentOptions}
            value={draft.equipmentItemId ?? ""}
            onChange={(e) =>
              isAddNewOption(e.target.value) ? onAddEquipment() : pickEquipment(e.target.value)
            }
          />
        ) : draft.kind === JobComponentKind.LABOUR ? (
          <Select
            label="Saved labour rate"
            options={labourOptions}
            value={draft.labourRateId ?? ""}
            onChange={(e) =>
              isAddNewOption(e.target.value) ? onAddLabourRate() : pickLabour(e.target.value)
            }
          />
        ) : (
          <Input
            label="Description"
            placeholder="e.g. Waste disposal"
            value={draft.description}
            onChange={(e) => onChange({ description: e.target.value })}
          />
        )}
        {/* Labelled like its neighbours. As a bare 32px box holding "×",
            aligned to the bottom of two labelled fields, it read as a field
            with no label rather than as a button. */}
        <div className={styles.removeCell}>
          <span className={styles.removeLabel}>Remove</span>
          <button
            type="button"
            className={styles.removeButton}
            aria-label="Remove component"
            title="Remove this component"
            onClick={onRemove}
          >
            ×
          </button>
        </div>
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
        {/* What the quantity counts. Without this a recipe line read
            "3 x $1,200" with no way to say 3 WHAT — reported when a job needed
            transport priced per trip. */}
        <Input
          label="Unit"
          placeholder="e.g. trip, day"
          value={draft.unitLabel}
          onChange={(e) => onChange({ unitLabel: e.target.value })}
        />
        <Input
          label="Unit price $"
          type="number"
          value={draft.unitPriceDollars}
          onChange={(e) => onChange({ unitPriceDollars: e.target.value })}
        />
      </div>
      {/* Advisory, not preventive. Adding the same material twice is almost
          always a slip — reported as exactly that — but it is not invalid: the
          cost comes out identical either way. So it is pointed out with a way
          to fix it, rather than blocking the save. Only the LATER row is
          flagged; marking both would leave you unsure which to remove. */}
      {isDuplicate && (
        <div className={styles.duplicateNote}>
          <span>Already in this job.</span>
          <button type="button" className={styles.mergeButton} onClick={onMergeDuplicates}>
            Combine them
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * The job ("job type") field set shared by AddJobButton and
 * EditJobButton — name/unit/markup plus a component builder (add/
 * remove rows, each sourced from the material/labour libraries or freeform),
 * with a live unit-cost readout computed via @jamquote/core's
 * computeJobUnitCostCents so it always matches what the API will save.
 */
export default function JobForm({
  initial = emptyJobForm,
  submitLabel = "Save job type",
  materials,
  labourRates,
  equipment = [],
  trades = [],
  onCancel,
  onSubmit,
  onBusyChange,
}: {
  initial?: JobFormValues;
  submitLabel?: string;
  /** Saved materials/labour rates, fetched server-side by the jobs
   * page, that populate the per-component pickers. */
  materials: MaterialFavourite[];
  labourRates: LabourRate[];
  /** The equipment library, for EQUIPMENT components. Optional so a caller
   * that has not fetched it still renders — the picker is simply empty. */
  equipment?: EquipmentItem[];
  /** For the inline "+ Add new labour rate" form's trade picker. Optional so
   * a caller that has not fetched them still renders — that picker degrades to
   * type-your-own rather than breaking the job builder. */
  trades?: Trade[];
  onCancel: () => void;
  onSubmit: (values: JobFormValues) => Promise<void> | void;
  onBusyChange?: (busy: boolean) => void;
}) {
  const [values, setValues] = useState<JobFormValues>(initial);
  // Local copies so something created inline appears in the pickers at once.
  // As pass-through props a new material would save and then not show up until
  // a reload, which reads exactly like the create having failed.
  const [materialList, setMaterialList] = useState<MaterialFavourite[]>(materials);
  const [labourList, setLabourList] = useState<LabourRate[]>(labourRates);
  const [equipmentList, setEquipmentList] = useState<EquipmentItem[]>(equipment);
  const [adding, setAdding] = useState<{ kind: "material" | "labour" | "equipment"; componentKey: string } | null>(null);
  const duplicateKeys = duplicateComponentKeys(values.components);
  const mergeDuplicates = () =>
    setValues((v) => ({ ...v, components: mergeDuplicateComponents(v.components) }));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const set = <K extends keyof JobFormValues>(key: K, value: JobFormValues[K]) =>
    setValues((v) => ({ ...v, [key]: value }));

  const patchComponent = (key: string, patch: Partial<JobComponentDraft>) =>
    setValues((v) => ({
      ...v,
      components: v.components.map((c) => (c.key === key ? { ...c, ...patch } : c)),
    }));
  /**
   * Removing the last component leaves a fresh blank row rather than refusing.
   *
   * It used to return the list unchanged when only one component remained, so
   * the button did nothing and said nothing — reported as "the x removed
   * nothing when clicked". A job does need at least one component to have a
   * cost, but that is a reason to keep a ROW, not a reason to ignore a click:
   * clearing the row you have is a perfectly reasonable thing to want, and
   * silence is the worst possible answer to it.
   */
  const removeComponent = (key: string) =>
    setValues((v) => {
      const remaining = v.components.filter((c) => c.key !== key);
      return { ...v, components: remaining.length > 0 ? remaining : [newComponentDraft()] };
    });
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
    <>
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
            materials={materialList}
            labourRates={labourList}
            equipment={equipmentList}
            onChange={(patch) => patchComponent(c.key, patch)}
            onRemove={() => removeComponent(c.key)}
            onAddMaterial={() => setAdding({ kind: "material", componentKey: c.key })}
            onAddLabourRate={() => setAdding({ kind: "labour", componentKey: c.key })}
            onAddEquipment={() => setAdding({ kind: "equipment", componentKey: c.key })}
            isDuplicate={duplicateKeys.has(c.key)}
            onMergeDuplicates={mergeDuplicates}
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

      {/* Creating a material or rate from inside the job builder. The new row
          is applied to the component that asked for it, so the contractor is
          left where they were rather than having to find the row again. */}
    </form>

      {/* Rendered OUTSIDE the form above, not inside it. Each of these
          modals contains its own <form>, and nested form elements are invalid
          HTML — the browser drops the inner one, so the submit button ends up
          submitting the JOB form and the material/labour rate is never
          created. It looked like a successful save and silently did nothing.
          The quote editor's equivalents work because that editor is a section,
          not a form. */}
      {adding?.kind === "material" && (
        <Modal title="Add material" onClose={() => setAdding(null)}>
          <MaterialForm
            submitLabel="Save material"
            onCancel={() => setAdding(null)}
            onSubmit={async (formValues, category) => {
              const created = await createMaterialFavourite(
                materialPayloadFromValues(formValues, category),
              );
              setMaterialList((ms) => [...ms, created]);
              patchComponent(adding.componentKey, {
                materialFavouriteId: created.id,
                description: materialFavouriteLabel(created),
                unitPriceDollars: String(created.priceCents / 100),
              });
              setAdding(null);
            }}
          />
        </Modal>
      )}
      {adding?.kind === "equipment" && (
        <Modal title="Add equipment" onClose={() => setAdding(null)}>
          <EquipmentForm
            submitLabel="Save equipment"
            onCancel={() => setAdding(null)}
            onSubmit={async (formValues) => {
              const created = await createEquipmentItem(equipmentPayloadFromValues(formValues));
              setEquipmentList((es) => [...es, created]);
              patchComponent(adding.componentKey, {
                equipmentItemId: created.id,
                description: created.name,
                unitLabel: created.unitLabel?.trim() || created.rateUnit.toLowerCase(),
                unitPriceDollars: String(created.rateCents / 100),
              });
              setAdding(null);
            }}
          />
        </Modal>
      )}
      {adding?.kind === "labour" && (
        <Modal title="Add labour rate" onClose={() => setAdding(null)}>
          <LabourRateForm
            trades={trades}
            submitLabel="Save labour rate"
            onCancel={() => setAdding(null)}
            onSubmit={async (formValues) => {
              const created = await createLabourRate(labourRatePayloadFromValues(formValues));
              setLabourList((rs) => [...rs, created]);
              patchComponent(adding.componentKey, {
                labourRateId: created.id,
                description: created.skillTier
                  ? `${created.trade} — ${created.skillTier}`
                  : created.trade,
                unitPriceDollars: String(created.rateCents / 100),
              });
              setAdding(null);
            }}
          />
        </Modal>
      )}
    </>
  );
}
