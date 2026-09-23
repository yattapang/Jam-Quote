// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import JobForm, { emptyJobForm } from "./JobForm";

/**
 * Creating a material or labour rate INLINE from the job builder ("+ Add new
 * material…" / "+ Add new labour rate…"), stubbing the sub-forms and the
 * network create calls so only JobForm's own onSubmit wiring is under test —
 * that wiring is where the reported defect lives (item 3: the created row's
 * unit never reached the recipe row, unlike the equipment path).
 */

vi.mock("@/lib/api-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api-client")>();
  return {
    ...actual,
    createMaterialFavourite: vi.fn().mockResolvedValue({
      id: "new-mat",
      name: "Sand",
      unit: "yd³",
      priceCents: 500_00,
      priceDollars: 500,
    }),
    createLabourRate: vi.fn().mockResolvedValue({
      id: "new-lab",
      trade: "Plumber",
      skillTier: null,
      rateCents: 300_000,
      rateDollars: 3000,
      unitLabel: "job",
    }),
  };
});

vi.mock("./MaterialForm", () => ({
  materialPayloadFromValues: vi.fn().mockReturnValue({}),
  default: ({ onSubmit }: { onSubmit: (v: unknown, c: unknown) => void }) => (
    <button type="button" onClick={() => onSubmit({}, undefined)}>
      fake-submit-material
    </button>
  ),
}));

vi.mock("./LabourRateForm", () => ({
  labourRatePayloadFromValues: vi.fn().mockReturnValue({}),
  default: ({ onSubmit }: { onSubmit: (v: unknown) => void }) => (
    <button type="button" onClick={() => onSubmit({})}>
      fake-submit-labour
    </button>
  ),
}));

function renderForm() {
  render(
    <JobForm
      initial={emptyJobForm}
      materials={[]}
      labourRates={[]}
      equipment={[]}
      onCancel={() => {}}
      onSubmit={vi.fn()}
    />,
  );
}

describe("JobForm — creating a material inline", () => {
  it("carries the created material's unit onto the row, same as equipment does", async () => {
    renderForm();
    const user = userEvent.setup();
    await user.selectOptions(screen.getByLabelText("Saved material"), "__add__");
    await user.click(await screen.findByText("fake-submit-material"));

    const unit = screen.getAllByLabelText("Unit")[1] as HTMLInputElement;
    expect(unit.value).toBe("yd³");
  });
});

describe("JobForm — creating a labour rate inline", () => {
  it("carries the created rate's unit onto the row, same as equipment does", async () => {
    renderForm();
    const user = userEvent.setup();
    await user.selectOptions(screen.getByLabelText("Kind"), "LABOUR");
    await user.selectOptions(screen.getByLabelText("Saved labour rate"), "__add__");
    await user.click(await screen.findByText("fake-submit-labour"));

    const unit = screen.getAllByLabelText("Unit")[1] as HTMLInputElement;
    expect(unit.value).toBe("job");
  });
});
