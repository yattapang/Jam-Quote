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
import { coverageBreakdown, formatJmd, GctTreatment, JobComponentKind, LineCategory, RateUnit } from "@jamquote/core";
import type { InvoiceLineItemInput, NewJobInput, NewQuoteLineInput } from "./api-client";
import { ADD_NEW_OPTION_VALUE } from "./catalog-options";
import { materialLineDescription } from "./material-display";
import { CATEGORY_LABEL, RATE_UNIT_LABEL } from "./quote-totals";
import type { EquipmentItem, Job, LabourRate, MaterialFavourite, QuoteLineJobComponent } from "./types";

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

/**
 * What KIND of thing a line is: which library it comes from, which units make
 * sense for it, and what its saved LineCategory should be.
 *
 * This is deliberately separate from the line's HEADING. Until now the two
 * were the same field — a line's category was derived from whichever heading
 * it sat under, so putting a bag of cement under a custom "Preliminaries"
 * heading silently recorded it as OTHER. Heading is where a line PRINTS on the
 * document; kind is what the line IS. Conflating them meant choosing a
 * document layout also rewrote the data.
 *
 * JOB has no LineCategory of its own — a composite priced service is not a
 * material or a labour rate — so it saves as OTHER and is identified by the
 * jobId it carries. That avoids a database enum migration for a distinction
 * the jobId already makes.
 */
export const LineKind = {
  MATERIAL: "MATERIAL",
  LABOUR: "LABOUR",
  EQUIPMENT: "EQUIPMENT",
  JOB: "JOB",
} as const;
export type LineKind = (typeof LineKind)[keyof typeof LineKind];

export const LINE_KIND_LABEL: Record<LineKind, string> = {
  MATERIAL: "Material",
  LABOUR: "Labour",
  EQUIPMENT: "Equipment",
  JOB: "Job",
};

export const lineKindOptions: SelectOption[] = (Object.keys(LINE_KIND_LABEL) as LineKind[]).map(
  (k) => ({ value: k, label: LINE_KIND_LABEL[k] }),
);

/** The LineCategory a kind saves as. See LineKind's note on JOB. */
export function categoryForKind(kind: LineKind): LineCategory {
  if (kind === LineKind.LABOUR) return LineCategory.LABOUR;
  if (kind === LineKind.EQUIPMENT) return LineCategory.EQUIPMENT;
  if (kind === LineKind.MATERIAL) return LineCategory.MATERIAL;
  return LineCategory.OTHER;
}

/**
 * Kind of a line loaded from a saved document, which has no `kind` column.
 * A jobId is decisive — only a job line carries one — and otherwise the saved
 * category is the best evidence available. Anything unrecognised lands on
 * MATERIAL, the overwhelmingly common case and the one whose picker is most
 * useful to be shown by default.
 */
export function kindFromSaved(category: LineCategory, jobId?: string): LineKind {
  if (jobId) return LineKind.JOB;
  if (category === LineCategory.LABOUR) return LineKind.LABOUR;
  if (category === LineCategory.EQUIPMENT || category === LineCategory.RENTAL) {
    return LineKind.EQUIPMENT;
  }
  return LineKind.MATERIAL;
}

/**
 * Fields to clear when the user switches a line's kind. Everything tying the
 * line to its old library goes: a job's component snapshot must not survive on
 * a line that is now a bag of cement, and a material's id must not survive on
 * a line that is now labour — ★ Save-as-favourite would then update an
 * unrelated material.
 *
 * The description, quantity and price are deliberately KEPT. Someone who typed
 * "Skim coat, 40" and then realised it belongs under Labour should not have to
 * type it again; changing the kind reclassifies the line, it does not reset it.
 */
/** The heading a line starts on for a given kind. JOB has no category of its
 * own, so it lands on OTHER — the same place assemblyLine has always put it. */
export function defaultHeadingForKind(kind: LineKind): Heading {
  return { kind: "category", category: categoryForKind(kind) };
}

/** True when the heading is one of the built-in category headings that some
 * kind defaults to — i.e. the contractor has not chosen it deliberately.
 * A custom heading, or a built-in one no kind defaults to, is left alone. */
export function isDefaultHeadingForSomeKind(h: Heading): boolean {
  if (h.kind !== "category") return false;
  return (Object.values(LineKind) as LineKind[]).some((k) => categoryForKind(k) === h.category);
}

export function applyKindChange(kind: LineKind, currentHeading?: Heading): Partial<DraftLine> {
  return {
    kind,
    // The heading follows the kind, but only while it is still a default one.
    // Kind and heading are genuinely different things — heading is where a
    // line PRINTS — so a contractor who wrote "Site prep" keeps it. But a line
    // left on the default "Materials" heading and then switched to Labour was
    // filing labour under Materials on the customer's document, purely because
    // nothing moved it. Reported on an invoice showing material and labour
    // under one heading.
    // Only when the caller tells us what the heading currently is AND it is
    // still a default. A caller that omits it does not know whether the
    // contractor chose that heading, and not knowing is not a licence to
    // overwrite it.
    ...(currentHeading !== undefined && isDefaultHeadingForSomeKind(currentHeading)
      ? { heading: defaultHeadingForKind(kind) }
      : {}),
    materialFavouriteId: undefined,
    unitLabel: undefined,
    jobId: undefined,
    jobName: undefined,
    jobUnit: undefined,
    jobComponents: undefined,
  };
}

export interface DraftLine {
  key: string;
  /** What the line IS — drives which saved library, units and price it
   * offers. Distinct from `heading`, which is only where it prints. */
  kind: LineKind;
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
   * and stay stable even if the source job later changes. */
  jobId?: string;
  jobName?: string;
  jobUnit?: string;
  jobComponents?: QuoteLineJobComponent[];
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
    kind: LineKind.MATERIAL,
    heading: { kind: "category", category: LineCategory.MATERIAL },
    description: "",
    quantity: "1",
    rateUnit: RateUnit.UNIT,
    unitPriceDollars: "",
    gctTreatment: GctTreatment.STANDARD,
  };
}

/**
 * The fields a picked job sets on a line — shared by `assemblyLine` (builds a
 * brand-new line) and `applyJobPick` (patches a line the kind-first editor
 * already has). `unitLabel` is set to the job's own unit alongside `jobUnit`
 * so the printed quantity ("12 sq ft") and the DETAILED breakdown's "per sq
 * ft" (which reads jobUnit directly — see QuotePdf.tsx) never disagree about
 * what the job is priced per; see `lineUnitLabel` in quote-totals.ts, which
 * prefers unitLabel over the rateUnit fallback.
 */
function jobPatch(
  a: Job,
): Pick<DraftLine, "description" | "unitPriceDollars" | "unitLabel" | "jobId" | "jobName" | "jobUnit" | "jobComponents"> {
  return {
    description: a.name,
    unitPriceDollars: fromCents(a.unitCostCents),
    unitLabel: a.unit,
    jobId: a.id,
    jobName: a.name,
    jobUnit: a.unit,
    jobComponents: a.components.map((c) => ({
      kind: c.kind,
      description: c.description,
      quantityPerUnit: c.quantityPerUnit,
      unitPriceCents: c.unitPriceCents,
    })),
  };
}

/** Builds a draft line from a picked job type: description = job name,
 * unit price = its computed unit cost (editable afterwards), and the component
 * snapshot carried for DETAILED rendering. Job lines default to the OTHER
 * heading — a composite job type isn't a single material/labour category. */
export function assemblyLine(a: Job, quantity: number): DraftLine {
  return {
    key: nextKey(),
    kind: LineKind.JOB,
    heading: { kind: "category", category: LineCategory.OTHER },
    quantity: String(quantity),
    rateUnit: RateUnit.UNIT,
    gctTreatment: GctTreatment.STANDARD,
    ...jobPatch(a),
  };
}

/** Patches an EXISTING line with a picked job — same fields `assemblyLine`
 * sets on a brand-new one, minus `quantity`/`heading`/`kind`, which the
 * kind-first editor already owns (kind via `applyKindChange`; quantity and
 * heading are whatever the contractor already had on the line). Used by the
 * line's "Saved" picker once its kind is JOB. */
export function applyJobPick(a: Job): Partial<DraftLine> {
  return jobPatch(a);
}

/**
 * The fields a picked labour rate sets on a line — shared by `labourLine`
 * (brand-new line) and `applyLabourRatePick` (patches an existing one).
 * Unlike a material, a labour rate genuinely IS denominated in the rateUnit
 * vocabulary (per hour, per day), so its rateUnit is carried across and
 * unitLabel is explicitly cleared — the document then prints "hour", not a
 * sold-by unit left over from whatever this line was before, which would be
 * a lie.
 */
function labourRatePatch(
  r: LabourRate,
): Pick<DraftLine, "description" | "rateUnit" | "unitPriceDollars" | "unitLabel"> {
  return {
    description: r.skillTier ? `${r.trade} — ${r.skillTier}` : r.trade,
    rateUnit: r.rateUnit,
    unitPriceDollars: fromCents(r.rateCents),
    // The rate's own printed unit when it has one ("sq ft"), otherwise
    // explicitly cleared so the cadence prints instead. Clearing matters as
    // much as setting: without it a sold-by unit left over from whatever this
    // line was before would print beside an hourly rate.
    unitLabel: r.unitLabel?.trim() || undefined,
  };
}

/** Builds a draft line from a saved labour rate. */
export function labourLine(r: LabourRate, quantity: number): DraftLine {
  return {
    key: nextKey(),
    kind: LineKind.LABOUR,
    heading: { kind: "category", category: LineCategory.LABOUR },
    quantity: String(quantity),
    gctTreatment: GctTreatment.STANDARD,
    ...labourRatePatch(r),
  };
}

/**
 * The fields a picked equipment item sets on a line. Like a labour rate and
 * unlike a material, equipment is denominated in the rateUnit vocabulary (per
 * day, per week), so unitLabel is cleared rather than set — otherwise a
 * sold-by unit left over from whatever the line was before would print
 * alongside a daily hire rate.
 *
 * The rate is what the contractor CHARGES. For hired kit that is usually the
 * vendor's price, but it stays editable on the line like every other price,
 * because marking it up is the contractor's business and not ours to assume.
 */
export function applyEquipmentPick(
  e: EquipmentItem,
): Pick<DraftLine, "description" | "rateUnit" | "unitPriceDollars" | "unitLabel"> {
  return {
    description: e.name,
    rateUnit: e.rateUnit,
    unitPriceDollars: fromCents(e.rateCents),
    // As for labour: the item's own printed unit ("lift") when set, otherwise
    // cleared so the hire cadence prints.
    unitLabel: e.unitLabel?.trim() || undefined,
  };
}

/** Options for the EQUIPMENT "Saved" picker. Mirrors jobPickerOptions' shape
 * but needs no orphan entry: a line keeps no equipment id, so there is no
 * stale reference to reconstruct. Trailing "+ Add new equipment…" row mirrors
 * unitOptions' own add-new row, using the same shared sentinel so the editor
 * can tell "add one" apart from "picked this id" with one predicate
 * (isAddNewOption) rather than a bespoke string per picker. */
export function equipmentPickerOptions(
  equipment: readonly Pick<EquipmentItem, "id" | "name" | "rateCents" | "rateUnit">[],
): SelectOption[] {
  return [
    { value: "", label: equipment.length > 0 ? "Select equipment…" : "No saved equipment yet" },
    ...equipment.map((e) => ({
      value: e.id,
      label: `${e.name} — ${formatJmd(e.rateCents)}/${RATE_UNIT_LABEL[e.rateUnit]}`,
    })),
    { value: ADD_NEW_OPTION_VALUE, label: "+ Add new equipment…" },
  ];
}

/** Options for the LABOUR "Saved" picker. Same shape as equipmentPickerOptions
 * (this business's labour-rate book plus a trailing "+ Add new…" row) — kept
 * as its own function, rather than building the list inline in the editor, so
 * it is unit-testable without a DOM like every other picker's options here. */
export function labourRatePickerOptions(
  labourRates: readonly Pick<LabourRate, "id" | "trade" | "skillTier" | "rateCents" | "rateUnit">[],
): SelectOption[] {
  return [
    { value: "", label: labourRates.length > 0 ? "Select a saved rate…" : "No saved labour rates yet" },
    ...labourRates.map((r) => ({
      value: r.id,
      label: `${r.skillTier ? `${r.trade} — ${r.skillTier}` : r.trade} — ${formatJmd(r.rateCents)}/${RATE_UNIT_LABEL[r.rateUnit]}`,
    })),
    { value: ADD_NEW_OPTION_VALUE, label: "+ Add new labour rate…" },
  ];
}

/** Patches an EXISTING line with a picked labour rate — same fields
 * `labourLine` sets on a brand-new one, minus `quantity`/`heading`/`kind`.
 * Used by the line's "Saved" picker once its kind is LABOUR. */
export function applyLabourRatePick(r: LabourRate): Partial<DraftLine> {
  return labourRatePatch(r);
}

/**
 * Fields a picked material favourite sets on a line: composed description
 * (name + specs, via materialLineDescription), price, sold-by unit snapshot,
 * and the id ★ Save-as-favourite later matches on. Used by the line's
 * "Saved" picker (and "+ Add material…") once its kind is MATERIAL.
 */
export function materialPickPatch(fav: MaterialFavourite): Partial<DraftLine> {
  return {
    description: materialLineDescription(fav),
    unitPriceDollars: String(fav.priceDollars),
    unitLabel: fav.unit,
    materialFavouriteId: fav.id,
  };
}

/**
 * Options for a JOB line's "Saved" picker. When the line's own jobId no
 * longer matches anything in the current Job Library (deleted since, or a
 * business the caller doesn't have loaded), a synthetic option is added for
 * it — mirroring unitOptions' orphaned-snapshot handling — so a reopened JOB
 * line still shows the job it came from rather than reverting to an empty
 * placeholder that looks like no job was ever picked.
 */
export function jobPickerOptions(
  line: Pick<DraftLine, "jobId" | "jobName">,
  jobs: readonly Pick<Job, "id" | "name" | "unit" | "unitCostCents">[],
): SelectOption[] {
  const known = jobs.some((j) => j.id === line.jobId);
  const orphan: SelectOption[] =
    line.jobId && !known
      ? [{ value: line.jobId, label: `${line.jobName ?? "Job"} (removed from Job Library)` }]
      : [];
  return [
    { value: "", label: jobs.length > 0 ? "Select a job…" : "No saved jobs yet" },
    ...orphan,
    ...jobs.map((a) => ({ value: a.id, label: `${a.name} — ${formatJmd(a.unitCostCents)}/${a.unit}` })),
    { value: ADD_NEW_OPTION_VALUE, label: "+ Add new job…" },
  ];
}

/**
 * A JOB line's own unit ("sq ft") doubles as its printed sold-by label —
 * unlike MATERIAL/LABOUR there is no vocabulary to pick from, just the job's
 * own free-text unit, editable in place. Kept in sync with unitLabel so the
 * quantity line and the DETAILED "per sq ft" breakdown (which reads jobUnit
 * directly) never disagree about what actually prints.
 */
export function applyJobUnitEdit(unit: string): Partial<DraftLine> {
  return { jobUnit: unit, unitLabel: unit.trim() || undefined };
}

/**
 * The three fields behind a line's "+ Add new job…" quick-create — a
 * deliberately small stand-in for the full JobForm (name/unit/markup/
 * component builder). Stacking that whole recipe editor in a modal on top of
 * a half-written quote is too much form for the moment a contractor just
 * wants to price one job on the fly; the full builder stays on the Jobs page
 * for when there's time to break a job into real components.
 */
export interface QuickJobFormValues {
  name: string;
  unit: string;
  rateDollars: string;
}

export const emptyQuickJobForm: QuickJobFormValues = { name: "", unit: "", rateDollars: "" };

/**
 * Builds a create-job payload from the quick-create form.
 *
 * CRITICAL: a job's unitCostCents is COMPUTED server-side from its components
 * (computeJobUnitCostCents in @jamquote/core) — createJobSchema defaults
 * `components` to `[]`, so sending none at all would save the job at $0. A
 * contractor who typed a rate of 1500 would see the job appear normally and
 * only discover the zero once it priced a customer's line at nothing.
 *
 * So the entered rate rides along as a single OTHER component with
 * quantityPerUnit 1 and markupPct 0, which makes computeJobUnitCostCents
 * return exactly the entered rate — see the round-trip test in
 * line-editor.test.ts, which is the point: this must be verified against the
 * same cost formula the API uses, not just assumed. The job this creates then
 * opens on the Jobs page as a normal one-component job, refinable into real
 * material/labour components whenever there's time for that.
 */
export function quickJobPayloadFromValues(values: QuickJobFormValues): NewJobInput {
  const name = values.name.trim();
  return {
    name,
    unit: values.unit.trim(),
    markupPct: 0,
    components: [
      {
        kind: JobComponentKind.OTHER,
        description: name,
        quantityPerUnit: 1,
        unitPriceCents: toCents(values.rateDollars),
      },
    ],
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
  jobId?: string;
  jobName?: string;
  jobUnit?: string;
  jobComponents?: QuoteLineJobComponent[];
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
    // Saved documents predate `kind`, so it is inferred — see kindFromSaved.
    // Reopening an old quote must land every line on a sensible picker rather
    // than blanking the row.
    kind: kindFromSaved(l.category, l.jobId),
    heading,
    description: l.description,
    quantity: String(l.quantity),
    rateUnit: l.rateUnit,
    unitLabel: l.unitLabel,
    unitPriceDollars: fromCents(l.unitPriceCents),
    gctTreatment: l.gctTreatment,
    jobId: l.jobId,
    jobName: l.jobName,
    jobUnit: l.jobUnit,
    jobComponents: l.jobComponents,
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

/**
 * A line the contractor has not started: no description, no price, nothing
 * picked from a library, and the quantity still at its default. The editor
 * always keeps a spare row at the bottom, so discarding these on save is
 * expected and silent.
 */
export function isUntouchedLine(l: DraftLine): boolean {
  return (
    !l.description.trim() &&
    !l.unitPriceDollars.trim() &&
    !l.materialFavouriteId &&
    !l.jobId &&
    !l.unitLabel &&
    (l.quantity === "" || l.quantity === "1")
  );
}

/**
 * Lines the contractor clearly WORKED ON but which savableLines would drop —
 * a price typed with no description, a description with a zero quantity.
 *
 * These used to vanish without a word: save filtered them out, and the only
 * error appeared when NO line survived. Someone who filled in three lines and
 * left one without a description got a saved document with two, discovered on
 * reopening it. From the contractor's side that is indistinguishable from the
 * app losing their work, and on an invoice it is money quietly missing.
 *
 * Callers should refuse to save while this is non-empty and say which line,
 * rather than dropping them.
 */
export function incompleteLines(lines: DraftLine[]): DraftLine[] {
  return lines.filter((l) => {
    if (isUntouchedLine(l)) return false;
    return !(l.description.trim() && Number(l.quantity) > 0);
  });
}

/** Human description of why a worked-on line cannot be saved, for the error
 * banner. Ordinal position because a line the user cannot name still has a
 * place they can count to. */
export function describeIncompleteLine(lines: DraftLine[], line: DraftLine): string {
  const position = lines.indexOf(line) + 1;
  const missing = !line.description.trim()
    ? "needs a description"
    : "needs a quantity above zero";
  return `Line ${position} ${missing}`;
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

/** A draft line as the API takes it. `category` comes from the line's KIND,
 * not its heading: the heading only decides where the line prints, and
 * deriving the category from it meant a bag of cement filed under a custom
 * "Preliminaries" heading was recorded as OTHER. */
export function lineToLineInput(l: DraftLine): NewQuoteLineInput {
  return {
    category: categoryForKind(l.kind),
    description: l.description.trim(),
    quantity: Number(l.quantity),
    rateUnit: l.rateUnit,
    ...(l.unitLabel ? { unitLabel: l.unitLabel } : {}),
    unitPriceCents: toCents(l.unitPriceDollars),
    gctTreatment: l.gctTreatment,
    // Job provenance rides along only for job-type lines; a plain line
    // omits all of these entirely.
    ...(l.jobId
      ? {
          jobId: l.jobId,
          jobName: l.jobName,
          jobUnit: l.jobUnit,
          jobComponents: l.jobComponents,
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
