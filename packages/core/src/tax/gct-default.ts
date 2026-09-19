/**
 * The GCT rate a NEW quote or invoice starts with when the contractor has not typed one.
 *
 * Owner decision (PLANNING.md, "GCT charging", 2026-09-18): a business that is not
 * registered with TAJ must not charge its clients GCT by default, so an unregistered
 * business starts at 0%. A registered one starts at its own default rate, which signup
 * seeds from the rule pack - so ticking "GCT registered" later restores the right rate
 * without the contractor looking it up.
 *
 * This is the ONE copy of the rule. The API applies it when a document is created and
 * the web builders prefill from it, so what a contractor sees before saving is what gets
 * saved. It never applies to an existing document: updates and quote-to-invoice
 * conversion keep the rate already on the document.
 *
 * A registered business whose stored default is not a finite number starts at 0 rather
 * than a hardcoded rate: rates belong to the rule pack, and a guessed 15% written here
 * would outlive the next rate change. The builder's GCT field is visible, so a 0 is
 * seen and corrected, not silently wrong.
 */
export function newDocumentGctRatePct(business: {
  gctRegistered: boolean;
  defaultGctRatePct: number | string | null | undefined;
}): number {
  if (!business.gctRegistered) return 0;
  const rate = Number(business.defaultGctRatePct);
  return Number.isFinite(rate) ? rate : 0;
}
