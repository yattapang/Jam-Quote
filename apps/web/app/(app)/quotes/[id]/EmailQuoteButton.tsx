"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { QuoteStatus } from "@jamquote/core";
import Button from "@/components/ui/Button";
import Modal, { modalStyles } from "@/components/ui/Modal";
import { setQuoteStatus } from "@/lib/api-client";

interface EmailQuoteButtonProps {
  quoteId: string;
  clientEmail?: string;
  /** Emailing a DRAFT quote is what actually sends it, so it advances the
   * status. Any other status is left alone — re-emailing an ACCEPTED quote
   * must not drag it backwards to SENT. */
  status: QuoteStatus;
}

/**
 * Client island: confirms, then POSTs to the email send route (an outward
 * action, so — like QuoteActions' send/revise — it always confirms first).
 *
 * Emailing a DRAFT quote also moves it to SENT (#35). Before this, the status
 * flip lived ONLY behind a separate "Mark as sent" control, so a contractor
 * who emailed the quote — the action that genuinely sends it — left it sitting
 * in Draft, and never saw the Accept -> Convert to invoice path that only
 * appears once a quote has left Draft.
 */
export default function EmailQuoteButton({ quoteId, clientEmail, status }: EmailQuoteButtonProps) {
  const router = useRouter();
  const hasEmail = Boolean(clientEmail && clientEmail.trim());
  const [open, setOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const [statusWarning, setStatusWarning] = useState("");

  async function confirmSend() {
    setSending(true);
    setError("");
    try {
      const res = await fetch(`/quotes/${quoteId}/email`, { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error || "Couldn't send the email.");
        return;
      }
      setSent(true);

      // Only AFTER a confirmed send. Marking a quote sent when the email
      // failed would tell the contractor their customer has it when nobody
      // does — strictly worse than the stale-Draft bug this fixes.
      if (status === QuoteStatus.DRAFT) {
        try {
          await setQuoteStatus(quoteId, QuoteStatus.SENT);
          router.refresh();
        } catch {
          // The email DID go out; only the bookkeeping failed. Say so rather
          // than reporting a send failure that did not happen.
          setStatusWarning(
            "Emailed, but the quote is still showing as Draft — mark it as sent manually.",
          );
        }
      }
    } catch {
      setError("Couldn't send — is the API running?");
    } finally {
      setSending(false);
    }
  }

  function close() {
    if (sending) return;
    setOpen(false);
    setError("");
    setSent(false);
    setStatusWarning("");
  }

  return (
    <>
      <Button
        variant="secondary"
        size="sm"
        onClick={() => setOpen(true)}
        disabled={!hasEmail}
        title={hasEmail ? undefined : "No email address on file for this client"}
      >
        Send by email
      </Button>
      {open && (
        <Modal title="Send quote by email?" onClose={close}>
          <div className={modalStyles.form}>
            {sent ? (
              <p>Sent to {clientEmail}.</p>
            ) : (
              <p>
                Email this quote (with the PDF attached) to <strong>{clientEmail}</strong>?
              </p>
            )}
            {statusWarning && <span className={modalStyles.error}>{statusWarning}</span>}
            {error && <span className={modalStyles.error}>{error}</span>}
            <div className={modalStyles.actions}>
              {sent ? (
                <Button variant="primary" onClick={close}>
                  Done
                </Button>
              ) : (
                <>
                  <Button variant="ghost" onClick={close} disabled={sending}>
                    Cancel
                  </Button>
                  <Button variant="primary" onClick={confirmSend} disabled={sending}>
                    {sending ? "Sending…" : "Send"}
                  </Button>
                </>
              )}
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
