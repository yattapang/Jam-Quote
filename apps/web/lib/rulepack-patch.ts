import type { UpdateRulePackInput } from "@/lib/api-client";

/**
 * Builds the `PATCH /admin/rulepack` body from the console's form state.
 *
 * ## Why this is a pure function in its own file
 *
 * This payload has now been the subject of four reviews and three defects, all of the
 * same shape: which fields are SENT, and which are omitted, decides whether a save
 * changes data, leaves it alone, or destroys it. `PATCH` semantics mean an absent
 * field is "leave unchanged" and an empty list is "clear".
 *
 *   - omitting an empty `statutoryRetired` made retirement a one-way door
 *   - always sending it destroyed every stored retirement after a failed read
 *   - a rate for a code a custom entry had taken over silently beat the entry
 *
 * Each was caught by a reviewer reading source, because the payload was built inline
 * in a 2,600-line client component and the only way to assert anything about it was
 * to scan the file's text. I wrote four versions of that scanner and a review walked
 * past each one — a nested spread, `Object.assign`, a computed key, a constant
 * condition, a coercion hoisted one line up. The scanner was never the answer: the
 * payload just needed to be a function with a return value.
 *
 * So the rules live here, each with a test that constructs the state and reads the
 * result. A rewrite that changes behaviour fails; a rewrite that only changes
 * spelling does not.
 */

/** The rate-grid mirror: one entry per contribution, both sides as typed. */
export interface RulePackFormState {
  taxLabel: string;
  defaultTaxRatePct: string;
  verifiedAsOf: string;
  sourceUrl: string;
  statutory: Record<string, { employeePct: string; employerPct: string }>;
}

export type StatutoryCustomRows = NonNullable<UpdateRulePackInput["statutoryCustom"]>;

export interface RulePackEdits {
  form: RulePackFormState;
  /** Levies the admin has added or redefined, as edited on screen. */
  custom: StatutoryCustomRows;
  /** Codes the admin has retired. */
  retired: string[];
  /**
   * Whether `custom`/`retired` have been edited since the last load.
   *
   * NOT "are they non-empty". Both lists are complete lists: sending an empty one
   * CLEARS, omitting it leaves alone. The distinction that matters is "the admin
   * removed the last entry" versus "this save is about a tax rate" — and treating
   * empty as absent, or absent as empty, has produced one defect each.
   */
  contributionsTouched: boolean;
  sourcesTouched: boolean;
  sourcesDraft: string;
}

/**
 * A statutory code as the server will store it.
 *
 * One copy of the rule `updateRulePackSchema` applies —
 * `.trim().toUpperCase().replace(/\s+/g, "_")`. A second hand-written copy in the
 * console kept only the first two steps, so a code typed "EDUCATION TAX" normalised
 * to "EDUCATION TAX", never matched the stored EDUCATION_TAX, and the duplicate rate
 * input it was meant to suppress stayed on screen.
 */
export function normaliseCode(code: string): string {
  return code.trim().toUpperCase().replace(/\s+/g, "_");
}

/** `""` means "not sourced yet" and is sent as null, not dropped. */
function rate(typed: string): number | null {
  return typed.trim() === "" ? null : Number(typed);
}

export function buildRulePackPatch(edits: RulePackEdits): UpdateRulePackInput {
  const { form, custom, retired, contributionsTouched, sourcesTouched, sourcesDraft } = edits;

  /**
   * `statutoryRates` carries BASELINE codes only.
   *
   * A `statutoryRates` entry is a rate for a contribution the baseline defines. A
   * `statutoryCustom` entry with the same code is a full definition that replaces
   * it, and core lets the definition win — so sending a rate for a code the custom
   * list owns would be writing to a store nothing reads. `RulePackService.update`
   * prunes any that are already there, which is what makes omitting them safe:
   * omission alone would have left the stale stored rate in charge.
   */
  const owned = new Set(custom.map((c) => normaliseCode(c.code)));
  const statutoryRates: Record<string, { employeePct: number | null; employerPct: number | null }> =
    {};
  for (const [code, typed] of Object.entries(form.statutory)) {
    if (owned.has(normaliseCode(code))) continue;
    statutoryRates[code] = {
      employeePct: rate(typed.employeePct),
      employerPct: rate(typed.employerPct),
    };
  }

  return {
    // Every scalar is sent unconditionally. The caller refuses the save when one is
    // unusable rather than coercing it to `undefined`, which the server would read
    // as "leave unchanged" while the screen said "Saved".
    taxLabel: form.taxLabel.trim(),
    defaultTaxRatePct: Number(form.defaultTaxRatePct),
    verifiedAsOf: form.verifiedAsOf.trim() === "" ? null : form.verifiedAsOf.trim(),
    sourceUrl: form.sourceUrl.trim() === "" ? null : form.sourceUrl.trim(),
    statutoryRates,
    ...(contributionsTouched ? { statutoryCustom: custom, statutoryRetired: retired } : {}),
    ...(sourcesTouched
      ? {
          sources: sourcesDraft
            .split("\n")
            .map((u) => u.trim())
            .filter(Boolean),
        }
      : {}),
  };
}
