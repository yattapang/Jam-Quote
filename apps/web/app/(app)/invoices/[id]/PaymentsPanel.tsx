"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { InvoiceStatus, PaymentMethod } from "@jamquote/core";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import Modal, { modalStyles } from "@/components/ui/Modal";
import MoneyText from "@/components/ui/MoneyText";
import fieldStyles from "@/components/ui/Field.module.css";
import { recordManualPayment, voidPayment, type InvoicePayment } from "@/lib/api-client";
import styles from "./PaymentsPanel.module.css";

const METHOD_LABEL: Record<PaymentMethod, string> = {
  [PaymentMethod.CASH]: "Cash",
  [PaymentMethod.BANK_TRANSFER]: "Bank transfer",
  [PaymentMethod.CARD]: "Card",
  [PaymentMethod.MOBILE_MONEY]: "Mobile money",
  [PaymentMethod.OTHER]: "Other",
};

const METHOD_OPTIONS = Object.values(PaymentMethod).map((m) => ({
  value: m,
  label: METHOD_LABEL[m],
}));

/** yyyy-mm-dd in the browser's own timezone — `toISOString()` would shift the
 * date backwards for anyone west of UTC, which is everyone here. */
function todayLocal(): string {
  const now = new Date();
  const offsetMs = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offsetMs).toISOString().slice(0, 10);
}

/**
 * Record and review payments against an invoice (#32).
 *
 * Until this existed the API could take payments but nothing in the web app
 * called it, so "Paid" and "Balance due" were permanently $0 and the full
 * amount — on screen AND on the PDF the customer receives.
 */
export default function PaymentsPanel({
  invoiceId,
  status,
  balanceDueCents,
  payments,
}: {
  invoiceId: string;
  status: InvoiceStatus;
  balanceDueCents: number;
  payments: InvoicePayment[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [amountDollars, setAmountDollars] = useState("");
  const [method, setMethod] = useState<PaymentMethod>(PaymentMethod.CASH);
  const [reference, setReference] = useState("");
  const [paidAt, setPaidAt] = useState(todayLocal());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [voidingId, setVoidingId] = useState("");

  // A DRAFT invoice hasn't been issued to anyone yet, so there is nothing to
  // have been paid against. The API would accept it; offering it invites
  // recording a payment on an invoice the customer has never seen.
  const canRecord = status !== InvoiceStatus.DRAFT;

  function openModal() {
    // Prefill the outstanding balance — settling in full is the common case,
    // and it is the figure the contractor would otherwise copy by hand.
    setAmountDollars(balanceDueCents > 0 ? (balanceDueCents / 100).toFixed(2) : "");
    setPaidAt(todayLocal());
    setReference("");
    setError("");
    setOpen(true);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const amountCents = Math.round((Number(amountDollars) || 0) * 100);
    if (amountCents <= 0) {
      setError("Enter the amount received.");
      return;
    }

    setSaving(true);
    setError("");
    try {
      await recordManualPayment(invoiceId, {
        amountCents,
        method,
        reference: reference.trim() || undefined,
        paidAt: paidAt || undefined,
      });
      setOpen(false);
      // The server re-derives paidCents and the PAID/PARTIAL status, so re-read
      // rather than patching local state and risking a different answer.
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't record that payment.");
    } finally {
      setSaving(false);
    }
  }

  async function removePayment(p: InvoicePayment) {
    // Confirmed because it moves money on the customer's statement, and for a
    // card payment the wording has to be honest: this corrects the book, it
    // does not send anybody their money back.
    const warning =
      p.method === PaymentMethod.CARD
        ? "Void this card payment? This corrects your records only — it does NOT refund the customer."
        : "Void this payment? It will be removed from the invoice balance.";
    if (!window.confirm(warning)) return;

    setVoidingId(p.id);
    setError("");
    try {
      await voidPayment(p.id);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't void that payment.");
    } finally {
      setVoidingId("");
    }
  }

  const overpaying = Math.round((Number(amountDollars) || 0) * 100) > balanceDueCents;

  return (
    <>
      <div className={styles.head}>
        <span className={styles.title}>Payments</span>
        {canRecord && (
          <Button variant="outlineAccent" size="sm" onClick={openModal}>
            Record payment
          </Button>
        )}
      </div>

      {payments.length === 0 ? (
        <span className={fieldStyles.hint}>
          {canRecord
            ? "Nothing recorded yet."
            : "Finalize this invoice before recording a payment."}
        </span>
      ) : (
        <ul className={styles.rows}>
          {payments.map((p) => (
            <li key={p.id} className={styles.row}>
              <div className={styles.rowMain}>
                <span className={styles.method}>{METHOD_LABEL[p.method] ?? p.method}</span>
                <span className={styles.meta}>
                  {new Date(p.paidAt).toLocaleDateString("en-JM", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                  {p.reference ? ` · ${p.reference}` : ""}
                </span>
              </div>
              <div className={styles.rowEnd}>
                <MoneyText cents={p.amountCents} tone="good" weight={600} />
                <button
                  type="button"
                  className={styles.void}
                  onClick={() => void removePayment(p)}
                  disabled={voidingId === p.id}
                >
                  {voidingId === p.id ? "Voiding…" : "Void"}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {error && !open && <span className={fieldStyles.error}>{error}</span>}

      {open && (
        <Modal title="Record payment" onClose={() => (saving ? undefined : setOpen(false))}>
          <form className={modalStyles.form} onSubmit={submit}>
            <div className={modalStyles.row2}>
              <Input
                label="Amount $"
                type="number"
                min="0"
                step="0.01"
                value={amountDollars}
                onChange={(e) => setAmountDollars(e.target.value)}
                autoFocus
              />
              <Input
                label="Date received"
                type="date"
                value={paidAt}
                onChange={(e) => setPaidAt(e.target.value)}
              />
            </div>
            <Select
              label="Method"
              options={METHOD_OPTIONS}
              value={method}
              onChange={(e) => setMethod(e.target.value as PaymentMethod)}
            />
            <Input
              label="Reference"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="Optional — cheque no., bank ref, wallet id"
            />
            {/* Warned about, not blocked: a customer really can overpay, and
                refusing it would leave the contractor unable to record what
                actually happened. */}
            {overpaying && (
              <span className={fieldStyles.hint}>
                That is more than the outstanding balance — the extra will show as a credit.
              </span>
            )}
            {error && <span className={modalStyles.error}>{error}</span>}
            <div className={modalStyles.actions}>
              <Button variant="ghost" type="button" onClick={() => setOpen(false)} disabled={saving}>
                Cancel
              </Button>
              <Button variant="primary" type="submit" disabled={saving}>
                {saving ? "Recording…" : "Record payment"}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
