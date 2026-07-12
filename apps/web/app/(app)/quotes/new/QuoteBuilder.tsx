"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  computeTotals,
  GctTreatment,
  LineCategory,
  RateUnit,
} from "@jamquote/core";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import MoneyText from "@/components/ui/MoneyText";
import { CATEGORY_LABEL } from "@/lib/quote-totals";
import { createQuote, updateQuote } from "@/lib/api-client";
import shared from "../../shared.module.css";

const GCT_RATE = 15; // business default; centrally overridable later
const DEFAULT_VALID_DAYS = 30;
const DAY_MS = 86_400_000;
const ADD_HEADING_VALUE = "__add_heading__";

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

interface DraftLine {
  key: string;
  heading: Heading;
  description: string;
  quantity: string;
  rateUnit: RateUnit;
  unitPriceDollars: string;
  gctTreatment: GctTreatment;
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
  };
}

export interface InitialQuoteLine {
  category: LineCategory;
  description: string;
  quantity: number;
  rateUnit: RateUnit;
  unitPriceCents: number;
  gctTreatment: GctTreatment;
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

const cell: React.CSSProperties = { minWidth: 0 };

/** The editor row markup for one line item. Each line's Heading cell is
 * either the built-in/custom-heading Select, or — while the user is naming
 * a brand-new heading for that line — an inline text input. */
function LineRows({
  lines,
  headingOptions,
  addingHeadingKey,
  newHeadingText,
  onPatch,
  onRemove,
  onHeadingChange,
  onNewHeadingTextChange,
  onCommitNewHeading,
  onCancelNewHeading,
}: {
  lines: DraftLine[];
  headingOptions: { value: string; label: string }[];
  addingHeadingKey: string | null;
  newHeadingText: string;
  onPatch: (key: string, p: Partial<DraftLine>) => void;
  onRemove: (key: string) => void;
  onHeadingChange: (key: string, value: string) => void;
  onNewHeadingTextChange: (value: string) => void;
  onCommitNewHeading: (key: string) => void;
  onCancelNewHeading: () => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {lines.map((l) => (
        <div
          key={l.key}
          style={{
            display: "grid",
            gridTemplateColumns: "160px 1fr 70px 90px 110px 110px 32px",
            gap: 8,
            alignItems: "end",
            paddingBottom: 12,
            borderBottom: "1px solid var(--jq-border)",
          }}
        >
          <div style={cell}>
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
          <div style={cell}>
            <Input placeholder="Description" value={l.description} onChange={(e) => onPatch(l.key, { description: e.target.value })} />
          </div>
          <div style={cell}>
            <Input type="number" placeholder="Qty" value={l.quantity} onChange={(e) => onPatch(l.key, { quantity: e.target.value })} />
          </div>
          <div style={cell}>
            <Select options={rateUnitOptions} value={l.rateUnit} onChange={(e) => onPatch(l.key, { rateUnit: e.target.value as RateUnit })} />
          </div>
          <div style={cell}>
            <Input type="number" placeholder="Unit $" value={l.unitPriceDollars} onChange={(e) => onPatch(l.key, { unitPriceDollars: e.target.value })} />
          </div>
          <div style={cell}>
            <Select options={gctOptions} value={l.gctTreatment} onChange={(e) => onPatch(l.key, { gctTreatment: e.target.value as GctTreatment })} />
          </div>
          <button
            aria-label="Remove line"
            onClick={() => onRemove(l.key)}
            style={{ height: 38, border: "1px solid var(--jq-border)", background: "var(--jq-surface)", color: "var(--jq-crit)", borderRadius: 8, cursor: "pointer" }}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}

export default function QuoteBuilder({
  clients,
  jobs,
  mode = "create",
  quoteId,
  initial,
}: {
  clients: { id: string; name: string }[];
  jobs: { id: string; name: string }[];
  mode?: "create" | "edit";
  quoteId?: string;
  initial?: InitialQuote;
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
        gctRatePct: GCT_RATE,
        discountPct: Number(discountPct) || 0,
        depositCents: toCents(depositDollars),
      }),
    [lines, discountPct, depositDollars],
  );

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
      gctRatePct: GCT_RATE,
      discountPct: Number(discountPct) || 0,
      depositCents: toCents(depositDollars),
      validUntil: new Date(Date.now() + days * DAY_MS).toISOString(),
      lineItems: [],
      sections,
    };
    try {
      const { id } = isEdit ? await updateQuote(quoteId!, payload) : await createQuote(payload);
      router.push(`/quotes/${id}`);
    } catch {
      setError(isEdit ? "Couldn't save changes — is the API running?" : "Couldn't save the quote — is the API running?");
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
          <span className={shared.subtitle}>Build an itemized estimate — GCT at {GCT_RATE}% on standard lines.</span>
        </div>
      </header>

      <Card>
        <div className={shared.list}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Select
              label="Client"
              options={[{ value: "", label: "Select client…" }, ...clients.map((c) => ({ value: c.id, label: c.name }))]}
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
            />
            <Select
              label="Job (optional)"
              options={[{ value: "", label: "None" }, ...jobs.map((j) => ({ value: j.id, label: j.name }))]}
              value={jobId}
              onChange={(e) => setJobId(e.target.value)}
            />
          </div>
        </div>
      </Card>

      <section className={shared.section}>
        <div className={shared.sectionHead}>
          <h2 className={shared.sectionTitle}>Line items</h2>
          <Button variant="outlineAccent" size="sm" onClick={() => setLines((ls) => [...ls, newLine()])}>
            + Add line
          </Button>
        </div>
        <Card>
          <LineRows
            lines={lines}
            headingOptions={headingOptions}
            addingHeadingKey={addingHeadingKey}
            newHeadingText={newHeadingText}
            onPatch={patch}
            onRemove={removeLine}
            onHeadingChange={onHeadingChange}
            onNewHeadingTextChange={setNewHeadingText}
            onCommitNewHeading={commitNewHeading}
            onCancelNewHeading={cancelNewHeading}
          />
        </Card>
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
              <span>GCT ({GCT_RATE}% on standard)</span>
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

      {error && <div style={{ color: "var(--jq-crit)", fontSize: 13 }}>{error}</div>}
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
        <Button href={backHref} variant="ghost">
          Cancel
        </Button>
        <Button variant="primary" onClick={save}>
          {saving ? "Saving…" : isEdit ? "Save changes" : "Create quote"}
        </Button>
      </div>
    </div>
  );
}
