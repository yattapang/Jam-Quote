"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { computeTotals, GctTreatment, LineCategory, QuoteDetailLevel, RateUnit } from "@jamquote/core";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import MoneyText from "@/components/ui/MoneyText";
import { CATEGORY_LABEL } from "@/lib/quote-totals";
import { updateInvoice, ApiError, type InvoiceLineItemInput } from "@/lib/api-client";
import type { QuoteLineAssemblyComponent } from "@/lib/types";
import shared from "../../../shared.module.css";
// Reused as-is from the quote builder — the per-line grid/mobile-stack rules
// aren't quote-specific, so this avoids re-authoring the same CSS.
import styles from "../../../quotes/new/QuoteBuilder.module.css";

const DEFAULT_GCT_RATE = 15; // fallback only — real rate comes from the invoice's own gctRatePct prop
const ADD_HEADING_VALUE = "__add_heading__";

const rateUnitOptions = Object.values(RateUnit).map((v) => ({ value: v, label: v.charAt(0) + v.slice(1).toLowerCase() }));
const gctOptions = [
  { value: GctTreatment.STANDARD, label: "Standard" },
  { value: GctTreatment.ZERO_RATED, label: "Zero-rated" },
  { value: GctTreatment.EXEMPT, label: "Exempt" },
];
const categoryHeadingOptions = Object.values(LineCategory).map((c) => ({
  value: `cat:${c}`,
  label: CATEGORY_LABEL[c],
}));

/** A line's heading is either a built-in category or a custom title — same
 * concept as the quote builder's `Heading` (see QuoteBuilder.tsx). Kept as a
 * separate, self-contained copy here rather than importing that file's
 * (unexported) heading helpers, since the two builders otherwise share very
 * little beyond this small piece of UI logic. */
type Heading = { kind: "category"; category: LineCategory } | { kind: "custom"; title: string };

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
function categoryForLabel(label: string): LineCategory | undefined {
  return (Object.entries(CATEGORY_LABEL) as [LineCategory, string][]).find(([, l]) => l === label)?.[0];
}
function headingFromSectionTitle(title: string): Heading {
  const category = categoryForLabel(title);
  return category ? { kind: "category", category } : { kind: "custom", title };
}

const toCents = (dollars: string) => Math.round((Number(dollars) || 0) * 100);
const fromCents = (cents: number) => (cents / 100).toString();

interface DraftLine {
  key: string;
  heading: Heading;
  description: string;
  quantity: string;
  rateUnit: RateUnit;
  unitPriceDollars: string;
  gctTreatment: GctTreatment;
  /** Carried through untouched from a job-type ("assembly") line the quote
   * had before conversion — the invoice editor doesn't offer re-picking a
   * job type, but existing breakdown snapshots must round-trip on save. */
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

function toLineInput(l: DraftLine, sort: number): InvoiceLineItemInput {
  return {
    category: l.heading.kind === "category" ? l.heading.category : LineCategory.OTHER,
    description: l.description.trim(),
    quantity: Number(l.quantity),
    rateUnit: l.rateUnit,
    unitPriceCents: toCents(l.unitPriceDollars),
    gctTreatment: l.gctTreatment,
    sort,
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

export interface InitialInvoiceLine {
  category: LineCategory;
  description: string;
  quantity: number;
  rateUnit: RateUnit;
  unitPriceCents: number;
  gctTreatment: GctTreatment;
  assemblyId?: string;
  assemblyName?: string;
  assemblyUnit?: string;
  assemblyComponents?: QuoteLineAssemblyComponent[];
}
export interface InitialInvoiceSection {
  title: string;
  lines: InitialInvoiceLine[];
}
export interface InitialInvoice {
  dueDate?: string; // yyyy-mm-dd, for the date input
  terms?: string;
  gctRatePct: number;
  discountPct: number;
  depositCents: number;
  detailLevel?: QuoteDetailLevel;
  lines: InitialInvoiceLine[];
  sections?: InitialInvoiceSection[];
}

function draftLineFromInitial(l: InitialInvoiceLine, heading: Heading): DraftLine {
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

/** Reconstructs the flat, ordered line list from the existing invoice: each
 * section's lines first (API order = first-appearance order), then any
 * ungrouped lines with their heading set from their own category. Mirrors
 * QuoteBuilder's `linesFromInitial`. */
function linesFromInitial(initial: InitialInvoice): DraftLine[] {
  const fromSections = (initial.sections ?? []).flatMap((s) => {
    const heading = headingFromSectionTitle(s.title);
    return s.lines.map((l) => draftLineFromInitial(l, heading));
  });
  const fromUngrouped = (initial.lines ?? []).map((l) =>
    draftLineFromInitial(l, { kind: "category", category: l.category }),
  );
  const all = [...fromSections, ...fromUngrouped];
  return all.length > 0 ? all : [newLine()];
}

function customHeadingsFromInitial(initial: InitialInvoice): string[] {
  const titles = (initial.sections ?? []).map((s) => s.title).filter((title) => !categoryForLabel(title));
  return Array.from(new Set(titles));
}

/**
 * Draft invoice editor — edits header fields (due date, terms, GCT/discount/
 * deposit) and the sectioned line-item list, then PATCHes via updateInvoice.
 * Only reachable while the invoice is DRAFT (enforced by the edit page, which
 * redirects otherwise); the API itself also rejects a PATCH once finalized.
 */
export default function InvoiceBuilder({
  invoiceId,
  invoiceNumber,
  initial,
}: {
  invoiceId: string;
  invoiceNumber: string;
  initial: InitialInvoice;
}) {
  const router = useRouter();
  const backHref = `/invoices/${invoiceId}`;

  const [dueDate, setDueDate] = useState(initial.dueDate ?? "");
  const [terms, setTerms] = useState(initial.terms ?? "");
  const [gctRatePct, setGctRatePct] = useState(String(initial.gctRatePct ?? DEFAULT_GCT_RATE));
  const [discountPct, setDiscountPct] = useState(String(initial.discountPct ?? 0));
  const [depositDollars, setDepositDollars] = useState(fromCents(initial.depositCents ?? 0));
  const [detailLevel, setDetailLevel] = useState<QuoteDetailLevel>(initial.detailLevel ?? QuoteDetailLevel.SUMMARY);
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

  const gctRatePctNum = Number(gctRatePct) || 0;
  const totals = useMemo(
    () =>
      computeTotals({
        lines: lines.map((l) => ({
          quantity: Number(l.quantity) || 0,
          unitPriceCents: toCents(l.unitPriceDollars),
          gctTreatment: l.gctTreatment,
        })),
        gctRatePct: gctRatePctNum,
        discountPct: Number(discountPct) || 0,
        depositCents: toCents(depositDollars),
      }),
    [lines, discountPct, depositDollars, gctRatePctNum],
  );

  // The summary/detailed toggle only affects job-type lines, so it's hidden
  // until the invoice has at least one (carried over from the source quote).
  const hasAssemblyLine = lines.some((l) => l.assemblyId);

  const patch = (key: string, p: Partial<DraftLine>) =>
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...p } : l)));
  const removeLine = (key: string) => setLines((ls) => (ls.length > 1 ? ls.filter((x) => x.key !== key) : ls));

  const onHeadingChange = (key: string, value: string) => {
    if (value === ADD_HEADING_VALUE) {
      setAddingHeadingKey(key);
      setNewHeadingText("");
      return;
    }
    patch(key, { heading: valueToHeading(value) });
  };
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
    // first-appearance position across the (ordered) line list — same
    // convention as the quote builder.
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
      return {
        title: group.title,
        sort,
        lineItems: group.lines.map((l, i) => toLineInput(l, i)),
      };
    });

    try {
      await updateInvoice(invoiceId, {
        dueDate: dueDate ? new Date(`${dueDate}T00:00:00.000Z`).toISOString() : undefined,
        terms: terms.trim() || undefined,
        gctRatePct: gctRatePctNum,
        discountPct: Number(discountPct) || 0,
        depositCents: toCents(depositDollars),
        detailLevel,
        lineItems: [],
        sections,
      });
      router.push(`/invoices/${invoiceId}`);
    } catch (err) {
      setError(err instanceof ApiError && err.message ? err.message : "Couldn't save changes — is the API running?");
      setSaving(false);
    }
  }

  return (
    <div className={shared.page}>
      <header className={shared.header}>
        <div className={shared.headings}>
          <span className={shared.eyebrow}>
            <a href={backHref} style={{ color: "inherit" }}>
              ← Invoice
            </a>
          </span>
          <h1 className={shared.title}>Edit invoice {invoiceNumber}</h1>
          <span className={shared.subtitle}>Draft invoice — edit line items and terms before finalizing.</span>
        </div>
      </header>

      <section className={shared.section}>
        <div className={shared.sectionHead}>
          <h2 className={shared.sectionTitle}>Line items</h2>
          <Button variant="outlineAccent" size="sm" onClick={() => setLines((ls) => [...ls, newLine()])}>
            + Add line
          </Button>
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
            <span>Job type detail on invoice:</span>
            <div style={{ maxWidth: 200 }}>
              <Select
                aria-label="Job type detail on invoice"
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
          <div className={styles.linesWrap}>
            {lines.map((l) => (
              <div key={l.key} className={styles.lineRow}>
                <div className={`${styles.fieldCell} ${styles.full}`}>
                  <span className={styles.mobileLabel}>Heading</span>
                  {addingHeadingKey === l.key ? (
                    <Input
                      autoFocus
                      placeholder="New heading name"
                      value={newHeadingText}
                      onChange={(e) => setNewHeadingText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          commitNewHeading(l.key);
                        } else if (e.key === "Escape") {
                          e.preventDefault();
                          cancelNewHeading();
                        }
                      }}
                      onBlur={() => commitNewHeading(l.key)}
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
                  <Input
                    placeholder="Description"
                    value={l.description}
                    onChange={(e) => patch(l.key, { description: e.target.value })}
                  />
                </div>
                <div className={styles.fieldCell}>
                  <span className={styles.mobileLabel}>Qty</span>
                  <Input
                    type="number"
                    placeholder="Qty"
                    value={l.quantity}
                    onChange={(e) => patch(l.key, { quantity: e.target.value })}
                  />
                </div>
                <div className={styles.fieldCell}>
                  <span className={styles.mobileLabel}>Unit</span>
                  <Select
                    options={rateUnitOptions}
                    value={l.rateUnit}
                    onChange={(e) => patch(l.key, { rateUnit: e.target.value as RateUnit })}
                  />
                </div>
                <div className={styles.fieldCell}>
                  <span className={styles.mobileLabel}>Unit price ($)</span>
                  <Input
                    type="number"
                    placeholder="Unit $"
                    value={l.unitPriceDollars}
                    onChange={(e) => patch(l.key, { unitPriceDollars: e.target.value })}
                  />
                </div>
                <div className={styles.fieldCell}>
                  <span className={styles.mobileLabel}>GCT</span>
                  <Select
                    options={gctOptions}
                    value={l.gctTreatment}
                    onChange={(e) => patch(l.key, { gctTreatment: e.target.value as GctTreatment })}
                  />
                </div>
                <div className={styles.actionsCell}>
                  <button type="button" aria-label="Remove line" onClick={() => removeLine(l.key)} className={styles.removeButton}>
                    ×
                  </button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </section>

      <div className={shared.grid2}>
        <Card>
          <div style={{ display: "grid", gap: 12 }}>
            <Input label="Due date" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            <Input
              label="Terms"
              placeholder="e.g. Payment due within 14 days"
              value={terms}
              onChange={(e) => setTerms(e.target.value)}
            />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
              <Input label="GCT %" type="number" value={gctRatePct} onChange={(e) => setGctRatePct(e.target.value)} />
              <Input label="Discount %" type="number" value={discountPct} onChange={(e) => setDiscountPct(e.target.value)} />
              <Input label="Deposit $" type="number" value={depositDollars} onChange={(e) => setDepositDollars(e.target.value)} />
            </div>
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
              <span>GCT ({gctRatePctNum}% on standard)</span>
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
        <Button variant="primary" onClick={save} disabled={saving}>
          {saving ? "Saving…" : "Save changes"}
        </Button>
      </div>
    </div>
  );
}
