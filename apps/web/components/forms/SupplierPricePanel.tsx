"use client";

import { useCallback, useEffect, useState } from "react";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import MoneyText from "@/components/ui/MoneyText";
import Select from "@/components/ui/Select";
import fieldStyles from "@/components/ui/Field.module.css";
import {
  createMaterialPrice,
  deleteMaterialPrice,
  getMaterialPrices,
  getSuppliersClient,
  type ApiSupplier,
  type ApiSupplierPrice,
} from "@/lib/api-client";
import { relativeTime } from "@/lib/relative-time";
import { cheapestPriceCents, priceDollarsToCents } from "@/lib/supplier-prices";
import styles from "./SupplierPricePanel.module.css";

/**
 * "What does everyone else charge for this?" — the supplier price comparison
 * for one saved material (#26 Phase 2b), plus a form to record a price the
 * contractor was quoted.
 *
 * Applying a price is always an explicit per-row button. Nothing here ever
 * writes back on its own: silently swapping in the cheapest supplier's number
 * would change a figure the contractor is about to put in front of a customer,
 * and reference prices are best-effort name matches, not gospel.
 */
export default function SupplierPricePanel({
  materialFavouriteId,
  currentPriceCents,
  onUsePrice,
}: {
  materialFavouriteId: string;
  /** The price the surrounding form currently holds — the row matching it has
   * nothing left to apply. */
  currentPriceCents: number;
  onUsePrice: (priceCents: number, supplierId: string) => void;
}) {
  const [prices, setPrices] = useState<ApiSupplierPrice[]>([]);
  const [suppliers, setSuppliers] = useState<ApiSupplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [removingId, setRemovingId] = useState("");

  const [supplierId, setSupplierId] = useState("");
  const [priceDollars, setPriceDollars] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setPrices(await getMaterialPrices(materialFavouriteId));
    } catch {
      // Inline, never thrown: this panel sits beside a working edit form, and
      // a price lookup failing must not take that form down with it.
      setError("Couldn't load supplier prices — is the API running?");
    } finally {
      setLoading(false);
    }
  }, [materialFavouriteId]);

  useEffect(() => {
    void load();
  }, [load]);

  // The directory is fetched separately so a failure here only costs the
  // record-a-price form, not the comparison above it.
  useEffect(() => {
    let cancelled = false;
    getSuppliersClient()
      .then((rows) => {
        if (!cancelled) setSuppliers(rows);
      })
      .catch(() => {
        if (!cancelled) setSuppliers([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function remove(id: string) {
    setRemovingId(id);
    setError("");
    try {
      await deleteMaterialPrice(id);
      await load();
    } catch {
      setError("Couldn't remove that price — is the API running?");
    } finally {
      setRemovingId("");
    }
  }

  async function recordPrice(e: React.FormEvent) {
    e.preventDefault();
    if (!supplierId) return setFormError("Pick a supplier.");
    const priceCents = priceDollarsToCents(priceDollars);
    if (priceCents <= 0) return setFormError("Enter the price you were quoted.");

    setSaving(true);
    setFormError("");
    try {
      await createMaterialPrice({
        supplierId,
        materialFavouriteId,
        priceCents,
        note: note.trim() || undefined,
      });
      setPriceDollars("");
      setNote("");
      await load();
    } catch {
      setFormError("Couldn't record that price — is the API running?");
    } finally {
      setSaving(false);
    }
  }

  const cheapest = cheapestPriceCents(prices);

  return (
    <section className={styles.panel}>
      <h3 className={styles.title}>Supplier prices</h3>

      {loading && <span className={fieldStyles.hint}>Loading supplier prices…</span>}
      {!loading && error && <span className={fieldStyles.error}>{error}</span>}
      {!loading && !error && prices.length === 0 && (
        <span className={fieldStyles.hint}>
          No prices for this material yet — record what you were last quoted below.
        </span>
      )}

      {!loading && !error && prices.length > 0 && (
        <ul className={styles.rows}>
          {prices.map((p) => {
            const isCheapest = p.priceCents === cheapest;
            const inUse = p.priceCents === currentPriceCents;
            return (
              <li key={p.id} className={isCheapest ? styles.rowCheapest : styles.row}>
                <div className={styles.rowTop}>
                  <span className={styles.supplier}>{p.supplierName}</span>
                  <span className={p.own ? styles.badgeOwn : styles.badgeReference}>
                    {p.own ? "Your price" : "Reference"}
                  </span>
                  {isCheapest && <span className={styles.badgeCheapest}>Cheapest</span>}
                </div>
                <span className={styles.meta} title={p.fetchedAt}>
                  {p.location ? `${p.location} · ` : ""}
                  Updated {relativeTime(p.fetchedAt)}
                </span>
                {p.note && <span className={styles.note}>{p.note}</span>}
                <div className={styles.rowActions}>
                  <MoneyText
                    cents={p.priceCents}
                    tone={isCheapest ? "good" : "default"}
                    size={15}
                    className={styles.price}
                  />
                  <Button
                    variant="outlineAccent"
                    size="sm"
                    type="button"
                    onClick={() => onUsePrice(p.priceCents, p.supplierId)}
                    disabled={inUse}
                  >
                    {inUse ? "In use" : "Use this price"}
                  </Button>
                  {/* Curated rows belong to the platform — the API answers 403
                      — so the control only exists on your own entries. */}
                  {p.own && (
                    <button
                      type="button"
                      className={styles.remove}
                      onClick={() => void remove(p.id)}
                      disabled={removingId === p.id}
                    >
                      {removingId === p.id ? "Removing…" : "Remove"}
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <form className={styles.recordForm} onSubmit={recordPrice}>
        <div className={styles.recordFields}>
          <Select
            label="Record a price at"
            options={[
              { value: "", label: suppliers.length ? "Pick a supplier" : "No suppliers available" },
              ...suppliers.map((s) => ({
                value: s.id,
                label: s.parish ? `${s.name} — ${s.parish}` : s.name,
              })),
            ]}
            value={supplierId}
            onChange={(e) => setSupplierId(e.target.value)}
            disabled={suppliers.length === 0}
          />
          <Input
            label="Price $"
            type="number"
            min="0"
            step="0.01"
            value={priceDollars}
            onChange={(e) => setPriceDollars(e.target.value)}
          />
        </div>
        <Input
          label="Note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Optional — e.g. delivered, cash price"
        />
        {formError && <span className={fieldStyles.error}>{formError}</span>}
        <div className={styles.recordActions}>
          <Button variant="secondary" size="sm" type="submit" disabled={saving}>
            {saving ? "Recording…" : "Record price"}
          </Button>
        </div>
      </form>
    </section>
  );
}
