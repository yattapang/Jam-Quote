"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatJmd, groupByCategory, PURCHASE_CATEGORY_SUGGESTIONS } from "@jamquote/core";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Modal from "@/components/ui/Modal";
import { createPurchase, deletePurchase, type ApiPurchase } from "@/lib/api-client";
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
}: {
  projectId: string;
  purchases: ApiPurchase[];
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
