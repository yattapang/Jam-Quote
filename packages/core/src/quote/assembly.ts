/**
 * Assembly ("job type") unit-cost math. An assembly is a reusable composite
 * unit (e.g. "Tiling — per sq ft") built from material/labour/other
 * components; this computes its per-unit cost from those components. Money
 * is integer JMD cents throughout — see packages/core/src/tax/money.ts.
 */

import { type Cents, applyPct, lineExtension } from "../tax/money.js";

export interface AssemblyComponentCostInput {
  quantityPerUnit: number;
  unitPriceCents: Cents;
}

export interface AssemblyCostInput {
  components: AssemblyComponentCostInput[];
  /** Markup percentage applied to the summed component cost, e.g. 20 for 20%. */
  markupPct?: number;
}

/**
 * Sum each component's (quantityPerUnit * unitPriceCents), rounded half-up
 * per component, then apply the assembly's markup on top — also rounded
 * half-up. Mirrors the per-line rounding + markup order in quote/totals.ts
 * so assembly costs and quote line totals never drift from each other.
 */
export function computeAssemblyUnitCostCents(input: AssemblyCostInput): Cents {
  const markup = input.markupPct ?? 0;

  const baseCents = input.components.reduce(
    (sum, c) => sum + lineExtension(c.quantityPerUnit, c.unitPriceCents),
    0,
  );

  return markup > 0 ? baseCents + applyPct(baseCents, markup) : baseCents;
}
