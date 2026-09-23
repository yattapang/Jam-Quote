// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { JobComponentKind } from "@jamquote/core";
import JobForm, { emptyJobForm, type JobFormValues } from "./JobForm";
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

describe("JobForm — unit cost row normalises the unit", () => {
  it("P2: shows 'm²', not 'm2', matching what the API stores after normalizeUnitLabel", async () => {
    renderForm();
    const unitField = screen.getAllByLabelText("Unit")[0] as HTMLInputElement;
    await userEvent.clear(unitField);
    await userEvent.type(unitField, "m2");

    expect(screen.getByText("Unit cost / m²")).toBeInTheDocument();
    expect(screen.queryByText("Unit cost / m2")).not.toBeInTheDocument();
  });
});

describe("JobForm — Enter key inside a component row", () => {
  // jsdom does not implement a browser's implicit "Enter submits the
  // nearest form" behaviour for a single-field form the way real browsers
  // do, so `userEvent.type(field, "{Enter}")` never actually exercises that
  // path here — a test asserting `onSubmit` was not called would pass
  // identically whether or not the row's onKeyDown guard exists at all
  // (confirmed: it passed against the pre-fix component too). Testing the
  // real mechanism instead: dispatch the native, cancelable keydown event
  // the browser would use to trigger implicit submission, and check that
  // the row's handler actually calls preventDefault() on it.
  it("P2: preventDefault()s an Enter keydown while typing a component's description", async () => {
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
    const description = screen.getAllByLabelText("Description")[0] as HTMLInputElement;
    const event = new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true });
    description.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("still lets Enter submit from the job's own header fields (Name)", () => {
    render(
      <JobForm
        initial={emptyJobForm}
        materials={[material]}
        labourRates={[labourRate]}
        equipment={[] as EquipmentItem[]}
        onCancel={() => {}}
        onSubmit={vi.fn()}
      />,
    );
    const name = screen.getByLabelText("Name") as HTMLInputElement;
    const event = new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true });
    name.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(false);
  });
});

describe("JobForm — an oversize component renders an error instead of throwing", () => {
  // computeJobUnitCostCents throws RangeError past Number.MAX_SAFE_INTEGER.
  // It used to be called straight inside render (no try/catch), so a row
  // like this took the whole form down — "the page is lost" while typing.
  it("HIGH: renders a field-level error instead of crashing", () => {
    const overflowValues: JobFormValues = {
      name: "Overflow job",
      unit: "job",
      markupPct: "0",
      components: [
        {
          key: "c1",
          kind: JobComponentKind.OTHER,
          description: "Overflow",
          quantityPerUnit: "999999999999999999999999",
          unitLabel: "",
          unitPriceDollars: "999999999999999999999999",
        },
      ],
    };

    expect(() =>
      render(
        <JobForm
          initial={overflowValues}
          materials={[material]}
          labourRates={[labourRate]}
          equipment={[] as EquipmentItem[]}
          onCancel={() => {}}
          onSubmit={vi.fn()}
        />,
      ),
    ).not.toThrow();

    expect(screen.getByText(/too large/i)).toBeInTheDocument();
  });
});

describe("JobForm — duplicate component messaging", () => {
  function valuesWith(components: JobFormValues["components"]): JobFormValues {
    return { name: "Job", unit: "job", markupPct: "0", components };
  }

  it("MEDIUM/item 3: offers 'Combine them' when the duplicate rows share a price and unit", () => {
    render(
      <JobForm
        initial={valuesWith([
          {
            key: "a",
            kind: JobComponentKind.OTHER,
            description: "Sand",
            quantityPerUnit: "1",
            unitLabel: "bag",
            unitPriceDollars: "10",
          },
          {
            key: "b",
            kind: JobComponentKind.OTHER,
            description: "Sand",
            quantityPerUnit: "1",
            unitLabel: "bag",
            unitPriceDollars: "10",
          },
        ])}
        materials={[material]}
        labourRates={[labourRate]}
        equipment={[] as EquipmentItem[]}
        onCancel={() => {}}
        onSubmit={vi.fn()}
      />,
    );

    expect(screen.getByText("Already in this job.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Combine them" })).toBeInTheDocument();
  });

  it("MEDIUM/item 3: shows a check-it's-intended warning with no button when the duplicate rows have different prices ($5 and $3 Sand)", () => {
    render(
      <JobForm
        initial={valuesWith([
          {
            key: "a",
            kind: JobComponentKind.OTHER,
            description: "Sand",
            quantityPerUnit: "1",
            unitLabel: "bag",
            unitPriceDollars: "5",
          },
          {
            key: "b",
            kind: JobComponentKind.OTHER,
            description: "Sand",
            quantityPerUnit: "1",
            unitLabel: "bag",
            unitPriceDollars: "3",
          },
        ])}
        materials={[material]}
        labourRates={[labourRate]}
        equipment={[] as EquipmentItem[]}
        onCancel={() => {}}
        onSubmit={vi.fn()}
      />,
    );

    expect(screen.getByText(/different price or unit/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Combine them" })).not.toBeInTheDocument();
  });
});
