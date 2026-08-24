"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { InvoiceStatus } from "@jamquote/core";
import Button from "@/components/ui/Button";
import DeleteRowButton from "@/components/ui/DeleteRowButton";
import Modal, { modalStyles } from "@/components/ui/Modal";
import { ApiError, finalizeInvoice } from "@/lib/api-client";

/**
 * Header actions for the invoice detail page. Only a DRAFT invoice can be
 * edited, finalized, or deleted (see the API's InvoicesService — every write
 * route besides `finalize` rejects a non-DRAFT invoice). Once finalized
 * (INVOICED/PARTIAL/PAID/OVERDUE) the invoice is read-only, so this renders
 * nothing for those statuses. Finalizing is irreversible — it locks editing
 * and flips the source quote to INVOICED — so it confirms via a Modal first.
 */
export default function InvoiceActions({ id, status }: { id: string; status: InvoiceStatus }) {
  const router = useRouter();
  const [finalizeOpen, setFinalizeOpen] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [finalizeError, setFinalizeError] = useState("");

  async function confirmFinalize() {
    setFinalizing(true);
    setFinalizeError("");
    try {
      await finalizeInvoice(id);
      setFinalizeOpen(false);
      router.refresh();
    } catch (err) {
      setFinalizeError(
        err instanceof ApiError && err.message ? err.message : "Couldn't finalize — is the API running?",
      );
      setFinalizing(false);
    }
  }

  if (status !== InvoiceStatus.DRAFT) return null;

  return (
    <>
      <Button href={`/invoices/${id}/edit`} variant="outlineAccent" size="sm">
        Edit
      </Button>
      <Button variant="primary" size="sm" onClick={() => setFinalizeOpen(true)}>
        Finalize
      </Button>
      <DeleteRowButton
        kind="invoice"
        id={id}
        confirmMessage="Delete this draft invoice? This can't be undone."
        redirectTo="/invoices"
      />
      {finalizeOpen && (
        <Modal title="Finalize invoice?" onClose={() => (finalizing ? undefined : setFinalizeOpen(false))}>
          <div className={modalStyles.form}>
            <p>
              This locks the invoice from further edits and marks the source quote as invoiced. This
              can&apos;t be undone. Finalize now?
            </p>
            {finalizeError && <span className={modalStyles.error}>{finalizeError}</span>}
            <div className={modalStyles.actions}>
              <Button variant="ghost" onClick={() => setFinalizeOpen(false)} disabled={finalizing}>
                Cancel
              </Button>
              <Button variant="primary" onClick={confirmFinalize} disabled={finalizing}>
                {finalizing ? "Finalizing…" : "Finalize"}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
