"use client";

import { useCallback, useEffect, useState } from "react";
import { PARISHES } from "@jamquote/core";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import MoneyText from "@/components/ui/MoneyText";
import Select from "@/components/ui/Select";
import fieldStyles from "@/components/ui/Field.module.css";
import {
  createMaterialPrice,
  createSupplier,
  deleteMaterialPrice,
  getMaterialPrices,
  getSuppliersClient,
  type ApiSupplier,
  type ApiSupplierPrice,
} from "@/lib/api-client";
import {
  ADD_NEW_OPTION_VALUE,
  compareSuppliersByName,
  isAddNewOption,
  mergeCatalogRow,
} from "@/lib/catalog-options";
import { relativeTime } from "@/lib/relative-time";
import { cheapestPriceCents, priceDollarsToCents } from "@/lib/supplier-prices";
import styles from "./SupplierPricePanel.module.css";

const parishOptions = [{ value: "", label: "Parish (optional)" }, ...PARISHES.map((p) => ({ value: p, label: p }))];

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

  const [addingSupplier, setAddingSupplier] = useState(false);
  const [newSupplierName, setNewSupplierName] = useState("");
  const [newSupplierParish, setNewSupplierParish] = useState("");
  const [addingBusy, setAddingBusy] = useState(false);
  const [addError, setAddError] = useState("");
  const [addNote, setAddNote] = useState("");

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
  const loadSuppliers = useCallback(async () => {
    try {
      setSuppliers(await getSuppliersClient());
    } catch {
      setSuppliers([]);
    }
  }, []);

  useEffect(() => {
    void loadSuppliers();
  }, [loadSuppliers]);

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

  /**
   * Quick-add for a merchant that isn't in the list yet. Suppliers are
   * tenant-owned, so this is the only way one comes into existence — a
   * contractor being quoted a price by a shop we've never heard of must not be
   * stuck. The create is idempotent: a name already in the directory returns
   * that row, which is a plain success (select it, no duplicate, no error).
   */
  async function addSupplier() {
    const name = newSupplierName.trim();
    if (!name) return setAddError("Give the supplier a name.");
    if (addingBusy) return;
    setAddingBusy(true);
    setAddError("");
    try {
      const created = await createSupplier({
        name,
        parish: newSupplierParish || undefined,
      });
      const alreadyKnown = suppliers.some((s) => s.id === created.id);
      setSuppliers((prev) => mergeCatalogRow(prev, created, compareSuppliersByName));
      setSupplierId(created.id);
      setAddingSupplier(false);
      setNewSupplierName("");
      setNewSupplierParish("");
      setAddNote(alreadyKnown ? `Already in your list — selected ${created.name}.` : "");
      // Re-read rather than trusting the splice: the row the API stored is the
      // canonical one, and another tab may have added suppliers since.
      void loadSuppliers();
    } catch {
      setAddError("Couldn't add that supplier — is the API running?");
    } finally {
      setAddingBusy(false);
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
              { value: "", label: suppliers.length ? "Pick a supplier" : "No suppliers yet" },
              ...suppliers.map((s) => ({
                value: s.id,
                label: s.parish ? `${s.name} — ${s.parish}` : s.name,
              })),
              // Hidden while the quick-add is open: re-picking the sentinel
              // changes no state, so there'd be no re-render to pull the native
              // <select> back off it. The option is never disabled with the
              // list — an empty directory is exactly when it's needed.
              ...(addingSupplier
                ? []
                : [{ value: ADD_NEW_OPTION_VALUE, label: "+ Add supplier…" }]),
            ]}
            value={supplierId}
            onChange={(e) => {
              setAddNote("");
              // The sentinel is never stored, so the controlled select snaps
              // back to whatever was really chosen.
              if (isAddNewOption(e.target.value)) setAddingSupplier(true);
              else setSupplierId(e.target.value);
            }}
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
        {addingSupplier && (
          <div className={styles.addSupplier}>
            <Input
              label="Supplier name"
              placeholder="e.g. Rapid True Value"
              value={newSupplierName}
              onChange={(e) => setNewSupplierName(e.target.value)}
              // Inside the record-a-price <form>: without this, Enter would
              // submit a price for a supplier that doesn't exist yet.
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void addSupplier();
                } else if (e.key === "Escape") {
                  setAddingSupplier(false);
                }
              }}
              autoFocus
            />
            <Select
              label="Parish"
              options={parishOptions}
              value={newSupplierParish}
              onChange={(e) => setNewSupplierParish(e.target.value)}
            />
            <div className={styles.addSupplierActions}>
              <Button
                variant="secondary"
                size="sm"
                type="button"
                onClick={() => void addSupplier()}
                disabled={addingBusy}
              >
                {addingBusy ? "Adding…" : "Add supplier"}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                type="button"
                onClick={() => setAddingSupplier(false)}
                disabled={addingBusy}
              >
                Cancel
              </Button>
            </div>
            {addError && <span className={styles.addSupplierError}>{addError}</span>}
          </div>
        )}
        {addNote && <span className={fieldStyles.hint}>{addNote}</span>}
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
