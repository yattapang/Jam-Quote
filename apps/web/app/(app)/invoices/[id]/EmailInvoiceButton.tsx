"use client";

import { useState } from "react";
import Button from "@/components/ui/Button";
import Modal, { modalStyles } from "@/components/ui/Modal";

interface EmailInvoiceButtonProps {
  invoiceId: string;
  clientEmail?: string;
  /** Why sending is unavailable, or undefined when it works. Mirrors
   * EmailQuoteButton — the two must not disagree about whether mail can go. */
  unavailableReason?: string;
}

/** Client island: confirms, then POSTs to the email send route. Mirrors
 * EmailQuoteButton — an outward action always confirms first. */
export default function EmailInvoiceButton({
  invoiceId,
  clientEmail,
  unavailableReason,
}: EmailInvoiceButtonProps) {
  const hasEmail = Boolean(clientEmail && clientEmail.trim());
  const [open, setOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);

  async function confirmSend() {
    setSending(true);
    setError("");
    try {
      const res = await fetch(`/invoices/${invoiceId}/email`, { method: "POST" });
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
        // `unavailableReason` was threaded in from the page and then DROPPED
        // here, so the invoice email button stayed live while the quote one
        // was correctly disabled. The prop was declared and never read; the
        // lint warning saying so was printed in every build and never acted
        // on. Mirrors EmailQuoteButton exactly now, on purpose — the two must
        // not disagree about whether mail can go.
        disabled={!hasEmail || !!unavailableReason}
        title={
          unavailableReason ??
          (hasEmail ? undefined : "No email address on file for this client")
        }
      >
        Send by email
      </Button>
      {/* Stated in the open, not just as a tooltip: on a phone there is no
          hover, and a disabled button with no explanation reads as a bug. */}
      {unavailableReason && (
        <span style={{ fontSize: 11.5, color: "var(--muted)", maxWidth: 260, lineHeight: 1.35 }}>
          {unavailableReason}
        </span>
      )}
      {open && (
        <Modal title="Send invoice by email?" onClose={close}>
          <div className={modalStyles.form}>
            {sent ? (
              <p>Sent to {clientEmail}.</p>
            ) : (
              <p>
                Email this invoice (with the PDF attached) to <strong>{clientEmail}</strong>?
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
