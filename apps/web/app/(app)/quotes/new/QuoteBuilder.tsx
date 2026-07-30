"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  computeTotals,
  formatJmd,
  GctTreatment,
  LineCategory,
  QuoteDetailLevel,
  RateUnit,
} from "@jamquote/core";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import Modal from "@/components/ui/Modal";
import MoneyText from "@/components/ui/MoneyText";
import { CATEGORY_LABEL } from "@/lib/quote-totals";
import {
  createQuote,
  updateQuote,
  createMaterialFavourite,
  updateMaterialFavourite,
  ApiError,
} from "@/lib/api-client";
import ClientSelectField from "@/components/forms/ClientSelectField";
import JobSelectField from "@/components/forms/JobSelectField";
import MaterialForm, { materialPayloadFromValues, type MaterialFormValues } from "@/components/forms/MaterialForm";
import type { ClientOption, JobOption } from "@/components/forms/types";
import type { Assembly, MaterialFavourite, QuoteLineAssemblyComponent } from "@/lib/types";
import shared from "../../shared.module.css";
import styles from "./QuoteBuilder.module.css";

const DEFAULT_GCT_RATE = 15; // fallback only — real rate comes from the business's gctRatePct prop
const DEFAULT_VALID_DAYS = 30;
const DAY_MS = 86_400_000;
const ADD_HEADING_VALUE = "__add_heading__";
const ADD_MATERIAL_VALUE = "__add_material__";

const rateUnitOptions = Object.values(RateUnit).map((v) => ({ value: v, label: v.charAt(0) + v.slice(1).toLowerCase() }));
const gctOptions = [
  { value: GctTreatment.STANDARD, label: "Standard" },
  { value: GctTreatment.ZERO_RATED, label: "Zero-rated" },
  { value: GctTreatment.EXEMPT, label: "Exempt" },
];
// Built-in category options for the Heading dropdown, labelled the same way
// they'll appear as a section title on the finalized quote (CATEGORY_LABEL).
const categoryHeadingOptions = Object.values(LineCategory).map((c) => ({
  value: `cat:${c}`,
  label: CATEGORY_LABEL[c],
}));

/**
 * A line's heading is either one of the built-in categories or a custom
 * title the user typed in. Built-in headings map straight to `LineCategory`
 * for the API; custom headings still need a valid category, so they're sent
 * as OTHER — grouping on the finalized quote is by heading/section, not by
 * category.
 */
export type Heading = { kind: "category"; category: LineCategory } | { kind: "custom"; title: string };

function headingToValue(h: Heading): string {
  return h.kind === "category" ? `cat:${h.category}` : `custom:${h.title}`;
}
function valueToHeading(value: string): Heading {
  return value.startsWith("custom:")
    ? { kind: "custom", title: value.slice("custom:".length) }
    : { kind: "category", category: value.slice("cat:".length) as LineCategory };
}
function headingTitle(h: Heading): string {
  return h.kind === "category" ? CATEGORY_LABEL[h.category] : h.title;
}
/** Finds the built-in category whose CATEGORY_LABEL matches a section title
 * exactly (e.g. a quote saved with the "Materials" heading) — used to
 * reconstruct a built-in heading from an existing quote's section title. */
function categoryForLabel(label: string): LineCategory | undefined {
  return (Object.entries(CATEGORY_LABEL) as [LineCategory, string][]).find(([, l]) => l === label)?.[0];
}

/** Display label for a saved-materials picker option — name, spec values
 * (if the material has a category with filled-in specs, e.g. "1/2in x
 * 20ft"), unit (if any), and last known price, so contractors can tell
 * variants and stale prices apart at a glance. Materials with no
 * category/specs (the pre-existing shape) render exactly as before:
 * "name (unit) — price". */
function favouriteLabel(f: MaterialFavourite): string {
  const price = `$${f.priceDollars.toLocaleString("en-JM", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const specValues = f.specs ? Object.values(f.specs).filter(Boolean) : [];
  const base = specValues.length > 0 ? `${f.name} ${specValues.join(" x ")}` : f.name;
  const withUnit = f.unit ? `${base} (${f.unit})` : base;
  return `${withUnit} — ${price}`;
}

interface DraftLine {
  key: string;
  heading: Heading;
  description: string;
  quantity: string;
  rateUnit: RateUnit;
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
}

let counter = 0;
function newLine(): DraftLine {
  return {
    key: `l${++counter}`,
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
function assemblyLine(a: Assembly, quantity: number): DraftLine {
  return {
    key: `l${++counter}`,
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

const toCents = (dollars: string) => Math.round((Number(dollars) || 0) * 100);
const fromCents = (cents: number) => (cents / 100).toString();

function toLineInput(l: DraftLine) {
  return {
    category: l.heading.kind === "category" ? l.heading.category : LineCategory.OTHER,
    description: l.description.trim(),
    quantity: Number(l.quantity),
    rateUnit: l.rateUnit,
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

export interface InitialQuoteLine {
  category: LineCategory;
  description: string;
  quantity: number;
  rateUnit: RateUnit;
  unitPriceCents: number;
  gctTreatment: GctTreatment;
  /** Carried through on edit so a job-type line keeps its breakdown snapshot. */
  assemblyId?: string;
  assemblyName?: string;
  assemblyUnit?: string;
  assemblyComponents?: QuoteLineAssemblyComponent[];
}
export interface InitialQuoteSection {
  title: string;
  lines: InitialQuoteLine[];
}
export interface InitialQuote {
  clientId?: string;
  jobId?: string;
  discountPct: number;
  depositCents: number;
  lines: InitialQuoteLine[];
  sections?: InitialQuoteSection[];
  /** Per-quote summary/detailed presentation setting to restore on edit. */
  detailLevel?: QuoteDetailLevel;
  /** Raw ISO timestamps, used only to derive the "valid for N days" default. */
  validUntil?: string;
  createdAt?: string;
}

function draftLineFromInitial(l: InitialQuoteLine, heading: Heading): DraftLine {
  return {
    key: `l${++counter}`,
    heading,
    description: l.description,
    quantity: String(l.quantity),
    rateUnit: l.rateUnit,
    unitPriceDollars: fromCents(l.unitPriceCents),
    gctTreatment: l.gctTreatment,
    assemblyId: l.assemblyId,
    assemblyName: l.assemblyName,
    assemblyUnit: l.assemblyUnit,
    assemblyComponents: l.assemblyComponents,
  };
}

/** A section title round-trips as a built-in heading when it matches a
 * CATEGORY_LABEL exactly (a quote saved with only built-in headings);
 * anything else is a custom heading. */
function headingFromSectionTitle(title: string): Heading {
  const category = categoryForLabel(title);
  return category ? { kind: "category", category } : { kind: "custom", title };
}

/**
 * Reconstructs the flat, ordered line list from an existing quote: each
 * section's lines first (in the section order the API returned, i.e.
 * first-appearance order), then any legacy ungrouped lines (pre-dating
 * per-line headings) with their heading set from their own category.
 */
function linesFromInitial(initial?: InitialQuote): DraftLine[] {
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
 * section titles on the existing quote, in first-appearance order. */
function customHeadingsFromInitial(initial?: InitialQuote): string[] {
  const titles = (initial?.sections ?? [])
    .map((s) => s.title)
    .filter((title) => !categoryForLabel(title));
  return Array.from(new Set(titles));
}

/**
 * Existing quotes store an absolute `validUntil`; the builder shows a
 * relative "valid for N days" field instead. Derive N from the gap between
 * `validUntil` and `createdAt` (or now, for a brand-new quote), rounded to
 * the nearest whole day, falling back to the default when there's no
 * existing validUntil (new quote) or the gap is nonsensical.
 */
function initialValidDays(initial?: InitialQuote): number {
  if (!initial?.validUntil) return DEFAULT_VALID_DAYS;
  const start = initial.createdAt ? new Date(initial.createdAt) : new Date();
  const end = new Date(initial.validUntil);
  const days = Math.round((end.getTime() - start.getTime()) / DAY_MS);
  return days > 0 ? days : DEFAULT_VALID_DAYS;
}

/** The editor row markup for one line item. Each line's Heading cell is
 * either the built-in/custom-heading Select, or — while the user is naming
 * a brand-new heading for that line — an inline text input. Desktop keeps
 * the original fixed multi-column grid (QuoteBuilder.module.css `.lineRow`);
 * at <=767px the same markup reflows into a stacked card with small field
 * labels, so nothing overflows a phone viewport. */
function LineRows({
  lines,
  headingOptions,
  favourites,
  favouriteCategories,
  materialFilters,
  savingFavKey,
  addingHeadingKey,
  newHeadingText,
  addingMaterialKey,
  addingMaterialBusy,
  onPatch,
  onRemove,
  onHeadingChange,
  onNewHeadingTextChange,
  onCommitNewHeading,
  onCancelNewHeading,
  onMaterialFilterChange,
  onPickFavourite,
  onSaveFavourite,
  onOpenAddMaterial,
  onCancelAddMaterial,
  onCreateMaterial,
  onAddMaterialBusyChange,
}: {
  lines: DraftLine[];
  headingOptions: { value: string; label: string }[];
  /** Full saved-materials list (not pre-filtered) — each line filters its own
   * picker options locally from `materialFilters[line.key]`. */
  favourites: MaterialFavourite[];
  /** Distinct categories present across `favourites`, for the per-line
   * category filter dropdown. Empty when no saved material has a category
   * yet, in which case the filter is hidden entirely (backward compatible). */
  favouriteCategories: string[];
  /** Selected category filter per line key ("" / absent = all categories). */
  materialFilters: Record<string, string>;
  savingFavKey: string | null;
  addingHeadingKey: string | null;
  newHeadingText: string;
  addingMaterialKey: string | null;
  addingMaterialBusy: boolean;
  onPatch: (key: string, p: Partial<DraftLine>) => void;
  onRemove: (key: string) => void;
  onHeadingChange: (key: string, value: string) => void;
  onNewHeadingTextChange: (value: string) => void;
  onCommitNewHeading: (key: string) => void;
  onCancelNewHeading: () => void;
  onMaterialFilterChange: (key: string, value: string) => void;
  onPickFavourite: (key: string, favouriteId: string) => void;
  onSaveFavourite: (key: string) => void;
  onOpenAddMaterial: (key: string) => void;
  onCancelAddMaterial: () => void;
  onCreateMaterial: (key: string, values: MaterialFormValues) => Promise<void>;
  onAddMaterialBusyChange: (busy: boolean) => void;
}) {
  return (
    <div className={styles.linesWrap}>
      {lines.map((l) => {
        const materialFilter = materialFilters[l.key] ?? "";
        const lineFavourites = materialFilter ? favourites.filter((f) => f.category === materialFilter) : favourites;
        const favouriteOptions = lineFavourites.map((f) => ({ value: f.id, label: favouriteLabel(f) }));
        return (
        <div key={l.key} className={styles.lineRow}>
          <div className={`${styles.fieldCell} ${styles.full}`}>
            <span className={styles.mobileLabel}>Saved material</span>
            {favouriteCategories.length > 0 && (
              <Select
                aria-label="Filter saved materials by category"
                options={[{ value: "", label: "All categories" }, ...favouriteCategories.map((c) => ({ value: c, label: c }))]}
                value={materialFilter}
                onChange={(e) => onMaterialFilterChange(l.key, e.target.value)}
                style={{ marginBottom: 6 }}
              />
            )}
            <Select
              options={[
                { value: "", label: favouriteOptions.length ? "Saved materials…" : "No saved materials" },
                ...favouriteOptions,
                { value: ADD_MATERIAL_VALUE, label: "+ Add material…" },
              ]}
              value=""
              onChange={(e) => {
                const v = e.target.value;
                if (!v) return;
                if (v === ADD_MATERIAL_VALUE) onOpenAddMaterial(l.key);
                else onPickFavourite(l.key, v);
              }}
            />
          </div>
          <div className={`${styles.fieldCell} ${styles.full}`}>
            <span className={styles.mobileLabel}>Heading</span>
            {addingHeadingKey === l.key ? (
              <Input
                autoFocus
                placeholder="New heading name"
                value={newHeadingText}
                onChange={(e) => onNewHeadingTextChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    onCommitNewHeading(l.key);
                  } else if (e.key === "Escape") {
                    e.preventDefault();
                    onCancelNewHeading();
                  }
                }}
                onBlur={() => onCommitNewHeading(l.key)}
              />
            ) : (
              <Select
                options={headingOptions}
                value={headingToValue(l.heading)}
                onChange={(e) => onHeadingChange(l.key, e.target.value)}
              />
            )}
          </div>
          <div className={`${styles.fieldCell} ${styles.full}`}>
            <span className={styles.mobileLabel}>Description</span>
            <Input placeholder="Description" value={l.description} onChange={(e) => onPatch(l.key, { description: e.target.value })} />
          </div>
          <div className={styles.fieldCell}>
            <span className={styles.mobileLabel}>Qty</span>
            <Input type="number" placeholder="Qty" value={l.quantity} onChange={(e) => onPatch(l.key, { quantity: e.target.value })} />
          </div>
          <div className={styles.fieldCell}>
            <span className={styles.mobileLabel}>Unit</span>
            <Select options={rateUnitOptions} value={l.rateUnit} onChange={(e) => onPatch(l.key, { rateUnit: e.target.value as RateUnit })} />
          </div>
          <div className={styles.fieldCell}>
            <span className={styles.mobileLabel}>Unit price ($)</span>
            <Input type="number" placeholder="Unit $" value={l.unitPriceDollars} onChange={(e) => onPatch(l.key, { unitPriceDollars: e.target.value })} />
          </div>
          <div className={styles.fieldCell}>
            <span className={styles.mobileLabel}>GCT</span>
            <Select options={gctOptions} value={l.gctTreatment} onChange={(e) => onPatch(l.key, { gctTreatment: e.target.value as GctTreatment })} />
          </div>
          <div className={styles.actionsCell}>
            <button
              type="button"
              aria-label="Save as favourite material"
              title="Save this line's description & price for reuse"
              onClick={() => onSaveFavourite(l.key)}
              disabled={savingFavKey === l.key || !l.description.trim() || toCents(l.unitPriceDollars) === 0}
              className={styles.saveFavButton}
            >
              {savingFavKey === l.key ? "…" : "★"}
            </button>
            <button type="button" aria-label="Remove line" onClick={() => onRemove(l.key)} className={styles.removeButton}>
              ×
            </button>
          </div>

          {addingMaterialKey === l.key && (
            <Modal title="Add material" onClose={() => (addingMaterialBusy ? undefined : onCancelAddMaterial())}>
              <MaterialForm
                submitLabel="Add material"
                onCancel={onCancelAddMaterial}
                onSubmit={(values) => onCreateMaterial(l.key, values)}
                onBusyChange={onAddMaterialBusyChange}
              />
            </Modal>
          )}
        </div>
        );
      })}
    </div>
  );
}

export default function QuoteBuilder({
  clients: initialClients,
  jobs: initialJobs,
  favourites: initialFavourites = [],
  assemblies = [],
  mode = "create",
  quoteId,
  initial,
  gctRatePct = DEFAULT_GCT_RATE,
}: {
  clients: ClientOption[];
  jobs: JobOption[];
  /** Saved materials (name + last price) offered as a reuse picker per line. */
  favourites?: MaterialFavourite[];
  /** The business's job-type library, offered via "+ Add job type". Each
   * carries a server-computed unitCostCents and its component snapshot. */
  assemblies?: Assembly[];
  mode?: "create" | "edit";
  quoteId?: string;
  initial?: InitialQuote;
  /** The business's default GCT rate (Business.defaultGctRatePct from
   * getBusiness()) — never hardcoded. Callers should pass the real rate;
   * the default here only covers the case where the business is
   * unavailable (see getBusiness()'s EMPTY_BUSINESS fallback). */
  gctRatePct?: number;
}) {
  const router = useRouter();
  const isEdit = mode === "edit" && !!quoteId;
  const backHref = isEdit ? `/quotes/${quoteId}` : "/quotes";
  const [clientId, setClientId] = useState(initial?.clientId ?? "");
  const [jobId, setJobId] = useState(initial?.jobId ?? "");
  const [discountPct, setDiscountPct] = useState(String(initial?.discountPct ?? 0));
  const [depositDollars, setDepositDollars] = useState(fromCents(initial?.depositCents ?? 0));
  const [validDays, setValidDays] = useState(String(initialValidDays(initial)));
  const [lines, setLines] = useState<DraftLine[]>(() => linesFromInitial(initial));
  const [customHeadings, setCustomHeadings] = useState<string[]>(() => customHeadingsFromInitial(initial));
  const [addingHeadingKey, setAddingHeadingKey] = useState<string | null>(null);
  const [newHeadingText, setNewHeadingText] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  // Set when save() fails with the API's 402 FREE_LIMIT_REACHED response, so
  // the error banner can add an "Upgrade to Pro" link to /settings.
  const [limitReached, setLimitReached] = useState(false);
  // Local copies of the clients/jobs/saved-materials lists — seeded from
  // props, then kept in sync locally when the user creates a new one inline
  // ("+ Add new client…" / "+ Add new job…" / "+ Add material…") so it
  // appears immediately in the picker without navigating away or losing the
  // in-progress quote.
  const [clients, setClients] = useState<ClientOption[]>(initialClients);
  const [jobs, setJobs] = useState<JobOption[]>(initialJobs);
  const [favourites, setFavourites] = useState<MaterialFavourite[]>(initialFavourites);
  const [savingFavKey, setSavingFavKey] = useState<string | null>(null);
  const [favError, setFavError] = useState("");
  const [addingMaterialKey, setAddingMaterialKey] = useState<string | null>(null);
  const [addingMaterialBusy, setAddingMaterialBusy] = useState(false);
  // Per-line saved-material category filter ("" = all categories). Keyed by
  // line key so each line's picker narrows independently.
  const [materialFilters, setMaterialFilters] = useState<Record<string, string>>({});
  // Per-quote presentation setting: SUMMARY (each job-type line as one priced
  // row) vs DETAILED (expand its component snapshot on the quote/PDF). Display
  // only — never affects totals.
  const [detailLevel, setDetailLevel] = useState<QuoteDetailLevel>(
    initial?.detailLevel ?? QuoteDetailLevel.SUMMARY,
  );
  // "+ Add job type" picker: the assembly being previewed and the quantity to
  // add. Null id = the modal is closed.
  const [jobTypeId, setJobTypeId] = useState<string>("");
  const [jobTypeQty, setJobTypeQty] = useState("1");
  const [addingJobType, setAddingJobType] = useState(false);

  /** Distinct categories present across saved materials, for the per-line
   * filter dropdown. Empty (and the filter hidden) until any material has a
   * category — existing businesses with only flat, uncategorized materials
   * see no change here. */
  const favouriteCategories = useMemo(
    () => Array.from(new Set(favourites.map((f) => f.category).filter((c): c is string => !!c))).sort(),
    [favourites],
  );
  const setMaterialFilter = (key: string, value: string) =>
    setMaterialFilters((f) => ({ ...f, [key]: value }));

  /** Fills a line's description + unit price from a picked favourite. Only
   * nudges the heading to Materials when the line is still on its untouched
   * default heading — an already-customized heading is left alone. */
  const pickFavourite = (key: string, favouriteId: string) => {
    const fav = favourites.find((f) => f.id === favouriteId);
    if (!fav) return;
    setLines((ls) =>
      ls.map((l) => {
        if (l.key !== key) return l;
        const isDefaultHeading = l.heading.kind === "category" && l.heading.category === LineCategory.MATERIAL;
        return {
          ...l,
          description: fav.name,
          unitPriceDollars: String(fav.priceDollars),
          heading: isDefaultHeading ? { kind: "category", category: LineCategory.MATERIAL } : l.heading,
        };
      }),
    );
  };

  /** Saves a line as a reusable favourite: last-price behaviour — updates the
   * existing favourite (matched case-insensitively, trimmed) if one exists,
   * otherwise creates a new one. Skips silently if there's nothing meaningful
   * to save (blank description or zero price). */
  const saveFavourite = async (key: string) => {
    const line = lines.find((l) => l.key === key);
    if (!line) return;
    const name = line.description.trim();
    const priceCents = toCents(line.unitPriceDollars);
    if (!name || priceCents === 0) return;

    setSavingFavKey(key);
    setFavError("");
    try {
      const existing = favourites.find((f) => f.name.trim().toLowerCase() === name.toLowerCase());
      if (existing) {
        const updated = await updateMaterialFavourite(existing.id, { priceCents });
        setFavourites((favs) => favs.map((f) => (f.id === existing.id ? updated : f)));
      } else {
        const created = await createMaterialFavourite({ name, priceCents });
        setFavourites((favs) => [...favs, created]);
      }
    } catch {
      setFavError("Couldn't save the material — is the API running?");
    } finally {
      setSavingFavKey(null);
    }
  };

  /** "+ Add material…" from a line's saved-materials picker: creates a new
   * favourite, appends it to the local list, and applies its name/price to
   * the line that opened the modal — all without navigating away. */
  const createMaterialForLine = async (key: string, values: MaterialFormValues) => {
    const created = await createMaterialFavourite(materialPayloadFromValues(values));
    setFavourites((favs) => [...favs, created]);
    setLines((ls) =>
      ls.map((l) => (l.key === key ? { ...l, description: created.name, unitPriceDollars: String(created.priceDollars) } : l)),
    );
    setAddingMaterialKey(null);
  };

  const selectedAssembly = assemblies.find((a) => a.id === jobTypeId);

  const openJobTypePicker = () => {
    setJobTypeId(assemblies[0]?.id ?? "");
    setJobTypeQty("1");
    setAddingJobType(true);
  };
  /** Drops the picked job type onto the quote as a new line, pre-filled from
   * the assembly's computed unit cost (still editable) and carrying its
   * component snapshot for DETAILED rendering. */
  const confirmAddJobType = () => {
    if (!selectedAssembly) return;
    const qty = Number(jobTypeQty) > 0 ? Number(jobTypeQty) : 1;
    setLines((ls) => [...ls, assemblyLine(selectedAssembly, qty)]);
    setAddingJobType(false);
  };

  const headingOptions = useMemo(
    () => [
      ...categoryHeadingOptions,
      ...customHeadings.map((title) => ({ value: `custom:${title}`, label: title })),
      { value: ADD_HEADING_VALUE, label: "+ Add heading…" },
    ],
    [customHeadings],
  );

  const totals = useMemo(
    () =>
      computeTotals({
        lines: lines.map((l) => ({
          quantity: Number(l.quantity) || 0,
          unitPriceCents: toCents(l.unitPriceDollars),
          gctTreatment: l.gctTreatment,
        })),
        gctRatePct,
        discountPct: Number(discountPct) || 0,
        depositCents: toCents(depositDollars),
      }),
    [lines, discountPct, depositDollars, gctRatePct],
  );

  // Drives whether the summary/detailed toggle is offered — the setting only
  // affects job-type lines, so it's hidden until the quote has at least one.
  const hasAssemblyLine = lines.some((l) => l.assemblyId);

  const patch = (key: string, p: Partial<DraftLine>) =>
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...p } : l)));
  const removeLine = (key: string) =>
    setLines((ls) => (ls.length > 1 ? ls.filter((x) => x.key !== key) : ls));

  const onHeadingChange = (key: string, value: string) => {
    if (value === ADD_HEADING_VALUE) {
      setAddingHeadingKey(key);
      setNewHeadingText("");
      return;
    }
    patch(key, { heading: valueToHeading(value) });
  };
  /** Confirms the inline "new heading" input (Enter, or blur to also cover
   * clicking away): adds the title to the quote's custom-heading list (once)
   * and selects it on the line that triggered "+ Add heading…". An empty
   * name is treated as a no-op cancel. */
  const commitNewHeading = (key: string) => {
    const title = newHeadingText.trim();
    setAddingHeadingKey(null);
    setNewHeadingText("");
    if (!title) return;
    setCustomHeadings((hs) => (hs.includes(title) ? hs : [...hs, title]));
    patch(key, { heading: { kind: "custom", title } });
  };
  const cancelNewHeading = () => {
    setAddingHeadingKey(null);
    setNewHeadingText("");
  };

  async function save() {
    const validLines = lines.filter((l) => l.description.trim() && Number(l.quantity) > 0);
    if (validLines.length === 0) return setError("Add at least one line item with a description and quantity.");

    setSaving(true);
    setError("");
    setLimitReached(false);

    // Every heading becomes a section, ordered by the heading's
    // first-appearance position across the (ordered) line list.
    const order: string[] = [];
    const byHeading = new Map<string, { title: string; lines: DraftLine[] }>();
    for (const l of validLines) {
      const key = headingToValue(l.heading);
      let group = byHeading.get(key);
      if (!group) {
        group = { title: headingTitle(l.heading), lines: [] };
        byHeading.set(key, group);
        order.push(key);
      }
      group.lines.push(l);
    }
    const sections = order.map((key, sort) => {
      const group = byHeading.get(key)!;
      return { title: group.title, sort, lineItems: group.lines.map(toLineInput) };
    });

    const days = Number(validDays) || DEFAULT_VALID_DAYS;
    const payload = {
      clientId: clientId || undefined,
      jobId: jobId || undefined,
      gctRatePct,
      discountPct: Number(discountPct) || 0,
      depositCents: toCents(depositDollars),
      validUntil: new Date(Date.now() + days * DAY_MS).toISOString(),
      detailLevel,
      lineItems: [],
      sections,
    };
    try {
      const { id } = isEdit ? await updateQuote(quoteId!, payload) : await createQuote(payload);
      router.push(`/quotes/${id}`);
    } catch (err) {
      // Free-plan quote limit: the API returns 402 with
      // { message, code: "FREE_LIMIT_REACHED" } — surface its own message
      // (it names the limit) rather than the generic "couldn't save" text.
      if (err instanceof ApiError && err.status === 402) {
        setError(err.body?.message || "You've reached your free plan limit for this month. Upgrade to Pro to keep creating quotes.");
        setLimitReached(err.body?.code === "FREE_LIMIT_REACHED");
      } else {
        setError(isEdit ? "Couldn't save changes — is the API running?" : "Couldn't save the quote — is the API running?");
        setLimitReached(false);
      }
      setSaving(false);
    }
  }

  return (
    <div className={shared.page}>
      <header className={shared.header}>
        <div className={shared.headings}>
          <span className={shared.eyebrow}>
            <a href={backHref} style={{ color: "inherit" }}>
              ← {isEdit ? "Quote" : "Quotes"}
            </a>
          </span>
          <h1 className={shared.title}>{isEdit ? "Edit quote" : "New quote"}</h1>
          <span className={shared.subtitle}>Build an itemized estimate — GCT at {gctRatePct}% on standard lines.</span>
        </div>
      </header>

      <Card>
        <div className={shared.list}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <ClientSelectField clients={clients} value={clientId} onChange={setClientId} onCreated={(c) => setClients((cs) => [...cs, c])} />
            <JobSelectField
              jobs={jobs}
              clients={clients}
              value={jobId}
              onChange={setJobId}
              onCreated={(j) => setJobs((js) => [...js, j])}
              onClientCreated={(c) => setClients((cs) => [...cs, c])}
            />
          </div>
        </div>
      </Card>

      <section className={shared.section}>
        <div className={shared.sectionHead}>
          <h2 className={shared.sectionTitle}>Line items</h2>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <Button variant="outlineAccent" size="sm" onClick={() => setLines((ls) => [...ls, newLine()])}>
              + Add line
            </Button>
            <Button
              variant="outlineAccent"
              size="sm"
              onClick={openJobTypePicker}
              disabled={assemblies.length === 0}
              title={assemblies.length === 0 ? "Create a job type first (Job types in the sidebar)" : "Add a saved job type as a line"}
            >
              + Add job type
            </Button>
          </div>
        </div>
        {hasAssemblyLine && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              margin: "0 0 10px",
              fontSize: 13,
              color: "var(--jq-text-muted)",
            }}
          >
            <span>Job type detail on quote:</span>
            <div style={{ maxWidth: 200 }}>
              <Select
                aria-label="Job type detail on quote"
                options={[
                  { value: QuoteDetailLevel.SUMMARY, label: "Summary (one line each)" },
                  { value: QuoteDetailLevel.DETAILED, label: "Detailed (show breakdown)" },
                ]}
                value={detailLevel}
                onChange={(e) => setDetailLevel(e.target.value as QuoteDetailLevel)}
              />
            </div>
          </div>
        )}
        <Card>
          <LineRows
            lines={lines}
            headingOptions={headingOptions}
            favourites={favourites}
            favouriteCategories={favouriteCategories}
            materialFilters={materialFilters}
            savingFavKey={savingFavKey}
            addingHeadingKey={addingHeadingKey}
            newHeadingText={newHeadingText}
            addingMaterialKey={addingMaterialKey}
            addingMaterialBusy={addingMaterialBusy}
            onPatch={patch}
            onRemove={removeLine}
            onHeadingChange={onHeadingChange}
            onNewHeadingTextChange={setNewHeadingText}
            onCommitNewHeading={commitNewHeading}
            onCancelNewHeading={cancelNewHeading}
            onMaterialFilterChange={setMaterialFilter}
            onPickFavourite={pickFavourite}
            onSaveFavourite={saveFavourite}
            onOpenAddMaterial={setAddingMaterialKey}
            onCancelAddMaterial={() => setAddingMaterialKey(null)}
            onCreateMaterial={createMaterialForLine}
            onAddMaterialBusyChange={setAddingMaterialBusy}
          />
        </Card>
        {favError && <div style={{ color: "var(--jq-crit)", fontSize: 13 }}>{favError}</div>}
      </section>

      <div className={shared.grid2}>
        <Card>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
            <Input label="Discount %" type="number" value={discountPct} onChange={(e) => setDiscountPct(e.target.value)} />
            <Input label="Deposit $" type="number" value={depositDollars} onChange={(e) => setDepositDollars(e.target.value)} />
            <Input label="Valid for (days)" type="number" min={1} value={validDays} onChange={(e) => setValidDays(e.target.value)} />
          </div>
        </Card>
        <Card>
          <div className={shared.totals}>
            <div className={shared.totalRow}>
              <span>Subtotal</span>
              <MoneyText cents={totals.subtotalCents} weight={600} />
            </div>
            {totals.discountCents > 0 && (
              <div className={shared.totalRowMuted}>
                <span>Discount</span>
                <MoneyText cents={-totals.discountCents} tone="muted" weight={600} />
              </div>
            )}
            <div className={shared.totalRowMuted}>
              <span>GCT ({gctRatePct}% on standard)</span>
              <MoneyText cents={totals.gctCents} tone="muted" weight={600} />
            </div>
            <div className={shared.totalRowGrand}>
              <span>Total</span>
              <MoneyText cents={totals.totalCents} tone="accent" />
            </div>
            {totals.depositCents > 0 && (
              <div className={shared.totalRow}>
                <span>Balance due</span>
                <MoneyText cents={totals.balanceDueCents} weight={700} />
              </div>
            )}
          </div>
        </Card>
      </div>

      {error && (
        <div style={{ color: "var(--jq-crit)", fontSize: 13 }}>
          {error}
          {limitReached && (
            <>
              {" "}
              <Link href="/settings" style={{ color: "inherit", textDecoration: "underline", fontWeight: 600 }}>
                Upgrade to Pro
              </Link>
            </>
          )}
        </div>
      )}
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
        <Button href={backHref} variant="ghost">
          Cancel
        </Button>
        <Button variant="primary" onClick={save}>
          {saving ? "Saving…" : isEdit ? "Save changes" : "Create quote"}
        </Button>
      </div>

      {addingJobType && (
        <Modal title="Add job type" onClose={() => setAddingJobType(false)}>
          <div style={{ display: "grid", gap: 12 }}>
            <Select
              label="Job type"
              options={assemblies.map((a) => ({
                value: a.id,
                label: `${a.name} — ${formatJmd(a.unitCostCents)}/${a.unit}`,
              }))}
              value={jobTypeId}
              onChange={(e) => setJobTypeId(e.target.value)}
            />
            <Input
              label="Quantity"
              type="number"
              min={0}
              step="any"
              value={jobTypeQty}
              onChange={(e) => setJobTypeQty(e.target.value)}
              hint={selectedAssembly ? `Priced per ${selectedAssembly.unit}` : undefined}
            />
            {selectedAssembly && (
              <div className={shared.totalRow} style={{ fontSize: 14 }}>
                <span>Line total (editable after adding)</span>
                <MoneyText
                  cents={Math.round((Number(jobTypeQty) || 0) * selectedAssembly.unitCostCents)}
                  weight={700}
                />
              </div>
            )}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 4 }}>
              <Button variant="ghost" onClick={() => setAddingJobType(false)}>
                Cancel
              </Button>
              <Button variant="primary" onClick={confirmAddJobType} disabled={!selectedAssembly}>
                Add to quote
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
