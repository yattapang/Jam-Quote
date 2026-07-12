"use client";

import { useState } from "react";
import Button from "@/components/ui/Button";
import Modal, { modalStyles } from "@/components/ui/Modal";

interface EmailQuoteButtonProps {
  quoteId: string;
  clientEmail?: string;
}

/** Client island: confirms, then POSTs to the email send route (an outward
 * action, so — like QuoteActions' send/revise — it always confirms first). */
export default function EmailQuoteButton({ quoteId, clientEmail }: EmailQuoteButtonProps) {
  const hasEmail = Boolean(clientEmail && clientEmail.trim());
  const [open, setOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);

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
