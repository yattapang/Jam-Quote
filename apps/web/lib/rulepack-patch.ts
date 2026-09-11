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

/**
 * A patch built by `buildRulePackPatch`, and by nothing else.
 *
 * The brand is what stops these rules being re-implemented inline. They WERE inline
 * through four reviews and three defects, and the source guard that policed the
 * delegation was defeated by keeping a dead `buildRulePackPatch(...)` call for the
 * scanner to find and passing a hand-built object to the mutator instead. A regex
 * cannot tell those apart; the type system can — `updateAdminRulePack` accepts only
 * this type, so an inline literal is a compile error rather than a review finding.
 */
export class RulePackPatch {
  /**
   * Private, which is what makes this nominal rather than structural.
   *
   * The first version was an intersection with a phantom `unique symbol` property. A
   * review defeated it twice: `{ ...buildRulePackPatch(e), statutoryRetired: [] }`
   * spreads the phantom property into the result, so the brand survived arbitrary
   * field replacement — and `statutoryRetired: []` is the REPLACE that wipes every
   * stored retirement. `Object.assign` did the same.
   *
   * The brand was constraining the provenance of the OBJECT while the defect class is
   * about the provenance of its FIELDS. A class with a private member cannot be
   * spread into existence, and the body is behind a getter, so mutating the wrapper
   * does not reach the payload.
   */
  private readonly nominal = true;

  constructor(private readonly patch: UpdateRulePackInput) {}

  /** The body to send. Read only by `updateAdminRulePack`. */
  get body(): UpdateRulePackInput {
    return this.patch;
  }
}

/**
 * Statutory codes whose rate the custom list has taken over.
 *
 * Exported because the payload, the validator and the rate grid all need the same
 * answer. Three hand-written copies of this comparison have already produced two
 * defects: one missed the DTO's space-to-underscore step, and one left the grid
 * rendering an input for a rate nothing would send.
 */
export function customOwnedCodes(custom: StatutoryCustomRows): Set<string> {
  return new Set(custom.map((c) => normaliseCode(c.code)));
}

/**
 * Which contributions the statutory rate grid should offer an input for.
 *
 * A function rather than a filter expression inline in the JSX, for the same reason
 * the payload is a function: it is a decision with a right answer, and the two
 * attempts to make it inline were both wrong.
 *
 *   - the first rendered every effective contribution, so a levy the admin had added
 *     got a grid input AND its own row — two inputs for one number, and the grid's
 *     copy won the merge
 *   - the second filtered to baseline codes, which fixed the new-levy case and
 *     missed the REPLACEMENT case: `mergeStatutory` consumes a custom entry in place
 *     when its code matches a baseline one, so `NIS` is still a baseline code
 *
 * A code belongs in the grid when the baseline defines it AND no custom entry has
 * taken it over. The custom row is the editor for anything the custom list owns.
 */
export function gridContributionCodes(
  effective: readonly { code: string }[],
  baseline: readonly { code: string }[],
  custom: StatutoryCustomRows,
): string[] {
  const isBaseline = new Set(baseline.map((b) => b.code));
  const owned = customOwnedCodes(custom);
  return effective
    .map((s) => s.code)
    .filter((code) => isBaseline.has(code) && !owned.has(normaliseCode(code)));
}

export function buildRulePackPatch(edits: RulePackEdits): RulePackPatch {
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
  const owned = customOwnedCodes(custom);
  const statutoryRates: Record<string, { employeePct: number | null; employerPct: number | null }> =
    {};
  for (const [code, typed] of Object.entries(form.statutory)) {
    if (owned.has(normaliseCode(code))) continue;
    statutoryRates[code] = {
      employeePct: rate(typed.employeePct),
      employerPct: rate(typed.employerPct),
    };
  }

  const patch: UpdateRulePackInput = {
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
  return new RulePackPatch(patch);
}

/** A full http(s) address.
 *
 * Deliberately STRICTER than the DTO's `z.string().url()`, which accepts `ftp://`,
 * `mailto:` and `javascript:` — so this never refuses something the server would
 * take, and a "Source" link a staffer clicks is always a web page.
 */
function isHttpUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * What is wrong with the rule-pack form, in words, or null.
 *
 * ## Why this lives beside the builder
 *
 * It used to be a closure inside the console, and it validated the FORM while
 * `buildRulePackPatch` decided what to SEND. A review found the gap that opens
 * between those two ideas: the rate grid stops rendering a code once a custom entry
 * takes it over, and the payload stops sending it — but the form state keeps the
 * value, so an out-of-range number left in an input that has since unmounted refused
 * every later save, naming a field no longer on screen. There was no way to obey the
 * message; the only escapes were deleting the custom row or reloading and losing
 * every pending edit.
 *
 * So this validates the values the patch will actually carry, from the same `owned`
 * set the builder uses. A value nothing sends cannot block a save.
 *
 * `overrideReadFailed` comes first: everything else is a judgement about values this
 * screen may not have. A failed rule-pack read serves the baseline with empty
 * override lists, which is indistinguishable from "no override exists", and saving on
 * that view writes complete lists over whatever is stored.
 */
export function rulePackProblem(edits: RulePackEdits, overrideReadFailed: boolean): string | null {
  if (overrideReadFailed)
    return "The stored rule-pack overrides could not be read, so this screen may be showing the baseline instead of your settings. Reload before saving — saving now would overwrite them.";

  const { form, custom, sourcesTouched, sourcesDraft } = edits;

  const taxLabel = form.taxLabel.trim();
  if (taxLabel === "")
    return "Tax label is required — it is what every quote and invoice calls the tax.";
  // Trimmed, because the patch sends `taxLabel` trimmed, so the trimmed length is
  // what the server's `.max(16)` sees. The custom rows below are sent as typed, so
  // those are checked raw.
  if (taxLabel.length > 16) return "Tax label must be 16 characters or fewer.";

  const rate = Number(form.defaultTaxRatePct);
  if (form.defaultTaxRatePct.trim() === "" || !Number.isFinite(rate) || rate < 0 || rate > 100)
    return "Default tax rate must be a number between 0 and 100.";

  // Only the rates the patch will carry. A blank one means "not sourced yet" and is
  // sent as null; what it may not be is present and out of range.
  const owned = customOwnedCodes(custom);
  for (const [code, typed] of Object.entries(form.statutory)) {
    if (owned.has(normaliseCode(code))) continue;
    for (const [side, raw] of [
      ["employee", typed.employeePct],
      ["employer", typed.employerPct],
    ] as const) {
      if (raw.trim() === "") continue;
      const pct = Number(raw);
      if (!Number.isFinite(pct) || pct < 0 || pct > 100)
        return `${code} ${side} rate must be a number between 0 and 100.`;
    }
  }

  if (form.verifiedAsOf.trim() !== "" && !/^\d{4}-\d{2}-\d{2}$/.test(form.verifiedAsOf.trim()))
    return "Verified date must be a date (YYYY-MM-DD).";
  const sourceUrl = form.sourceUrl.trim();
  if (sourceUrl !== "" && !isHttpUrl(sourceUrl))
    return "Source URL must be a full web address, starting http:// or https://.";

  // `sources` is sent whenever the admin has edited the box, and was checked nowhere:
  // one typo'd line, or a 21st URL, 400s the whole save with the server's array path.
  if (sourcesTouched) {
    const urls = sourcesDraft
      .split("\n")
      .map((u) => u.trim())
      .filter(Boolean);
    if (urls.length > 20) return "At most 20 source pages.";
    const bad = urls.findIndex((u) => !isHttpUrl(u));
    if (bad >= 0) return `Source #${bad + 1} is not a full web address: ${urls[bad]}`;
  }

  // Naming the row is more use than the server's array path. Lengths are raw,
  // because the rows are sent as typed and the server's `.max()` runs before its
  // uppercase/underscore transform.
  for (const [i, c] of custom.entries()) {
    if (c.code.trim() === "") return `Contribution #${i + 1} needs a code.`;
    if (c.code.length > 40) return `Contribution #${i + 1} code is too long (40 max).`;
    if (c.label.trim() === "") return `Contribution #${i + 1} needs a name.`;
    if (c.label.length > 80) return `Contribution #${i + 1} name is too long (80 max).`;
    for (const [side, pct] of [
      ["employee", c.employeePct],
      ["employer", c.employerPct],
    ] as const) {
      if (pct !== null && pct !== undefined && (!Number.isFinite(pct) || pct < 0 || pct > 100))
        return `Contribution #${i + 1} ${side} rate must be between 0 and 100.`;
    }
  }
  return null;
}
