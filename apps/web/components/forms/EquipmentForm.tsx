"use client";

import { useState } from "react";
import { RateUnit } from "@jamquote/core";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import { modalStyles } from "@/components/ui/Modal";
import type { NewEquipmentItemInput } from "@/lib/api-client";
import type { EquipmentItem } from "@/lib/types";

const rateUnitOptions = [
  { value: RateUnit.HOUR, label: "Hour" },
  { value: RateUnit.DAY, label: "Day" },
  { value: RateUnit.WEEK, label: "Week" },
  { value: RateUnit.MONTH, label: "Month" },
  { value: RateUnit.JOB, label: "Job" },
  { value: RateUnit.UNIT, label: "Unit" },
];

const ownedOptions = [
  { value: "hired", label: "Hired from a vendor" },
  { value: "owned", label: "I own it" },
];

export interface EquipmentFormValues {
  name: string;
  owned: boolean;
  vendor: string;
  vendorPhone: string;
  rateDollars: string;
  rateUnit: RateUnit;
}

export const emptyEquipmentForm: EquipmentFormValues = {
  name: "",
  // Hired is the default because it is the case with a vendor to record. Kit
  // you own needs no phone number chasing.
  owned: false,
  vendor: "",
  vendorPhone: "",
  rateDollars: "",
  rateUnit: RateUnit.DAY,
};

export function equipmentFormValuesFromItem(item: EquipmentItem): EquipmentFormValues {
  return {
    name: item.name,
    owned: item.owned,
    vendor: item.vendor ?? "",
    vendorPhone: item.vendorPhone ?? "",
    rateDollars: String(item.rateDollars),
    rateUnit: item.rateUnit,
  };
}

export function equipmentPayloadFromValues(values: EquipmentFormValues): NewEquipmentItemInput {
  return {
    name: values.name.trim(),
    owned: values.owned,
    // Vendor details belong to hired kit. Sending them for owned equipment
    // would leave a stale hire contact on a machine that has none the moment
    // someone flips it to owned.
    vendor: values.owned ? undefined : values.vendor.trim() || undefined,
    vendorPhone: values.owned ? undefined : values.vendorPhone.trim() || undefined,
    rateCents: Math.round((Number(values.rateDollars) || 0) * 100),
    rateUnit: values.rateUnit,
  };
}

/**
 * The equipment field set shared by AddEquipmentButton and
 * EditEquipmentButton — same shape as LabourRateForm (owns its saving/error
 * state, submits values upward) with the owned-vs-hired distinction the
 * equipment library needs.
 *
 * Owned vs hired is not cosmetic. For hired kit the rate is what a vendor
 * charges you and there is someone to ring when it breaks; for kit you own it
 * is what you charge the client, and there is no vendor at all. The vendor
 * fields therefore only appear for hired items.
 */
export default function EquipmentForm({
  initial = emptyEquipmentForm,
  submitLabel = "Save equipment",
  onCancel,
  onSubmit,
  onBusyChange,
}: {
  initial?: EquipmentFormValues;
  submitLabel?: string;
  onCancel: () => void;
  onSubmit: (values: EquipmentFormValues) => Promise<void> | void;
  onBusyChange?: (busy: boolean) => void;
}) {
  const [values, setValues] = useState<EquipmentFormValues>(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const set = <K extends keyof EquipmentFormValues>(key: K, value: EquipmentFormValues[K]) =>
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
      <Input
        label="Equipment"
        value={values.name}
        onChange={(e) => set("name", e.target.value)}
        placeholder="e.g. Concrete mixer, Scaffold tower"
      />
      <Select
        label="Owned or hired"
        options={ownedOptions}
        value={values.owned ? "owned" : "hired"}
        onChange={(e) => set("owned", e.target.value === "owned")}
      />
      {!values.owned && (
        <div className={modalStyles.row2}>
          <Input
            label="Vendor"
            value={values.vendor}
            onChange={(e) => set("vendor", e.target.value)}
            placeholder="Who you hire it from"
          />
          <Input
            label="Vendor phone"
            value={values.vendorPhone}
            onChange={(e) => set("vendorPhone", e.target.value)}
            placeholder="e.g. 876-555-0134"
          />
        </div>
      )}
      <div className={modalStyles.row2}>
        <Input
          label="Rate $"
          type="number"
          value={values.rateDollars}
          onChange={(e) => set("rateDollars", e.target.value)}
        />
        <Select
          label="Per"
          options={rateUnitOptions}
          value={values.rateUnit}
          onChange={(e) => set("rateUnit", e.target.value as RateUnit)}
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
