/**
 * Typing a squared or cubed unit without a superscript key.
 *
 * A contractor pricing tiling or concrete needs `m²` and `m³`. Neither is on a
 * phone keyboard, and neither is on most physical ones — so the unit simply
 * could not be entered, and the workaround was to write "sqm" or "m2" and live
 * with it appearing that way on the client's quote.
 *
 * So `m2` is accepted and shown as `m²`. This runs on the label a tenant types
 * when creating their own unit, which is the only place the problem arises.
 *
 * **Deliberately narrow.** It converts only a known measure followed by a 2 or
 * a 3, and nothing else. A broader rule — "any letters followed by a digit" —
 * would rewrite "Type 2" or "No2" into something the contractor did not mean,
 * and a unit silently changed under someone is worse than one they have to
 * type awkwardly. When in doubt it leaves the text alone.
 */

/** Length units that are meaningfully squared or cubed on a building job. */
const MEASURES = ["mm", "cm", "m", "km", "in", "ft", "yd"];

const SUPERSCRIPT: Record<string, string> = { "2": "²", "3": "³" };

/**
 * `m2` -> `m²`, `ft3` -> `ft³`, `sq m` -> `m²`.
 *
 * Case is preserved for the measure itself (`M2` -> `M²`) because a contractor
 * who writes capitals means them. Anything not matching is returned trimmed
 * and otherwise untouched.
 */
export function normalizeUnitLabel(label: string): string {
  const trimmed = label.trim();
  if (!trimmed) return "";

  // "m2", "M 2", "ft3" — a measure, optional space, then 2 or 3.
  const direct = trimmed.match(/^([A-Za-z]{1,2})\s*([23])$/);
  if (direct) {
    const [, measure, power] = direct;
    if (measure && power && MEASURES.includes(measure.toLowerCase())) {
      return `${measure}${SUPERSCRIPT[power]}`;
    }
  }

  // "sq m", "sqm", "cu m", "cum" — the spelled-out forms people reach for
  // precisely BECAUSE they cannot type the superscript.
  const spelled = trimmed.match(/^(sq|cu)\s*\.?\s*([A-Za-z]{1,2})$/i);
  if (spelled) {
    const [, kind, measure] = spelled;
    if (kind && measure && MEASURES.includes(measure.toLowerCase())) {
      return `${measure}${kind.toLowerCase() === "sq" ? "²" : "³"}`;
    }
  }

  return trimmed;
}
