/**
 * The line-item editing model shared by the quote builder and the invoice
 * editor. Both screens edit the same rows against the same API shape, and
 * for a while each carried its own copy of everything below — which is how
 * the invoice editor missed the material picker, sold-by units and job types
 * the quote gained. One copy, so a fix lands on both.
 *
 * Everything here is pure and DOM-free: it is the automated safety net for
 * the two builders, neither of which can be render-tested in this repo.
 * Money is always integer cents.
 */
import { coverageBreakdown, GctTreatment, LineCategory, RateUnit } from "@jamquote/core";
import type { InvoiceLineItemInput, NewQuoteLineInput } from "./api-client";
import { ADD_NEW_OPTION_VALUE } from "./catalog-options";
import { CATEGORY_LABEL, RATE_UNIT_LABEL } from "./quote-totals";
import type { Assembly, LabourRate, MaterialFavourite, QuoteLineAssemblyComponent } from "./types";

/** Heading-dropdown sentinel meaning "let me name a new one", never a value. */
export const ADD_HEADING_VALUE = "__add_heading__";

/**
 * A line's heading is either one of the built-in categories or a custom
 * title the user typed in. Built-in headings map straight to `LineCategory`
 * for the API; custom headings still need a valid category, so they're sent
 * as OTHER — grouping on the finalized document is by heading/section, not by
 * category.
 */
export type Heading =
  | { kind: "category"; category: LineCategory }
  | { kind: "custom"; title: string };

export function headingToValue(h: Heading): string {
  return h.kind === "category" ? `cat:${h.category}` : `custom:${h.title}`;
}
export function valueToHeading(value: string): Heading {
  return value.startsWith("custom:")
    ? { kind: "custom", title: value.slice("custom:".length) }
    : { kind: "category", category: value.slice("cat:".length) as LineCategory };
}
export function headingTitle(h: Heading): string {
  return h.kind === "category" ? CATEGORY_LABEL[h.category] : h.title;
}
/** Finds the built-in category whose CATEGORY_LABEL matches a section title
 * exactly (e.g. a quote saved with the "Materials" heading) — used to
 * reconstruct a built-in heading from an existing document's section title. */
export function categoryForLabel(label: string): LineCategory | undefined {
  return (Object.entries(CATEGORY_LABEL) as [LineCategory, string][]).find(([, l]) => l === label)?.[0];
}
/** A section title round-trips as a built-in heading when it matches a
 * CATEGORY_LABEL exactly (a document saved with only built-in headings);
 * anything else is a custom heading. */
export function headingFromSectionTitle(title: string): Heading {
  const category = categoryForLabel(title);
  return category ? { kind: "category", category } : { kind: "custom", title };
}

/** Built-in category options for the Heading dropdown, labelled the same way
 * they'll appear as a section title on the finalized document (CATEGORY_LABEL). */
export const categoryHeadingOptions = Object.values(LineCategory).map((c) => ({
  value: `cat:${c}`,
  label: CATEGORY_LABEL[c],
}));
export const gctOptions = [
  { value: GctTreatment.STANDARD, label: "Standard" },
  { value: GctTreatment.ZERO_RATED, label: "Zero-rated" },
  { value: GctTreatment.EXEMPT, label: "Exempt" },
];
export const rateUnitOptions = Object.values(RateUnit).map((v) => ({
  value: v,
  label: v.charAt(0) + v.slice(1).toLowerCase(),
}));

export const toCents = (dollars: string) => Math.round((Number(dollars) || 0) * 100);
export const fromCents = (cents: number) => (cents / 100).toString();

export interface DraftLine {
  key: string;
  heading: Heading;
  description: string;
  quantity: string;
  rateUnit: RateUnit;
  /** How the picked material is SOLD ("bag", "sheet"). rateUnit can't express
   * that — it's the labour-time vocabulary — so without this a material sold by
   * the bag printed as "unit" on the customer's document. Snapshotted at pick
   * time so a sent document doesn't change if the unit is later renamed. */
  unitLabel?: string;
  unitPriceDollars: string;
  gctTreatment: GctTreatment;
  /** Set only on a line dropped in from a job type ("+ Add job type"). The
   * unit price stays editable like any other line; these fields ride along as
   * a snapshot so the line can render its component breakdown in DETAILED view
   * and stay stable even if the source assembly later changes. */
  assemblyId?: string;
  assemblyName?: string;
  assemblyUnit?: string;
  assemblyComponents?: QuoteLineAssemblyComponent[];
  /** Set when this line's description/price were populated from a picked or
   * newly-created favourite — the precise identity ★ Save-as-favourite uses to
   * update that exact variant rather than guessing from text. Cleared as soon
   * as the description is hand-edited (see patchLine()), since at that point
   * the line no longer necessarily represents that favourite. */
  materialFavouriteId?: string;
}

let counter = 0;
/** React keys only — never persisted, so a process-wide counter is enough. */
const nextKey = () => `l${++counter}`;

export function newLine(): DraftLine {
  return {
    key: nextKey(),
    heading: { kind: "category", category: LineCategory.MATERIAL },
    description: "",
    quantity: "1",
    rateUnit: RateUnit.UNIT,
    unitPriceDollars: "",
    gctTreatment: GctTreatment.STANDARD,
  };
}

/** Builds a draft line from a picked job type: description = assembly name,
 * unit price = its computed unit cost (editable afterwards), and the component
 * snapshot carried for DETAILED rendering. Assembly lines default to the OTHER
 * heading — a composite job type isn't a single material/labour category — and
 * carry the assembly's free-text unit (e.g. "sq ft") in assemblyUnit. */
export function assemblyLine(a: Assembly, quantity: number): DraftLine {
  return {
    key: nextKey(),
    heading: { kind: "category", category: LineCategory.OTHER },
    description: a.name,
    quantity: String(quantity),
    rateUnit: RateUnit.UNIT,
    unitPriceDollars: fromCents(a.unitCostCents),
    gctTreatment: GctTreatment.STANDARD,
    assemblyId: a.id,
    assemblyName: a.name,
    assemblyUnit: a.unit,
    assemblyComponents: a.components.map((c) => ({
      kind: c.kind,
      description: c.description,
      quantityPerUnit: c.quantityPerUnit,
      unitPriceCents: c.unitPriceCents,
    })),
  };
}

/** Builds a draft line from a saved labour rate. Unlike a material, a labour
 * rate genuinely IS denominated in the rateUnit vocabulary (per hour, per
 * day), so its rateUnit is carried across and unitLabel is left unset — the
 * document then prints "hour", not a sold-by unit that would be a lie. */
export function labourLine(r: LabourRate, quantity: number): DraftLine {
  return {
    key: nextKey(),
    heading: { kind: "category", category: LineCategory.LABOUR },
    description: r.skillTier ? `${r.trade} — ${r.skillTier}` : r.trade,
    quantity: String(quantity),
    rateUnit: r.rateUnit,
    unitPriceDollars: fromCents(r.rateCents),
    gctTreatment: GctTreatment.STANDARD,
  };
}

/** One line as an existing quote/invoice hands it back for editing. */
export interface InitialLine {
  category: LineCategory;
  description: string;
  quantity: number;
  rateUnit: RateUnit;
  /** Round-tripped on edit so a saved line keeps the unit the customer already
   * saw on the document. */
  unitLabel?: string;
  unitPriceCents: number;
  gctTreatment: GctTreatment;
  /** Carried through on edit so a job-type line keeps its breakdown snapshot. */
  assemblyId?: string;
  assemblyName?: string;
  assemblyUnit?: string;
  assemblyComponents?: QuoteLineAssemblyComponent[];
}
export interface InitialSection {
  title: string;
  lines: InitialLine[];
}
/** The line-bearing part of an existing quote/invoice — the rest of each
 * document's initial state (validity, due date, terms) stays on its own type. */
export interface InitialLines {
  lines?: InitialLine[];
  sections?: InitialSection[];
}

export function draftLineFromInitial(l: InitialLine, heading: Heading): DraftLine {
  return {
    key: nextKey(),
    heading,
    description: l.description,
    quantity: String(l.quantity),
    rateUnit: l.rateUnit,
    unitLabel: l.unitLabel,
    unitPriceDollars: fromCents(l.unitPriceCents),
    gctTreatment: l.gctTreatment,
    assemblyId: l.assemblyId,
    assemblyName: l.assemblyName,
    assemblyUnit: l.assemblyUnit,
    assemblyComponents: l.assemblyComponents,
  };
}

/**
 * Reconstructs the flat, ordered line list from an existing document: each
 * section's lines first (in the section order the API returned, i.e.
 * first-appearance order), then any legacy ungrouped lines (pre-dating
 * per-line headings) with their heading set from their own category.
 */
export function linesFromInitial(initial?: InitialLines): DraftLine[] {
  const fromSections = (initial?.sections ?? []).flatMap((s) => {
    const heading = headingFromSectionTitle(s.title);
    return s.lines.map((l) => draftLineFromInitial(l, heading));
  });
  const fromUngrouped = (initial?.lines ?? []).map((l) =>
    draftLineFromInitial(l, { kind: "category", category: l.category }),
  );
  const all = [...fromSections, ...fromUngrouped];
  return all.length > 0 ? all : [newLine()];
}

/** Seeds the custom-heading list (for the dropdown) from any non-category
 * section titles on the existing document, in first-appearance order. */
export function customHeadingsFromInitial(initial?: InitialLines): string[] {
  const titles = (initial?.sections ?? [])
    .map((s) => s.title)
    .filter((title) => !categoryForLabel(title));
  return Array.from(new Set(titles));
}

/**
 * Applies an edit to one line.
 *
 * Hand-editing the description breaks the link to whichever favourite
 * populated this line — otherwise ★ Save would silently update that
 * favourite's price using this line's now-diverged text as if nothing had
 * changed (see the builders' saveFavourite identity match).
 */
export function patchLine(lines: DraftLine[], key: string, p: Partial<DraftLine>): DraftLine[] {
  return lines.map((l) => {
    if (l.key !== key) return l;
    const editedDescription =
      "description" in p && p.description !== l.description && l.materialFavouriteId;
    return { ...l, ...p, ...(editedDescription ? { materialFavouriteId: undefined } : {}) };
  });
}

/** Removing the last line would leave nothing to type into, so the final row
 * stays put and the user clears its fields instead. */
export function removeLineByKey(lines: DraftLine[], key: string): DraftLine[] {
  return lines.length > 1 ? lines.filter((l) => l.key !== key) : lines;
}

/** Lines the document is willing to save — a blank row the user never filled
 * in is dropped rather than rejected. */
export function savableLines(lines: DraftLine[]): DraftLine[] {
  return lines.filter((l) => l.description.trim() && Number(l.quantity) > 0);
}

export interface HeadingSection {
  title: string;
  /** The heading's first-appearance position across the ordered line list. */
  sort: number;
  lines: DraftLine[];
}

/** Every heading becomes a section, ordered by the heading's first-appearance
 * position across the (ordered) line list. Two lines under the same heading
 * land in one section however far apart they sit in the list. */
export function groupLinesIntoSections(lines: DraftLine[]): HeadingSection[] {
  const order: string[] = [];
  const byHeading = new Map<string, { title: string; lines: DraftLine[] }>();
  for (const l of lines) {
    const key = headingToValue(l.heading);
    let group = byHeading.get(key);
    if (!group) {
      group = { title: headingTitle(l.heading), lines: [] };
      byHeading.set(key, group);
      order.push(key);
    }
    group.lines.push(l);
  }
  return order.map((key, sort) => {
    const group = byHeading.get(key)!;
    return { title: group.title, sort, lines: group.lines };
  });
}

export interface SelectOption {
  value: string;
  label: string;
}

/**
 * The options for a line's "Sold by" cell, built from the tenant's MaterialUnit
 * vocabulary.
 *
 * The stored value is the unit's LABEL rather than its id, because `unitLabel`
 * is a snapshot the document keeps even if the unit is later renamed or
 * deleted — so a line carrying a label the current vocabulary no longer has
 * keeps an option of its own rather than silently blanking to the fallback.
 */
/**
 * Every unit a line could be measured in, in ONE list.
 *
 * A quote or invoice carries both kinds of line, so splitting these into two
 * mutually exclusive pickers was wrong in both directions: with only the
 * material vocabulary a labour line could not be set to "day", and with only
 * the time vocabulary a bag of cement printed as "unit".
 *
 * The two are stored differently — rateUnit is an enum column, unitLabel a
 * free-text snapshot — so `unitValue`/`applyUnitChoice` below route the
 * chosen option to the right field. The contractor just picks a unit.
 */
export function unitOptions(
  line: Pick<DraftLine, "rateUnit" | "unitLabel">,
  units: readonly { label: string; custom?: boolean }[],
): SelectOption[] {
  const snapshot = line.unitLabel?.trim();
  // A snapshot the vocabulary no longer offers (renamed or deleted since) keeps
  // its own option rather than silently blanking a sent document's unit.
  const orphaned = !!snapshot && !units.some((u) => u.label === snapshot);
  return [
    ...Object.values(RateUnit).map((v) => ({
      value: `${RATE_UNIT_PREFIX}${v}`,
      label: RATE_UNIT_LABEL[v],
    })),
    ...(orphaned && snapshot ? [{ value: snapshot, label: snapshot }] : []),
    ...units.map((u) => ({ value: u.label, label: u.custom ? `${u.label} (yours)` : u.label })),
    { value: ADD_NEW_OPTION_VALUE, label: "+ Add new unit…" },
  ];
}

/** Marks the time-vocabulary options so they cannot collide with a material
 * unit a contractor happened to name "Day". */
export const RATE_UNIT_PREFIX = "rate:";

/** What the picker should show as selected: the sold-by snapshot when set,
 * otherwise the line's rate unit. */
export function unitValue(line: Pick<DraftLine, "rateUnit" | "unitLabel">): string {
  return line.unitLabel?.trim() || `${RATE_UNIT_PREFIX}${line.rateUnit}`;
}

/**
 * Turns a picked option back into the fields it belongs in. Choosing a time
 * unit CLEARS unitLabel — otherwise a line switched from "bag" to "day" would
 * keep printing "bag", since unitLabel wins on the document.
 */
export function applyUnitChoice(value: string): Partial<DraftLine> {
  if (value.startsWith(RATE_UNIT_PREFIX)) {
    return { rateUnit: value.slice(RATE_UNIT_PREFIX.length) as RateUnit, unitLabel: undefined };
  }
  return { unitLabel: value };
}

/** A draft line as the API takes it. A custom heading has no category of its
 * own, so it is sent as OTHER — the heading survives as the section title. */
export function lineToLineInput(l: DraftLine): NewQuoteLineInput {
  return {
    category: l.heading.kind === "category" ? l.heading.category : LineCategory.OTHER,
    description: l.description.trim(),
    quantity: Number(l.quantity),
    rateUnit: l.rateUnit,
    ...(l.unitLabel ? { unitLabel: l.unitLabel } : {}),
    unitPriceCents: toCents(l.unitPriceDollars),
    gctTreatment: l.gctTreatment,
    // Assembly provenance rides along only for job-type lines; a plain line
    // omits all of these entirely.
    ...(l.assemblyId
      ? {
          assemblyId: l.assemblyId,
          assemblyName: l.assemblyName,
          assemblyUnit: l.assemblyUnit,
          assemblyComponents: l.assemblyComponents,
        }
      : {}),
  };
}

/** The same line for the invoice write path, which additionally orders lines
 * within their section by an explicit `sort` rather than by array position.
 * The rest of the shape is identical — the API validates an invoice line
 * against the quote line schema (invoiceLineItemInputSchema extends it), so
 * `unitLabel` reaches an invoice exactly as it reaches a quote. */
export function lineToInvoiceLineInput(l: DraftLine, sort: number): InvoiceLineItemInput {
  return { ...lineToLineInput(l), sort };
}

// --- Coverage (measured quantity -> sell-unit quantity) --------------------
//
// A contractor measures a job in one unit (40 m² of wall) and buys in
// another (boxes of tile) — packages/core's coverage.ts does that
// conversion. What lives here is purely: does THIS line's picked material
// have coverage configured, and if so, what does a typed measured quantity
// turn into. The measured quantity itself is NOT part of DraftLine — see
// LineItemsEditor, which keeps it as local per-line editor state — so
// nothing here reads or writes it directly; callers pass it in as plain text.

/** A picked material's coverage setup. Both a measure unit and a positive
 * coveragePerSellUnit are required — coverage with no measure unit is an
 * unlabelled number (see MaterialForm's Coverage group), so a material
 * missing either is treated the same as one with no coverage configured. */
export interface CoverageConfig {
  measureUnit: string;
  coveragePerSellUnit: number;
  wastePct?: number;
}

/** Reads a coverage config off a material favourite, or null when it has
 * none configured (the normal case) or only half-configured one. */
export function coverageConfigFromFavourite(
  fav: Pick<MaterialFavourite, "measureUnit" | "coveragePerSellUnit" | "wastePct"> | undefined,
): CoverageConfig | null {
  const measureUnit = fav?.measureUnit?.trim();
  if (!fav || !measureUnit || !fav.coveragePerSellUnit || fav.coveragePerSellUnit <= 0) return null;
  return { measureUnit, coveragePerSellUnit: fav.coveragePerSellUnit, wastePct: fav.wastePct };
}

/** A line's coverage config, looked up from the favourites list by
 * materialFavouriteId rather than stored on DraftLine itself — the config
 * belongs to the material, not the line, and a line whose description has
 * been hand-edited since picking (which clears materialFavouriteId — see
 * patchLine) no longer reliably represents that material. */
export function coverageConfigForLine(
  line: Pick<DraftLine, "materialFavouriteId">,
  favourites: readonly MaterialFavourite[],
): CoverageConfig | null {
  if (!line.materialFavouriteId) return null;
  return coverageConfigFromFavourite(favourites.find((f) => f.id === line.materialFavouriteId));
}

/** Trims float noise (44.00000000001) without padding a whole number with
 * decimals, for the explanation string below. */
function formatQty(n: number): string {
  return Number(n.toFixed(2)).toString();
}

export interface CoverageComputation {
  /** The line's new SELL-UNIT quantity (e.g. "12" boxes) — this is what must
   * land in DraftLine.quantity. See computeCoverageQuantity's own doc for
   * why this is never the measured quantity. */
  quantity: string;
  /** Plain-text working to show under the measured-quantity input, e.g.
   * "40 m² + 10% waste = 44 m² → 12 box". */
  explanation: string;
}

/**
 * Turns a measured-quantity input into the line's sell-unit quantity plus
 * the working to show for it.
 *
 * Returns null for a blank or non-positive measured quantity, so callers
 * leave the line's existing `quantity` untouched rather than stomping a real
 * value with zero the moment the field is cleared.
 *
 * CRITICAL: the returned `quantity` is the SELL-UNIT count (boxes), never
 * the measured quantity (m²) — unitPriceCents is priced per sell unit, and
 * computeTotals multiplies the two directly. A caller that writes the
 * measured quantity into DraftLine.quantity instead would invoice the wrong
 * count entirely (40 boxes instead of 12).
 */
export function computeCoverageQuantity(
  measuredQtyText: string,
  config: CoverageConfig,
  sellUnitLabel: string,
): CoverageComputation | null {
  const measuredQty = Number(measuredQtyText);
  if (!measuredQtyText.trim() || !Number.isFinite(measuredQty) || measuredQty <= 0) return null;
  const result = coverageBreakdown(measuredQty, config.coveragePerSellUnit, config.wastePct);
  if (!result) return null;
  const wastePart = config.wastePct ? ` + ${formatQty(config.wastePct)}% waste` : "";
  const explanation =
    `${formatQty(measuredQty)} ${config.measureUnit}${wastePart} = ` +
    `${formatQty(result.withWasteQty)} ${config.measureUnit} → ${result.sellUnits} ${sellUnitLabel}`;
  return { quantity: String(result.sellUnits), explanation };
}
