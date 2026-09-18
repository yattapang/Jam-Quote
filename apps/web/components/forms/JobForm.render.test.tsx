// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { JobComponentKind } from "@jamquote/core";
import JobForm, { emptyJobForm } from "./JobForm";
import type { EquipmentItem, LabourRate, MaterialFavourite } from "@/lib/types";

/**
 * Picking a saved material/labour rate into a job recipe row, exercised
 * through the real form rather than through the pure helpers — the two
 * defects here live inside ComponentRow's picker closures, which
 * jobFormValuesFromAssembly/jobPayloadFromValues never touch.
 */

const material: MaterialFavourite = {
  id: "mat-1",
  name: "Cement",
  description: "Portland, grey",
  unit: "bag",
  priceCents: 125_000,
  priceDollars: 1250,
} as MaterialFavourite;

const labourRate: LabourRate = {
  id: "lab-1",
  trade: "Mason",
  skillTier: "Senior",
  rateDollars: 4000,
  rateCents: 400_000,
  rateUnit: "HOUR",
  unitLabel: null,
} as unknown as LabourRate;

function renderForm() {
  const onSubmit = vi.fn();
  render(
    <JobForm
      initial={emptyJobForm}
      materials={[material]}
      labourRates={[labourRate]}
      equipment={[] as EquipmentItem[]}
      onCancel={() => {}}
      onSubmit={onSubmit}
    />,
  );
  return { user: userEvent.setup() };
}

async function selectKind(kind: JobComponentKind) {
  const kindSelect = screen.getByLabelText("Kind");
  await userEvent.selectOptions(kindSelect, kind);
}

describe("JobForm — picking a saved material", () => {
  it("uses the same description as the quote builder (materialLineDescription), not the picker label with its price", async () => {
    renderForm();
    // MATERIAL is already the default kind.
    const materialSelect = screen.getByLabelText("Saved material");
    await userEvent.selectOptions(materialSelect, "mat-1");

    const description = screen.getAllByLabelText("Description")[0] as HTMLInputElement;
    expect(description.value).toBe("Cement — Portland, grey");
    expect(description.value).not.toContain("$");
  });

  it("carries the picked material's own unit onto the row", async () => {
    renderForm();
    const materialSelect = screen.getByLabelText("Saved material");
    await userEvent.selectOptions(materialSelect, "mat-1");

    // getAllByLabelText("Unit")[0] is the job-level "Unit" field (e.g. "sq
    // ft"); [1] is this component row's own unit.
    const unit = screen.getAllByLabelText("Unit")[1] as HTMLInputElement;
    expect(unit.value).toBe("bag");
  });
});

describe("JobForm — picking a saved labour rate", () => {
  it("spells the description the same way the inline-create path does (labourDescription)", async () => {
    renderForm();
    await selectKind(JobComponentKind.LABOUR);
    const labourSelect = screen.getByLabelText("Saved labour rate");
    await userEvent.selectOptions(labourSelect, "lab-1");

    const description = screen.getAllByLabelText("Description")[0] as HTMLInputElement;
    expect(description.value).toBe("Mason — Senior");
  });
});
