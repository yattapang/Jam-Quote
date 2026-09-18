/**
 * Job ("job type") unit-cost math. An job is a reusable composite
 * unit (e.g. "Tiling — per sq ft") built from material/labour/other
 * components; this computes its per-unit cost from those components. Money
 * is integer JMD cents throughout — see packages/core/src/tax/money.ts.
 */

import { type Cents, applyPct, lineExtension } from "../tax/money.js";

export interface JobComponentCostInput {
  quantityPerUnit: number;
  unitPriceCents: Cents;
}

export interface JobCostInput {
  components: JobComponentCostInput[];
  /** Markup percentage applied to the summed component cost, e.g. 20 for 20%. */
  markupPct?: number;
}

/**
 * Sum each component's (quantityPerUnit * unitPriceCents), rounded half-up
 * per component, then apply the job's markup on top — also rounded
 * half-up. Mirrors the per-line rounding + markup order in quote/totals.ts
 * so job costs and quote line totals never drift from each other.
 *
 * A single component can already exceed `Number.MAX_SAFE_INTEGER`
 * (quantityPerUnit up to 999,999,999 x unitPriceCents up to the Postgres
 * `Int` max of 2,147,483,647 is ~2 x 10^18), and up to 200 of them are
 * summed. Past `MAX_SAFE_INTEGER`, `+`/rounding silently loses precision —
 * a job's cost would print a number that is not the number that was
 * computed. This REFUSES (throws) rather than clamping: a clamped cost
 * would render a wrong-but-plausible price on a real quote, which is worse
 * than a hard error the caller has to handle. Every real job's cost is
 * nowhere near this range; hitting it means bad input, not a legitimate job.
 */
export function computeJobUnitCostCents(input: JobCostInput): Cents {
  const markup = input.markupPct ?? 0;

  const baseCents = input.components.reduce((sum, c) => {
    const next = sum + lineExtension(c.quantityPerUnit, c.unitPriceCents);
    if (!Number.isSafeInteger(next)) {
      throw new RangeError("Job cost exceeds the safe integer range");
    }
    return next;
  }, 0);

  const total = markup > 0 ? baseCents + applyPct(baseCents, markup) : baseCents;
  if (!Number.isSafeInteger(total)) {
    throw new RangeError("Job cost exceeds the safe integer range");
  }
  return total;
}
