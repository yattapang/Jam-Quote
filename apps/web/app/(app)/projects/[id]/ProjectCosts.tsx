"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatJmd, groupByCategory, PURCHASE_CATEGORY_SUGGESTIONS } from "@jamquote/core";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Modal from "@/components/ui/Modal";
import {
  createPurchase,
  deletePurchase,
  createLabourEntry,
  deleteLabourEntry,
  type ApiPurchase,
  type ApiLabourEntry,
} from "@/lib/api-client";
import type { LabourRate } from "@/lib/types";
import shared from "../../shared.module.css";

/**
 * What this job cost, and what was logged against it.
 *
 * The costs live on the PROJECT rather than in a separate expenses screen
 * because that is where the question gets asked: a contractor looking at a job
 * wants to know whether it made money, not to reconcile a ledger.
 */
export default function ProjectCosts({
  projectId,
  purchases,
  labour,
  labourRates,
}: {
  projectId: string;
  purchases: ApiPurchase[];
  labour: ApiLabourEntry[];
  /** The rate book, so a day rate is one pick rather than retyped — and so the
   * rate that gets SNAPSHOTTED is the one they actually charge. */
  labourRates: LabourRate[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [gct, setGct] = useState("");
  const [category, setCategory] = useState("");
  const [purchasedAt, setPurchasedAt] = useState(() => new Date().toISOString().slice(0, 10));
  const [reference, setReference] = useState("");

  const [labourOpen, setLabourOpen] = useState(false);
  const [who, setWho] = useState("");
  const [qty, setQty] = useState("");
  const [unitLabel, setUnitLabel] = useState("day");
  const [rate, setRate] = useState("");
  const [rateId, setRateId] = useState("");
  const [workedOn, setWorkedOn] = useState(() => new Date().toISOString().slice(0, 10));

  /** Picking a saved rate fills the amount AND the unit, so a day rate cannot
   * end up recorded as hours. The value is still editable afterwards — the
   * entry snapshots what was actually paid, which is not always the book. */
  function pickRate(id: string) {
    setRateId(id);
    const r = labourRates.find((x) => x.id === id);
    if (!r) return;
    setRate(String(r.rateDollars));
    setUnitLabel(r.unitLabel?.trim() || r.rateUnit.toLowerCase());
    if (!who.trim()) setWho(r.skillTier ? `${r.trade} — ${r.skillTier}` : r.trade);
  }

  async function saveLabour() {
    setBusy(true);
    setError(null);
    try {
      await createLabourEntry({
        projectId,
        ...(rateId ? { labourRateId: rateId } : {}),
        description: who.trim(),
        quantity: Number(qty),
        rateCents: Math.round(Number(rate) * 100),
        unitLabel: unitLabel.trim() || "day",
        workedOn: new Date(`${workedOn}T12:00:00.000Z`).toISOString(),
      });
      setLabourOpen(false);
      setWho("");
      setQty("");
      setRate("");
      setRateId("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save that.");
    } finally {
      setBusy(false);
    }
  }

  const labourTotal = labour.reduce(
    (n, l) => n + Math.round(Number(l.quantity) * l.rateCents),
    0,
  );

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await createPurchase({
        projectId,
        description: description.trim(),
        // Dollars in the form, cents on the wire — every money value in this
        // system is an integer number of cents.
        amountCents: Math.round(Number(amount) * 100),
        ...(gct.trim() ? { gctCents: Math.round(Number(gct) * 100) } : {}),
        ...(category.trim() ? { category: category.trim() } : {}),
        // Midday UTC, not midnight: Jamaica is UTC-5, so a midnight-UTC
        // instant is 7pm the PREVIOUS day locally.
        purchasedAt: new Date(`${purchasedAt}T12:00:00.000Z`).toISOString(),
        ...(reference.trim() ? { reference: reference.trim() } : {}),
      });
      setOpen(false);
      setDescription("");
      setAmount("");
      setGct("");
      setCategory("");
      setReference("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save that.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={shared.section}>
      <div className={shared.sectionHead}>
        <h2 className={shared.sectionTitle}>Costs</h2>
        <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
          Log a cost
        </Button>
      </div>
      <Card>
        {/* Where the money went, largest first. This is what the category
            field is FOR — without a breakdown it is data entry with no
            payoff, and a contractor would rightly stop filling it in. */}
        {purchases.length > 0 && (
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 8,
              marginBottom: 14,
              paddingBottom: 12,
              borderBottom: "1px solid var(--border)",
            }}
          >
            {groupByCategory(purchases).map((g) => (
              <span
                key={g.category}
                style={{
                  fontSize: 12,
                  padding: "5px 10px",
                  borderRadius: 999,
                  background: "var(--surface-alt)",
                  border: "1px solid var(--border)",
                }}
              >
                {g.category} <strong>{formatJmd(g.totalCents)}</strong>
              </span>
            ))}
          </div>
        )}

        {purchases.length === 0 ? (
          <div className={shared.empty}>
            Nothing logged against this job yet. Add what you spent — materials, hire, subcontractors
            — and the profit above will account for it.
          </div>
        ) : (
          <div className={shared.list}>
            {purchases.map((p) => (
              <div key={p.id} className={shared.row}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600 }}>{p.description}</div>
                  <div style={{ fontSize: 12, color: "var(--muted)" }}>
                    {p.purchasedAt.slice(0, 10)}
                    {p.category ? ` · ${p.category}` : ""}
                    {p.gctCents > 0 ? ` · incl. GCT ${formatJmd(p.gctCents)}` : ""}
                    {p.reference ? ` · ${p.reference}` : ""}
                  </div>
                </div>
                <span style={{ fontWeight: 600 }}>{formatJmd(p.amountCents)}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={async () => {
                    if (!window.confirm(`Remove "${p.description}"?`)) return;
                    await deletePurchase(p.id);
                    router.refresh();
                  }}
                >
                  Remove
                </Button>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Labour sits beside materials rather than inside them: it is usually
          the LARGEST cost on a job, and it is counted in days rather than
          dollars, which is the number that tells a contractor whether the job
          overran. */}
      <div className={shared.sectionHead} style={{ marginTop: 20 }}>
        <h2 className={shared.sectionTitle}>Labour</h2>
        <Button variant="secondary" size="sm" onClick={() => setLabourOpen(true)}>
          Log time
        </Button>
      </div>
      <Card>
        {labour.length === 0 ? (
          <div className={shared.empty}>
            No time logged. Without it the profit above counts the materials but not the people —
            so it will read better than the job really did.
          </div>
        ) : (
          <>
            <div style={{ marginBottom: 12, paddingBottom: 10, borderBottom: "1px solid var(--border)", fontSize: 13 }}>
              Total labour <strong>{formatJmd(labourTotal)}</strong>
            </div>
            <div className={shared.list}>
              {labour.map((l) => (
                <div key={l.id} className={shared.row}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600 }}>{l.description}</div>
                    <div style={{ fontSize: 12, color: "var(--muted)" }}>
                      {l.workedOn.slice(0, 10)} · {Number(l.quantity)} {l.unitLabel} @{" "}
                      {formatJmd(l.rateCents)}
                    </div>
                  </div>
                  <span style={{ fontWeight: 600 }}>
                    {formatJmd(Math.round(Number(l.quantity) * l.rateCents))}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={async () => {
                      if (!window.confirm(`Remove "${l.description}"?`)) return;
                      await deleteLabourEntry(l.id);
                      router.refresh();
                    }}
                  >
                    Remove
                  </Button>
                </div>
              ))}
            </div>
          </>
        )}
      </Card>

      {labourOpen && (
        <Modal title="Log time" onClose={() => (busy ? undefined : setLabourOpen(false))}>
          <div style={{ display: "grid", gap: 12 }}>
            {labourRates.length > 0 && (
              <label style={{ fontSize: 12, fontWeight: 600, color: "var(--muted)" }}>
                Saved rate
                <select
                  value={rateId}
                  onChange={(e) => pickRate(e.target.value)}
                  style={{ width: "100%", height: 36, padding: "0 9px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)", font: "inherit" }}
                >
                  <option value="">Type a one-off rate…</option>
                  {labourRates.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.skillTier ? `${r.trade} — ${r.skillTier}` : r.trade} ·{" "}
                      {formatJmd(r.rateCents)}/{r.unitLabel?.trim() || r.rateUnit.toLowerCase()}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <Input
              label="Who did the work?"
              value={who}
              onChange={(e) => setWho(e.target.value)}
              placeholder="e.g. Devon, or 3 masons"
            />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
              <Input
                label="How many"
                type="number"
                min={0}
                step="0.5"
                value={qty}
                onChange={(e) => setQty(e.target.value)}
              />
              <Input
                label="Unit"
                value={unitLabel}
                onChange={(e) => setUnitLabel(e.target.value)}
                placeholder="day"
              />
              <Input
                label="Rate $"
                type="number"
                min={0}
                step="0.01"
                value={rate}
                onChange={(e) => setRate(e.target.value)}
              />
            </div>
            <Input
              label="Date"
              type="date"
              value={workedOn}
              onChange={(e) => setWorkedOn(e.target.value)}
            />
            {error && <span style={{ fontSize: 12.5, color: "var(--critical)" }}>{error}</span>}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <Button variant="ghost" onClick={() => setLabourOpen(false)} disabled={busy}>
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={saveLabour}
                disabled={busy || !who.trim() || !qty.trim() || !rate.trim()}
              >
                {busy ? "Saving…" : "Log time"}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {open && (
        <Modal title="Log a cost" onClose={() => (busy ? undefined : setOpen(false))}>
          <div style={{ display: "grid", gap: 12 }}>
            <Input
              label="What was it?"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. Cement x 20 bags"
              autoFocus
            />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <Input
                label="Amount paid $"
                type="number"
                min={0}
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
              {/* Asked for separately rather than derived from a rate: plenty
                  of suppliers here are not GCT-registered, so assuming 15%
                  would invent input tax that cannot be reclaimed. */}
              <Input
                label="of which GCT $"
                type="number"
                min={0}
                step="0.01"
                value={gct}
                onChange={(e) => setGct(e.target.value)}
                placeholder="0 if none"
              />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <Input
                label="Date"
                type="date"
                value={purchasedAt}
                onChange={(e) => setPurchasedAt(e.target.value)}
              />
              {/* Suggested, not enforced — a contractor must be able to use
                  their own word. The list exists so the common ones are spelt
                  the same way every time, since the accountant export groups
                  on this and free text drifts within a week. */}
              <Input
                label="Category"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="Materials, hire…"
                list="purchase-categories"
              />
              <datalist id="purchase-categories">
                {PURCHASE_CATEGORY_SUGGESTIONS.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </div>
            <Input
              label="Reference"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="Receipt or invoice no."
            />
            {error && <span style={{ fontSize: 12.5, color: "var(--critical)" }}>{error}</span>}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <Button variant="ghost" onClick={() => setOpen(false)} disabled={busy}>
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={save}
                disabled={busy || !description.trim() || !amount.trim()}
              >
                {busy ? "Saving…" : "Log cost"}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </section>
  );
}
