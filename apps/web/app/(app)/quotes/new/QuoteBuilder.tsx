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
import { createQuote, updateQuote } from "@/lib/api-client";
import shared from "../../shared.module.css";

const GCT_RATE = 15; // business default; centrally overridable later
const DEFAULT_VALID_DAYS = 30;
const DAY_MS = 86_400_000;

const categoryOptions = Object.values(LineCategory).map((v) => ({ value: v, label: v.charAt(0) + v.slice(1).toLowerCase() }));
const rateUnitOptions = Object.values(RateUnit).map((v) => ({ value: v, label: v.charAt(0) + v.slice(1).toLowerCase() }));
const gctOptions = [
  { value: GctTreatment.STANDARD, label: "Standard" },
  { value: GctTreatment.ZERO_RATED, label: "Zero-rated" },
  { value: GctTreatment.EXEMPT, label: "Exempt" },
];

interface DraftLine {
  key: string;
  category: LineCategory;
  description: string;
  quantity: string;
  rateUnit: RateUnit;
  unitPriceDollars: string;
  gctTreatment: GctTreatment;
}

interface DraftSection {
  key: string;
  title: string;
  lines: DraftLine[];
}

let counter = 0;
function newLine(): DraftLine {
  return {
    key: `l${++counter}`,
    category: LineCategory.MATERIAL,
    description: "",
    quantity: "1",
    rateUnit: RateUnit.UNIT,
    unitPriceDollars: "",
    gctTreatment: GctTreatment.STANDARD,
  };
}

function newSection(): DraftSection {
  return { key: `s${++counter}`, title: "", lines: [newLine()] };
}

const toCents = (dollars: string) => Math.round((Number(dollars) || 0) * 100);
const fromCents = (cents: number) => (cents / 100).toString();

function toLineInput(l: DraftLine) {
  return {
    category: l.category,
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

function draftLineFromInitial(l: InitialQuoteLine): DraftLine {
  return {
    key: `l${++counter}`,
    category: l.category,
    description: l.description,
    quantity: String(l.quantity),
    rateUnit: l.rateUnit,
    unitPriceDollars: fromCents(l.unitPriceCents),
    gctTreatment: l.gctTreatment,
  };
}

function linesFromInitial(initial?: InitialQuote): DraftLine[] {
  if (!initial || initial.lines.length === 0) return [newLine()];
  return initial.lines.map(draftLineFromInitial);
}

function sectionsFromInitial(initial?: InitialQuote): DraftSection[] {
  if (!initial?.sections) return [];
  return initial.sections.map((s) => ({
    key: `s${++counter}`,
    title: s.title,
    lines: s.lines.map(draftLineFromInitial),
  }));
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

/** The editor row markup for one line item — shared by the ungrouped "Line
 * items" block and every section, so the fields never drift apart. */
function LineRows({
  lines,
  onPatch,
  onRemove,
}: {
  lines: DraftLine[];
  onPatch: (key: string, p: Partial<DraftLine>) => void;
  onRemove: (key: string) => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {lines.map((l) => (
        <div
          key={l.key}
          style={{
            display: "grid",
            gridTemplateColumns: "130px 1fr 70px 90px 110px 110px 32px",
            gap: 8,
            alignItems: "end",
            paddingBottom: 12,
            borderBottom: "1px solid var(--jq-border)",
          }}
        >
          <div style={cell}>
            <Select options={categoryOptions} value={l.category} onChange={(e) => onPatch(l.key, { category: e.target.value as LineCategory })} />
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
  const [sections, setSections] = useState<DraftSection[]>(() => sectionsFromInitial(initial));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const allDraftLines = useMemo(
    () => [...lines, ...sections.flatMap((s) => s.lines)],
    [lines, sections],
  );

  const totals = useMemo(
    () =>
      computeTotals({
        lines: allDraftLines.map((l) => ({
          quantity: Number(l.quantity) || 0,
          unitPriceCents: toCents(l.unitPriceDollars),
          gctTreatment: l.gctTreatment,
        })),
        gctRatePct: GCT_RATE,
        discountPct: Number(discountPct) || 0,
        depositCents: toCents(depositDollars),
      }),
    [allDraftLines, discountPct, depositDollars],
  );

  const patch = (key: string, p: Partial<DraftLine>) =>
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...p } : l)));
  const removeLine = (key: string) =>
    setLines((ls) => (ls.length > 1 ? ls.filter((x) => x.key !== key) : ls));

  const addSection = () => setSections((ss) => [...ss, newSection()]);
  const removeSection = (key: string) => setSections((ss) => ss.filter((s) => s.key !== key));
  const patchSectionTitle = (key: string, title: string) =>
    setSections((ss) => ss.map((s) => (s.key === key ? { ...s, title } : s)));
  const addSectionLine = (key: string) =>
    setSections((ss) => ss.map((s) => (s.key === key ? { ...s, lines: [...s.lines, newLine()] } : s)));
  const patchSectionLine = (sectionKey: string, lineKey: string, p: Partial<DraftLine>) =>
    setSections((ss) =>
      ss.map((s) =>
        s.key === sectionKey
          ? { ...s, lines: s.lines.map((l) => (l.key === lineKey ? { ...l, ...p } : l)) }
          : s,
      ),
    );
  const removeSectionLine = (sectionKey: string, lineKey: string) =>
    setSections((ss) =>
      ss.map((s) =>
        s.key === sectionKey && s.lines.length > 1
          ? { ...s, lines: s.lines.filter((l) => l.key !== lineKey) }
          : s,
      ),
    );

  async function save() {
    const validLines = lines.filter((l) => l.description.trim() && Number(l.quantity) > 0);
    const validSections = sections
      .map((s) => ({
        title: s.title.trim(),
        lines: s.lines.filter((l) => l.description.trim() && Number(l.quantity) > 0),
      }))
      .filter((s) => s.title && s.lines.length > 0);

    const lineCount = validLines.length + validSections.reduce((n, s) => n + s.lines.length, 0);
    if (lineCount === 0) return setError("Add at least one line item with a description and quantity.");

    setSaving(true);
    setError("");
    const days = Number(validDays) || DEFAULT_VALID_DAYS;
    const payload = {
      clientId: clientId || undefined,
      jobId: jobId || undefined,
      gctRatePct: GCT_RATE,
      discountPct: Number(discountPct) || 0,
      depositCents: toCents(depositDollars),
      validUntil: new Date(Date.now() + days * DAY_MS).toISOString(),
      lineItems: validLines.map(toLineInput),
      sections: validSections.map((s) => ({ title: s.title, lineItems: s.lines.map(toLineInput) })),
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
          <LineRows lines={lines} onPatch={patch} onRemove={removeLine} />
        </Card>
      </section>

      <section className={shared.section}>
        <div className={shared.sectionHead}>
          <h2 className={shared.sectionTitle}>Sections</h2>
          <Button variant="outlineAccent" size="sm" onClick={addSection}>
            + Add section
          </Button>
        </div>
        {sections.map((s) => (
          <Card key={s.key}>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ display: "flex", gap: 8, alignItems: "end" }}>
                <div style={{ flex: 1 }}>
                  <Input
                    label="Section title"
                    placeholder="e.g. Transportation, Miscellaneous"
                    value={s.title}
                    onChange={(e) => patchSectionTitle(s.key, e.target.value)}
                  />
                </div>
                <Button variant="danger" size="sm" onClick={() => removeSection(s.key)}>
                  Remove section
                </Button>
              </div>
              <LineRows
                lines={s.lines}
                onPatch={(lineKey, p) => patchSectionLine(s.key, lineKey, p)}
                onRemove={(lineKey) => removeSectionLine(s.key, lineKey)}
              />
              <div>
                <Button variant="outlineAccent" size="sm" onClick={() => addSectionLine(s.key)}>
                  + Add line
                </Button>
              </div>
            </div>
          </Card>
        ))}
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
