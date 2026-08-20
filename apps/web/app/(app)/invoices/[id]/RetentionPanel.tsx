"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatJmd } from "@jamquote/core";
import Button from "@/components/ui/Button";
import MoneyText from "@/components/ui/MoneyText";
import Modal, { modalStyles } from "@/components/ui/Modal";
import { setInvoiceRetentionReleased } from "@/lib/api-client";
import shared from "../../shared.module.css";

/**
 * Retention on an invoice, and the sign-off that ends it.
 *
 * Retention is money the client keeps back until the work is signed off,
 * usually 5-10%. The thing contractors lose track of is the release: the job
 * finished months ago, the retention was never chased, and it quietly becomes
 * a write-off. So the held amount stays visible on the invoice for as long as
 * it is held, rather than disappearing once the rest is paid.
 *
 * Releasing does NOT record a payment — it says the money is now due. The cash
 * arriving is recorded as a payment like any other.
 */
export default function RetentionPanel({
  invoiceId,
  retentionPct,
  heldCents,
  released,
  isDraft,
}: {
  invoiceId: string;
  retentionPct: number;
  heldCents: number;
  released: boolean;
  isDraft: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function apply(next: boolean) {
    setBusy(true);
    setError("");
    try {
      await setInvoiceRetentionReleased(invoiceId, next);
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't update retention.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className={shared.statLabel}>Retention</div>
      <div className={shared.list}>
        <div className={shared.totalRowMuted}>
          <span>Held back ({retentionPct}%)</span>
          <MoneyText cents={heldCents} tone="muted" weight={600} />
        </div>
        <p style={{ margin: "4px 0 0", fontSize: 13, lineHeight: 1.5, opacity: 0.8 }}>
          {released
            ? "Signed off — this is now due and shows in the balance."
            : "Not due until the work is signed off, so it is left out of the balance due."}
        </p>
      </div>
      {isDraft ? (
        <p style={{ margin: "10px 0 0", fontSize: 13, opacity: 0.8 }}>
          Finalize the invoice before releasing retention.
        </p>
      ) : (
        <div style={{ marginTop: 12 }}>
          {released ? (
            <Button variant="ghost" size="sm" onClick={() => apply(false)} disabled={busy}>
              {busy ? "Working…" : "Undo release"}
            </Button>
          ) : (
            <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
              Release retention
            </Button>
          )}
          {error && (
            <span className={modalStyles.error} style={{ display: "block", marginTop: 8 }}>
              {error}
            </span>
          )}
        </div>
      )}
      {open && (
        <Modal title="Release retention?" onClose={() => (busy ? undefined : setOpen(false))}>
          <div className={modalStyles.form}>
            <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.5 }}>
              This adds <strong>{formatJmd(heldCents)}</strong> to what the client owes on this
              invoice. Do it once the work has been signed off.
            </p>
            <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.5 }}>
              It does not record a payment — when the money comes in, record it under Payments as
              usual.
            </p>
            {error && <span className={modalStyles.error}>{error}</span>}
            <div className={modalStyles.actions}>
              <Button variant="ghost" onClick={() => setOpen(false)} disabled={busy}>
                Cancel
              </Button>
              <Button variant="primary" onClick={() => apply(true)} disabled={busy}>
                {busy ? "Releasing…" : "Release"}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
