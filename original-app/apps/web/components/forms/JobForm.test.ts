import { describe, expect, it } from "vitest";
import { JobComponentKind } from "@jamquote/core";
import type { Job, JobComponent } from "@/lib/types";
import { componentRowProblem, jobFormValuesFromAssembly, jobPayloadFromValues, type JobComponentDraft } from "./JobForm";

function draft(over: Partial<JobComponentDraft> = {}): JobComponentDraft {
  return {
    key: "k1",
    kind: JobComponentKind.OTHER,
    description: "",
    quantityPerUnit: "1",
    unitLabel: "",
    unitPriceDollars: "",
    ...over,
  };
}

describe("componentRowProblem", () => {
  it("is silent on a genuinely untouched row — the spare row is not an error", () => {
    expect(componentRowProblem(draft(), 1)).toBeNull();
  });

  it("is silent on a fully valid row", () => {
    expect(componentRowProblem(draft({ description: "Transport", quantityPerUnit: "1" }), 1)).toBeNull();
  });

  it("P2: names the row when it has a price but quantity 0", () => {
    expect(
      componentRowProblem(
        draft({ description: "Transport", quantityPerUnit: "0", unitPriceDollars: "500" }),
        3,
      ),
    ).toBe("Row 3 needs a quantity above 0");
  });

  it("P2: names the row when an OTHER row has no description", () => {
    expect(componentRowProblem(draft({ unitPriceDollars: "500" }), 2)).toBe("Row 2 needs a description");
  });

  it("a picked library row with no quantity is still flagged", () => {
    expect(
      componentRowProblem(
        draft({ materialFavouriteId: "m1", description: "Cement", quantityPerUnit: "0" }),
        1,
      ),
    ).toBe("Row 1 needs a quantity above 0");
  });
});

/**
 * Round-trips a job's components through jobFormValuesFromAssembly (server
 * shape -> form draft) and back through jobPayloadFromValues (form draft ->
 * API payload), for all three sourced kinds. Every id must survive the trip.
 *
 * This is the regression test for the reported defect: an equipment
 * component's `equipmentItemId` was dropped by both directions, so after a
 * save the "Saved equipment" picker went blank, duplicate detection couldn't
 * match it, and a deleted equipment item left no link to clear.
 */
function component(over: Partial<JobComponent> & { kind: JobComponentKind }): JobComponent {
  return {
    id: `comp-${over.kind}`,
    description: "line",
    quantityPerUnit: 1,
    unitPriceCents: 1000,
    sort: 0,
    ...over,
  };
}

function job(components: JobComponent[]): Job {
  return {
    id: "job-1",
    name: "Test job",
    unit: "sq ft",
    markupPct: 10,
    unitCostCents: 0,
    components,
  };
}

describe("job component id round-trip", () => {
  it("carries materialFavouriteId, labourRateId and equipmentItemId all the way through", () => {
    const source = job([
      component({ kind: JobComponentKind.MATERIAL, materialFavouriteId: "mat-1" }),
      component({ kind: JobComponentKind.LABOUR, labourRateId: "lab-1" }),
      component({ kind: JobComponentKind.EQUIPMENT, equipmentItemId: "equip-1" }),
    ]);

    const formValues = jobFormValuesFromAssembly(source);
    const payload = jobPayloadFromValues(formValues);

    const material = payload.components.find((c) => c.kind === JobComponentKind.MATERIAL);
    const labour = payload.components.find((c) => c.kind === JobComponentKind.LABOUR);
    const equipment = payload.components.find((c) => c.kind === JobComponentKind.EQUIPMENT);

    expect(material?.materialFavouriteId).toBe("mat-1");
    expect(labour?.labourRateId).toBe("lab-1");
    expect(equipment?.equipmentItemId).toBe("equip-1");
  });
});
