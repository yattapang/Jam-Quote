import { computeTotals, GctTreatment } from "@jamquote/core";

/**
 * Preview-only invoice lines for the invoice-detail screen. The amount due
 * used to be a separate hard-coded figure ($183,540.80) that did not match
 * what these lines actually sum to ($183,540.00) — computeTotals (the one
 * place totals are allowed to be computed, per ARCHITECTURE.md §5) is now the
 * single source for both the total and the breakdown, so the two can never
 * disagree again.
 *
 * Kept in its own module, separate from the React Native screen, so the
 * arithmetic can be unit-tested without pulling in react-native/expo-router.
 */
export const DEMO_LINES = [
  { label: "Materials", quantity: 1, unitPriceCents: 9_600_000, gctTreatment: GctTreatment.STANDARD },
  { label: "Labour", quantity: 1, unitPriceCents: 5_400_000, gctTreatment: GctTreatment.STANDARD },
  { label: "Equipment & rental", quantity: 1, unitPriceCents: 1_800_000, gctTreatment: GctTreatment.STANDARD },
];
export const DEMO_GCT_RATE_PCT = 15;
export const DEMO_DISCOUNT_PCT = 5;

export const demoTotals = computeTotals({
  lines: DEMO_LINES,
  gctRatePct: DEMO_GCT_RATE_PCT,
  discountPct: DEMO_DISCOUNT_PCT,
});

// Discount before GCT, matching the order computeTotals actually applies them
// in (GCT is charged on the POST-discount base) — the old hard-coded list
// printed GCT above the discount it was computed after.
export const DEMO_LINE_BREAKDOWN = [
  ...DEMO_LINES.map((line, i) => ({ label: line.label, cents: demoTotals.lineTotals[i].afterMarkupCents })),
  { label: `Discount (${DEMO_DISCOUNT_PCT}%)`, cents: -demoTotals.discountCents },
  { label: `GCT (${DEMO_GCT_RATE_PCT}%)`, cents: demoTotals.gctCents },
];
