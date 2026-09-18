/**
 * The bounds on every numeric field a contractor types, in ONE place.
 *
 * ## Why this exists
 *
 * The server and the form disagreed, field by field. `discountPct` was
 * `z.number().min(0).max(100)` in the DTO and a bare `<Input type="number">` on the
 * screen — so typing `-10` produced a save that failed, and (before F28) failed with
 * the words "Validation failed" and no field named. The same for GCT, Deposit, Rate,
 * Price and `coveragePerSellUnit`, where the form allowed `0` against a `.positive()`
 * server rule.
 *
 * The telling detail: `QuoteBuilder`'s Deposit field, two lines from Discount,
 * carried `min={0}` and a conditional `max={100}`. The pattern was known and simply
 * not applied — which is what a shared definition fixes and a second hand-typed copy
 * does not.
 *
 * ## How to use it
 *
 * The DTO spends it: `z.number().min(BOUNDS.discountPct.min).max(BOUNDS.discountPct.max)`.
 * The input spends it: `min={BOUNDS.discountPct.min} max={BOUNDS.discountPct.max}`.
 * Neither can drift from the other, and a new field is bounded on both sides in one
 * edit or neither.
 *
 * `step` is here because it is part of the contract, not decoration: `progressPct` is
 * `.int()` on the server, and an input without `step={1}` accepts `50.5` and then
 * fails the save.
 */
export interface NumericBound {
  min: number;
  max?: number;
  /**
   * `1` for a whole number the server validates with `.int()`.
   *
   * A fractional step (`0.01`, `0.001`, `0.0001`) is the SCALE of the Decimal column
   * the field is persisted to (S9). `boundedNumber` refuses a value with more decimal
   * places, because Postgres would round it on write while the totals stored beside it
   * were computed from the unrounded value — `quantity: 1.0005` at $10,000 stored a
   * subtotal $5 away from what every reader recomputes from the persisted row.
   */
  step?: number;
  /** True when the server rejects zero — `.positive()`, not `.nonnegative()`. */
  positiveOnly?: boolean;
}

export const BOUNDS = {
  /** Percentage off the subtotal. */
  discountPct: { min: 0, max: 100, step: 0.01 },
  /** GCT rate. 100 is not a real rate, but it is the honest arithmetic limit. */
  gctRatePct: { min: 0, max: 100, step: 0.01 },
  /** Deposit as a percentage of the total. */
  depositPct: { min: 0, max: 100 },
  /**
   * Any money amount a contractor types, in dollars.
   *
   * No upper bound: a real contract can be large, and inventing a ceiling would
   * refuse legitimate work. The server bounds it as an integer number of cents,
   * which is what stops a payload.
   *
   * `step: 0.01` matches the cents scale: without it a bare `type="number"`
   * input refuses "12.50" in most browsers, even though `toCents` and every
   * cents DTO field accept it.
   */
  moneyDollars: { min: 0, step: 0.01 },
  /** Progress on a job. Whole numbers only — the server validates `.int()`. */
  progressPct: { min: 0, max: 100, step: 1 },
  /** Retention held back under the contract. */
  retentionPct: { min: 0, max: 100, step: 0.01 },
  /**
   * How much one sold unit covers — 20 m² per tin of paint.
   *
   * `positiveOnly`: zero coverage is not a fact about a material, it is a missing
   * value, and `coverageConfigFromFavourite` treats a half-configured material as
   * unconfigured. The form used to allow `0` against a `.positive()` server rule.
   */
  coveragePerSellUnit: { min: 0, max: 99_999_999, step: 0.0001, positiveOnly: true },
  /**
   * A line quantity. Fractions are normal — half a day, 2.5 bags.
   *
   * `Decimal(12,3)` on quote, invoice and labour lines and job components: three
   * decimal places, and a whole part of at most nine digits.
   */
  quantity: { min: 0, max: 999_999_999, step: 0.001 },
  /** A per-line or per-job margin. `Decimal(6,2)`; 1000% is the validated ceiling. */
  markupPct: { min: 0, max: 1000, step: 0.01 },
  /** JMD per USD reference rate. `Decimal(10,4)`; zero is not an exchange rate. */
  jmdPerUsd: { min: 0, max: 999_999, step: 0.0001, positiveOnly: true },
  /** Waste allowance on a material. `.min(0).max(100)` on the server. */
  wastePct: { min: 0, max: 100, step: 0.01 },
  /**
   * How long a quote stays open, in days.
   *
   * At least 1: a quote that expires the day it is sent is not an offer. The server
   * takes `validUntil` as a date rather than a day count, so this bound exists only
   * on the form — which is exactly why it belongs here with the reason attached,
   * rather than as a bare `min={1}` a reader has to guess about.
   */
  validDays: { min: 1, step: 1 },
} as const satisfies Record<string, NumericBound>;

/**
 * Longest a free-text payment reference (cheque no., bank ref, wallet id) may
 * be — spent by both the server (`recordManualPaymentSchema`) and the form
 * (`PaymentsPanel`'s reference input), so neither can drift from the other.
 */
export const PAYMENT_REFERENCE_MAX_LENGTH = 120;

/**
 * The `min` an HTML input should carry.
 *
 * A `positiveOnly` field cannot express "greater than zero" in HTML — `min` is
 * inclusive — so the smallest step above zero is used. That smallest step is the
 * bound's own `step` (defaulting to `0.01` only when the bound has none) — NOT a
 * hardcoded `0.01`, which used to block a value the server accepted whenever a
 * field's real step was finer, e.g. `coveragePerSellUnit`'s `0.0001` refusing the
 * legitimate `0.005`.
 */
export function inputMin(bound: NumericBound): number {
  return bound.positiveOnly ? bound.step ?? 0.01 : bound.min;
}

/**
 * The one password-length ceiling shared by every route that reads a password —
 * SETTING one (register, reset, change) and CHECKING one (login, current-password).
 * A weaker max on the set side than the check side locks a contractor out the
 * moment they set a password the check side will then refuse to accept back.
 * Spent by `apps/api/src/auth/auth.dto.ts` and the web password fields' `maxLength`.
 */
export const PASSWORD_MAX_LENGTH = 256;
