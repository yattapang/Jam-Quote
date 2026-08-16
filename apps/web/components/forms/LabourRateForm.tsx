"use client";

import { useState } from "react";
import { RateUnit } from "@jamquote/core";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import RateUnitField from "@/components/forms/RateUnitField";
import { modalStyles } from "@/components/ui/Modal";
import TradeSelectField from "@/components/forms/TradeSelectField";
import type { NewLabourRateInput, Trade } from "@/lib/api-client";
import type { LabourRate } from "@/lib/types";

export interface LabourRateFormValues {
  trade: string;
  skillTier: string;
  rateDollars: string;
  rateUnit: RateUnit;
  /** Free-text override for what prints; "" = use the cadence. */
  unitLabel: string;
}

export const emptyLabourRateForm: LabourRateFormValues = {
  trade: "",
  skillTier: "",
  rateDollars: "",
  rateUnit: RateUnit.DAY,
  unitLabel: "",
};

export function labourRateFormValuesFromLabourRate(rate: LabourRate): LabourRateFormValues {
  return {
    trade: rate.trade,
    skillTier: rate.skillTier ?? "",
    rateDollars: String(rate.rateDollars),
    rateUnit: rate.rateUnit,
    unitLabel: rate.unitLabel ?? "",
  };
}

export function labourRatePayloadFromValues(values: LabourRateFormValues): NewLabourRateInput {
  return {
    trade: values.trade.trim(),
    skillTier: values.skillTier.trim() || undefined,
    rateCents: Math.round((Number(values.rateDollars) || 0) * 100),
    rateUnit: values.rateUnit,
    unitLabel: values.unitLabel.trim() || undefined,
  };
}

/**
 * The labour-rate field set shared by AddLabourRateButton and
 * EditLabourRateButton — mirrors MaterialForm's shape (owns its own
 * saving/error state) but uses TradeSelectField for `trade` and adds the
 * skill-tier + rate-unit fields the labour rate book needs.
 */
export default function LabourRateForm({
  initial = emptyLabourRateForm,
  submitLabel = "Save labour rate",
  trades,
  onCancel,
  onSubmit,
  onBusyChange,
}: {
  initial?: LabourRateFormValues;
  submitLabel?: string;
  /** Trades list to populate the type-ahead picker, fetched server-side by
   * the labour page (getTrades()) so it's ready before the modal opens. */
  trades: Trade[];
  onCancel: () => void;
  onSubmit: (values: LabourRateFormValues) => Promise<void> | void;
  onBusyChange?: (busy: boolean) => void;
}) {
  const [values, setValues] = useState<LabourRateFormValues>(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const set = <K extends keyof LabourRateFormValues>(key: K, value: LabourRateFormValues[K]) =>
    setValues((v) => ({ ...v, [key]: value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!values.trade.trim()) return setError("Trade is required.");
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
      <TradeSelectField trades={trades} value={values.trade} onChange={(name) => set("trade", name)} />
      <Input
        label="Skill tier"
        value={values.skillTier}
        onChange={(e) => set("skillTier", e.target.value)}
        placeholder="e.g. helper, journeyman, master"
      />
      <div className={modalStyles.row2}>
        <Input
          label="Rate $"
          type="number"
          value={values.rateDollars}
          onChange={(e) => set("rateDollars", e.target.value)}
        />
        <RateUnitField
          rateUnit={values.rateUnit}
          unitLabel={values.unitLabel}
          onChange={(next) => setValues((v) => ({ ...v, ...next }))}
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
