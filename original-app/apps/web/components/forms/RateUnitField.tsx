"use client";

import { useState } from "react";
import { RateUnit } from "@jamquote/core";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import fieldStyles from "@/components/ui/Field.module.css";

/** Sentinel for the "+ Add a unit…" row. Namespaced so it can never collide
 * with a RateUnit value or a label a contractor typed. */
const ADD_UNIT = "__jq_add_unit__";

const CADENCE_OPTIONS = [
  { value: RateUnit.HOUR, label: "Hour" },
  { value: RateUnit.DAY, label: "Day" },
  { value: RateUnit.WEEK, label: "Week" },
  { value: RateUnit.MONTH, label: "Month" },
  { value: RateUnit.JOB, label: "Job" },
  { value: RateUnit.UNIT, label: "Unit" },
];

/**
 * The "Per" field for a labour rate or a piece of equipment.
 *
 * Reported as "the unit dropdown won't let me add a new unit". It cannot, and
 * that is deliberate: RateUnit is a closed Postgres enum shared by every
 * tenant, so a contractor adding "sq ft" to it would be changing the
 * vocabulary for everyone.
 *
 * What they actually need is to PRINT their own word. A painter charges by
 * the square foot, a glazier by the window, a scaffolder by the lift. So the
 * dropdown offers the six cadences plus "+ Add a unit…", and choosing that
 * captures free text into `unitLabel` while the stored cadence becomes UNIT.
 * The document then prints "120 sq ft" instead of "120 unit".
 *
 * This is the same split materials already use: a coarse rate unit for the
 * data, a label for the customer's eyes.
 */
export default function RateUnitField({
  rateUnit,
  unitLabel,
  onChange,
  label = "Per",
}: {
  rateUnit: RateUnit;
  unitLabel: string;
  /** Emits both together — they are one decision, and letting a caller set
   * a label without clearing the cadence is how the two drift apart. */
  onChange: (next: { rateUnit: RateUnit; unitLabel: string }) => void;
  label?: string;
}) {
  // A saved custom label puts the field straight into text mode on edit,
  // rather than showing "Unit" and hiding the word the contractor chose.
  const [customMode, setCustomMode] = useState(unitLabel.trim() !== "");

  const options = [
    ...CADENCE_OPTIONS,
    { value: ADD_UNIT, label: customMode ? "Use a standard unit…" : "+ Add a unit…" },
  ];

  function handleSelect(value: string) {
    if (value === ADD_UNIT) {
      if (customMode) {
        // Back to the cadence list: drop the custom word so the two cannot
        // both be set, which would leave the printed unit ambiguous.
        setCustomMode(false);
        onChange({ rateUnit, unitLabel: "" });
      } else {
        setCustomMode(true);
        onChange({ rateUnit: RateUnit.UNIT, unitLabel: "" });
      }
      return;
    }
    setCustomMode(false);
    onChange({ rateUnit: value as RateUnit, unitLabel: "" });
  }

  return (
    <div>
      <Select
        label={label}
        options={options}
        value={customMode ? ADD_UNIT : rateUnit}
        onChange={(e) => handleSelect(e.target.value)}
      />
      {customMode && (
        <>
          <Input
            aria-label="Unit name"
            placeholder="e.g. sq ft, window, lift"
            value={unitLabel}
            onChange={(e) => onChange({ rateUnit: RateUnit.UNIT, unitLabel: e.target.value })}
          />
          <span className={fieldStyles.hint}>Prints on the quote beside the quantity.</span>
        </>
      )}
    </div>
  );
}
