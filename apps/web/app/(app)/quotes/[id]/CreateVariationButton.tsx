"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Button from "@/components/ui/Button";
import Modal, { modalStyles } from "@/components/ui/Modal";
import { createQuoteVariation } from "@/lib/api-client";

/**
 * "Add extra work" on a quote the client has already accepted.
 *
 * A variation, not a revision. The accepted quote is never touched — what the
 * client agreed to has to stay on the record, because that is the only thing
 * that settles an argument later about what was in the original price.
 *
 * Confirms first, and says plainly what will happen, because a contractor
 * reaching for this is usually mid-job and about to send something to a
 * client.
 */
export default function CreateVariationButton({ quoteId }: { quoteId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function confirm() {
    setBusy(true);
    setError("");
    try {
      const variation = await createQuoteVariation(quoteId);
      // Straight into editing it: the variation is created empty, so landing
      // anywhere else would leave the contractor looking at a blank document
      // wondering what happened.
      router.push(`/quotes/${variation.id}/edit`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't create the variation.");
      setBusy(false);
    }
  }

  return (
    <>
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
        Add extra work
      </Button>
      {open && (
        <Modal title="Add extra work?" onClose={() => (busy ? undefined : setOpen(false))}>
          <div className={modalStyles.form}>
            <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.5 }}>
              This creates a <strong>separate variation</strong> for work agreed after the original
              quote. The accepted quote stays exactly as your client agreed it — so if there is ever
              a disagreement, both the original price and the extra are on the record.
            </p>
            <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.5 }}>
              It starts empty. Add only the new work, then send it for approval like any quote.
            </p>
            {error && <span className={modalStyles.error}>{error}</span>}
            <div className={modalStyles.actions}>
              <Button variant="ghost" onClick={() => setOpen(false)} disabled={busy}>
                Cancel
              </Button>
              <Button variant="primary" onClick={confirm} disabled={busy}>
                {busy ? "Creating…" : "Create variation"}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
