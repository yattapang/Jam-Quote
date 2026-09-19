"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { BOUNDS, formatJmd, groupByCategory, mergeCategoryOptions } from "@jamquote/core";
import { lineUnitLabel } from "@/lib/quote-totals";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import Modal from "@/components/ui/Modal";
import ConfirmModal from "@/components/ui/ConfirmModal";
import {
  createPurchase,
  deletePurchase,
  createLabourEntry,
  deleteLabourEntry,
  type ApiPurchase,
  type ApiLabourEntry,
} from "@/lib/api-client";
import { useSingleFlight } from "@/lib/use-single-flight";
import type { LabourRate } from "@/lib/types";
import shared from "../../shared.module.css";
import styles from "./ProjectCosts.module.css";

/**
 * What this job cost, and what was logged against it.
 *
 * The costs live on the PROJECT rather than in a separate expenses screen
 * because that is where the question gets asked: a contractor looking at a job
 * wants to know whether it made money, not to reconcile a ledger.
 */
/** Sentinel for the "Other…" choice. A value no real category can collide
 * with, since categories are free text and "Other" itself is plausible. */
const OTHER_CATEGORY = "__other__";

export default function ProjectCosts({
  projectId,
  purchases,
  labour,
  labourRates,
  usedCategories,
}: {
  projectId: string;
  purchases: ApiPurchase[];
  labour: ApiLabourEntry[];
  /** The rate book, so a day rate is one pick rather than retyped — and so the
   * rate that gets SNAPSHOTTED is the one they actually charge. */
  labourRates: LabourRate[];
  /** Categories this business has already spent under. Offered alongside the
   * built-in suggestions so a contractor finds their own past wording rather
   * than retyping it slightly differently. */
  usedCategories: string[];
}) {
  // Built-in suggestions plus whatever this business has already used, deduped
  // case-insensitively so the dropdown cannot offer a spelling that
  // groupByCategory then folds into another line.
  const categoryOptions = useMemo(() => mergeCategoryOptions(usedCategories), [usedCategories]);

  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [removingPurchase, setRemovingPurchase] = useState<ApiPurchase | null>(null);
  const [removingLabour, setRemovingLabour] = useState<ApiLabourEntry | null>(null);

  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [gct, setGct] = useState("");
  const [category, setCategory] = useState("");
  // "Other…" is a real choice, not an empty category — without this the box
  // would vanish the moment a contractor cleared what they had typed.
  const [customCategory, setCustomCategory] = useState(false);
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
    setUnitLabel(lineUnitLabel(r));
    if (!who.trim()) setWho(r.skillTier ? `${r.trade} — ${r.skillTier}` : r.trade);
  }

  // A double submit (fast double click/Enter with no render between) would
  // log the same cost or labour entry twice — a create, not an idempotent
  // update, so it needs the single-flight guard, not just a busy flag.
  const { run: saveLabour, pending: savingLabour } = useSingleFlight(async () => {
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
    }
  });

  const labourTotal = labour.reduce(
    (n, l) => n + Math.round(Number(l.quantity) * l.rateCents),
    0,
  );

  const { run: save, pending: savingPurchase } = useSingleFlight(async () => {
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
      setCustomCategory(false);
      setReference("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save that.");
    }
  });

  const { run: confirmRemovePurchase, pending: removingPurchasePending } = useSingleFlight(
    async () => {
      const p = removingPurchase;
      if (!p) return;
      setError(null);
      try {
        await deletePurchase(p.id);
        setRemovingPurchase(null);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Couldn't remove that.");
      }
    },
  );

  const { run: confirmRemoveLabour, pending: removingLabourPending } = useSingleFlight(
    async () => {
      const l = removingLabour;
      if (!l) return;
      setError(null);
      try {
        await deleteLabourEntry(l.id);
        setRemovingLabour(null);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Couldn't remove that.");
      }
    },
  );

  return (
    <section className={shared.section}>
      <div className={shared.sectionHead}>
        <h2 className={shared.sectionTitle}>Costs</h2>
        <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
          Log a cost
        </Button>
      </div>
      {error && !open && !labourOpen && (
        <div className={styles.error}>{error}</div>
      )}
      <Card>
        {/* Where the money went, largest first. This is what the category
            field is FOR — without a breakdown it is data entry with no
            payoff, and a contractor would rightly stop filling it in. */}
        {purchases.length > 0 && (
          <div>
            <div className={styles.categoryLabel}>
              Spend by category (incl. GCT)
            </div>
            <div className={styles.categoryChips}>
              {groupByCategory(purchases).map((g) => (
                <span key={g.category} className={styles.categoryChip}>
                  {g.category} <strong>{formatJmd(g.totalCents)}</strong>
                </span>
              ))}
            </div>
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
                <div className={styles.rowMain}>
                  <div className={styles.rowTitle}>{p.description}</div>
                  <div className={styles.rowMeta}>
                    {p.purchasedAt.slice(0, 10)}
                    {p.category ? ` · ${p.category}` : ""}
                    {p.gctCents > 0 ? ` · incl. GCT ${formatJmd(p.gctCents)}` : ""}
                    {p.reference ? ` · ${p.reference}` : ""}
                  </div>
                </div>
                <span className={styles.rowAmount}>{formatJmd(p.amountCents)}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={removingPurchase?.id === p.id}
                  onClick={() => setRemovingPurchase(p)}
                >
                  {removingPurchase?.id === p.id ? "Removing…" : "Remove"}
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
      <div className={`${shared.sectionHead} ${styles.sectionHeadSpaced}`}>
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
            <div className={styles.labourTotal}>
              Total labour <strong>{formatJmd(labourTotal)}</strong>
            </div>
            <div className={shared.list}>
              {labour.map((l) => (
                <div key={l.id} className={shared.row}>
                  <div className={styles.rowMain}>
                    <div className={styles.rowTitle}>{l.description}</div>
                    <div className={styles.rowMeta}>
                      {l.workedOn.slice(0, 10)} · {Number(l.quantity)} {l.unitLabel} @{" "}
                      {formatJmd(l.rateCents)}
                    </div>
                  </div>
                  <span className={styles.rowAmount}>
                    {formatJmd(Math.round(Number(l.quantity) * l.rateCents))}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={removingLabour?.id === l.id}
                    onClick={() => setRemovingLabour(l)}
                  >
                    {removingLabour?.id === l.id ? "Removing…" : "Remove"}
                  </Button>
                </div>
              ))}
            </div>
          </>
        )}
      </Card>

      {labourOpen && (
        <Modal title="Log time" onClose={() => (savingLabour ? undefined : setLabourOpen(false))}>
          <form
            className={styles.form}
            onSubmit={(e) => {
              e.preventDefault();
              if (savingLabour || !who.trim() || !qty.trim() || !rate.trim()) return;
              void saveLabour();
            }}
          >
            {labourRates.length > 0 && (
              <label className={styles.rateLabel}>
                Saved rate
                <select
                  value={rateId}
                  onChange={(e) => pickRate(e.target.value)}
                  className={styles.rateSelect}
                >
                  <option value="">Type a one-off rate…</option>
                  {labourRates.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.skillTier ? `${r.trade} — ${r.skillTier}` : r.trade} ·{" "}
                      {formatJmd(r.rateCents)}/{lineUnitLabel(r)}
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
            <div className={styles.grid3}>
              <Input
                label="How many"
                type="number"
                min={BOUNDS.quantity.min}
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
                min={BOUNDS.moneyDollars.min}
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
            {error && <span className={styles.formError}>{error}</span>}
            <div className={styles.formActions}>
              <Button variant="ghost" type="button" onClick={() => setLabourOpen(false)} disabled={savingLabour}>
                Cancel
              </Button>
              <Button
                variant="primary"
                type="submit"
                disabled={savingLabour || !who.trim() || !qty.trim() || !rate.trim()}
              >
                {savingLabour ? "Saving…" : "Log time"}
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {open && (
        <Modal title="Log a cost" onClose={() => (savingPurchase ? undefined : setOpen(false))}>
          <form
            className={styles.form}
            onSubmit={(e) => {
              e.preventDefault();
              if (savingPurchase || !description.trim() || !amount.trim()) return;
              void save();
            }}
          >
            <Input
              label="What was it?"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. Cement x 20 bags"
              autoFocus
            />
            <div className={styles.grid2}>
              <Input
                label="Amount paid $"
                type="number"
                min={BOUNDS.moneyDollars.min}
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
                min={BOUNDS.moneyDollars.min}
                step="0.01"
                value={gct}
                onChange={(e) => setGct(e.target.value)}
                placeholder="0 if none"
              />
            </div>
            <div className={styles.grid2}>
              <Input
                label="Date"
                type="date"
                value={purchasedAt}
                onChange={(e) => setPurchasedAt(e.target.value)}
              />
              {/* A real dropdown, not a datalist. The datalist this replaces
                  was invisible until you typed, so the suggestions that exist
                  to stop spelling drift were never seen — and drift is exactly
                  what makes the spend breakdown and the accountant export
                  ungroupable. "Other…" keeps free text possible, because a
                  contractor must be able to use their own word. */}
              <Select
                label="Category"
                value={customCategory ? OTHER_CATEGORY : category}
                onChange={(e) => {
                  const picked = e.target.value;
                  if (picked === OTHER_CATEGORY) {
                    setCustomCategory(true);
                    setCategory("");
                  } else {
                    setCustomCategory(false);
                    setCategory(picked);
                  }
                }}
                options={[
                  { value: "", label: "No category" },
                  ...categoryOptions.map((c) => ({ value: c, label: c })),
                  { value: OTHER_CATEGORY, label: "Other…" },
                ]}
                hint="Groups the spend breakdown and the accountant export."
              />
              {customCategory && (
                <Input
                  label="New category"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  placeholder="e.g. Scaffold hire"
                  autoFocus
                  hint="Saved with this purchase and offered next time."
                />
              )}
            </div>
            <Input
              label="Reference"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="Receipt or invoice no."
            />
            {error && <span className={styles.formError}>{error}</span>}
            <div className={styles.formActions}>
              <Button variant="ghost" type="button" onClick={() => setOpen(false)} disabled={savingPurchase}>
                Cancel
              </Button>
              <Button
                variant="primary"
                type="submit"
                disabled={savingPurchase || !description.trim() || !amount.trim()}
              >
                {savingPurchase ? "Saving…" : "Log cost"}
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {removingPurchase && (
        <ConfirmModal
          message={`Remove "${removingPurchase.description}"?`}
          confirmLabel="Remove"
          pendingLabel="Removing…"
          pending={removingPurchasePending}
          onConfirm={() => void confirmRemovePurchase()}
          onCancel={() => setRemovingPurchase(null)}
        />
      )}
      {removingLabour && (
        <ConfirmModal
          message={`Remove "${removingLabour.description}"?`}
          confirmLabel="Remove"
          pendingLabel="Removing…"
          pending={removingLabourPending}
          onConfirm={() => void confirmRemoveLabour()}
          onCancel={() => setRemovingLabour(null)}
        />
      )}
    </section>
  );
}
