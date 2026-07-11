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
import { createQuote } from "@/lib/api-client";
import shared from "../../shared.module.css";

const GCT_RATE = 15; // business default; centrally overridable later

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

const toCents = (dollars: string) => Math.round((Number(dollars) || 0) * 100);

export default function QuoteBuilder({
  clients,
  jobs,
}: {
  clients: { id: string; name: string }[];
  jobs: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [clientId, setClientId] = useState("");
  const [jobId, setJobId] = useState("");
  const [discountPct, setDiscountPct] = useState("0");
  const [depositDollars, setDepositDollars] = useState("0");
  const [lines, setLines] = useState<DraftLine[]>([newLine()]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

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

  async function save() {
    const valid = lines.filter((l) => l.description.trim() && Number(l.quantity) > 0);
    if (valid.length === 0) return setError("Add at least one line item with a description and quantity.");
    setSaving(true);
    setError("");
    try {
      const { id } = await createQuote({
        clientId: clientId || undefined,
        jobId: jobId || undefined,
        gctRatePct: GCT_RATE,
        discountPct: Number(discountPct) || 0,
        depositCents: toCents(depositDollars),
        lineItems: valid.map((l) => ({
          category: l.category,
          description: l.description.trim(),
          quantity: Number(l.quantity),
          rateUnit: l.rateUnit,
          unitPriceCents: toCents(l.unitPriceDollars),
          gctTreatment: l.gctTreatment,
        })),
      });
      router.push(`/quotes/${id}`);
    } catch {
      setError("Couldn't save the quote — is the API running?");
      setSaving(false);
    }
  }

  const cell: React.CSSProperties = { minWidth: 0 };

  return (
    <div className={shared.page}>
      <header className={shared.header}>
        <div className={shared.headings}>
          <span className={shared.eyebrow}>
            <a href="/quotes" style={{ color: "inherit" }}>
              ← Quotes
            </a>
          </span>
          <h1 className={shared.title}>New quote</h1>
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
                  <Select options={categoryOptions} value={l.category} onChange={(e) => patch(l.key, { category: e.target.value as LineCategory })} />
                </div>
                <div style={cell}>
                  <Input placeholder="Description" value={l.description} onChange={(e) => patch(l.key, { description: e.target.value })} />
                </div>
                <div style={cell}>
                  <Input type="number" placeholder="Qty" value={l.quantity} onChange={(e) => patch(l.key, { quantity: e.target.value })} />
                </div>
                <div style={cell}>
                  <Select options={rateUnitOptions} value={l.rateUnit} onChange={(e) => patch(l.key, { rateUnit: e.target.value as RateUnit })} />
                </div>
                <div style={cell}>
                  <Input type="number" placeholder="Unit $" value={l.unitPriceDollars} onChange={(e) => patch(l.key, { unitPriceDollars: e.target.value })} />
                </div>
                <div style={cell}>
                  <Select options={gctOptions} value={l.gctTreatment} onChange={(e) => patch(l.key, { gctTreatment: e.target.value as GctTreatment })} />
                </div>
                <button
                  aria-label="Remove line"
                  onClick={() => setLines((ls) => (ls.length > 1 ? ls.filter((x) => x.key !== l.key) : ls))}
                  style={{ height: 38, border: "1px solid var(--jq-border)", background: "var(--jq-surface)", color: "var(--jq-crit)", borderRadius: 8, cursor: "pointer" }}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </Card>
      </section>

      <div className={shared.grid2}>
        <Card>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Input label="Discount %" type="number" value={discountPct} onChange={(e) => setDiscountPct(e.target.value)} />
            <Input label="Deposit $" type="number" value={depositDollars} onChange={(e) => setDepositDollars(e.target.value)} />
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
        <Button href="/quotes" variant="ghost">
          Cancel
        </Button>
        <Button variant="primary" onClick={save}>
          {saving ? "Saving…" : "Save quote"}
        </Button>
      </div>
    </div>
  );
}
