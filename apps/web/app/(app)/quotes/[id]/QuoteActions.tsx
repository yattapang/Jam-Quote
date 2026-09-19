"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { QuoteStatus } from "@jamquote/core";
import Button from "@/components/ui/Button";
import DeleteRowButton from "@/components/ui/DeleteRowButton";
import Modal, { modalStyles } from "@/components/ui/Modal";
import { createInvoiceFromQuote, reviseQuote, setQuoteStatus } from "@/lib/api-client";
import WhatsAppButton, { type WhatsAppButtonHandle } from "./WhatsAppButton";
import EmailQuoteButton, { type EmailQuoteButtonHandle } from "./EmailQuoteButton";

import { errorMessage } from "@/lib/error-message";
/**
 * Header actions for the quote detail page.
 *
 * One PRIMARY action per status (2026-09-18 owner decision — PLANNING.md
 * "Quote screen actions"), everything else secondary, Delete set apart from
 * the group entirely (see DeleteRowButton, styled on its own):
 *
 *   DRAFT              -> Send (opens a chooser: WhatsApp / email / mark as
 *                          sent by another channel — see the "Send" comment
 *                          below for why a chooser and not one channel)
 *   SENT, VIEWED        -> Mark accepted (the next money-forward step; only
 *                          an ACCEPTED quote can be converted to an invoice)
 *   ACCEPTED            -> Convert to invoice
 *   DECLINED, EXPIRED,
 *   INVOICED            -> none (terminal for this screen — only Revise,
 *                          secondary, applies)
 *
 * "Mark as sent" bookkeeping-only vs. actually emailing/WhatsApping (#35) is
 * unchanged: emailing still advances DRAFT -> SENT itself via
 * EmailQuoteButton, WhatsApp still does not (it has no delivery receipt to
 * hang a status flip on). The Send chooser does not reimplement either flow —
 * it drives the exact same WhatsAppButton/EmailQuoteButton instances through
 * an imperative handle, so there is exactly one place each channel's logic
 * lives.
 */
export default function QuoteActions({
  id,
  status,
  quoteNum,
  clientName,
  clientPhone,
  clientEmail,
  totalCents,
  emailUnavailableReason,
}: {
  id: string;
  status: QuoteStatus;
  quoteNum: string;
  clientName?: string;
  clientPhone?: string;
  clientEmail?: string;
  totalCents: number;
  emailUnavailableReason?: string;
}) {
  const router = useRouter();
  const whatsappRef = useRef<WhatsAppButtonHandle>(null);
  const emailRef = useRef<EmailQuoteButtonHandle>(null);

  const [sendChooserOpen, setSendChooserOpen] = useState(false);
  const [markSentOpen, setMarkSentOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState("");
  const [reviseOpen, setReviseOpen] = useState(false);
  const [revising, setRevising] = useState(false);
  const [reviseError, setReviseError] = useState("");
  const [converting, setConverting] = useState(false);
  const [convertError, setConvertError] = useState("");
  const [outcome, setOutcome] = useState<QuoteStatus | null>(null);
  const [recording, setRecording] = useState(false);
  const [outcomeError, setOutcomeError] = useState("");

  async function convertToInvoice() {
    setConverting(true);
    setConvertError("");
    try {
      const { id: invoiceId } = await createInvoiceFromQuote(id);
      router.push(`/invoices/${invoiceId}/edit`);
    } catch (err) {
      // The API's own message names the reason (e.g. "quote is not
      // ACCEPTED" or "already converted to an invoice") — surface it as-is
      // rather than a generic failure text.
      setConvertError(errorMessage(err, "Couldn't convert to invoice — check your connection and try again."));
      setConverting(false);
    }
  }

  async function confirmMarkSent() {
    setSending(true);
    setSendError("");
    try {
      await setQuoteStatus(id, QuoteStatus.SENT);
      setMarkSentOpen(false);
      setSendChooserOpen(false);
      router.refresh();
    } catch (err) {
      setSendError(errorMessage(err, "Couldn't send — check your connection and try again."));
    } finally {
      setSending(false);
    }
  }

  async function confirmRevise() {
    setRevising(true);
    setReviseError("");
    try {
      const { id: newId } = await reviseQuote(id);
      setReviseOpen(false);
      router.push(`/quotes/${newId}/edit`);
    } catch (err) {
      setReviseError(errorMessage(err, "Couldn't create a revision — check your connection and try again."));
      setRevising(false);
    }
  }

  // Shared everywhere: a contractor may re-send by WhatsApp or email from
  // any status, not only DRAFT (a re-sent quote is common after a client
  // asks "can you send that again?").
  const channelButtons = (
    <>
      <WhatsAppButton
        ref={whatsappRef}
        quoteId={id}
        quoteNum={quoteNum}
        clientName={clientName}
        clientPhone={clientPhone}
        totalCents={totalCents}
      />
      <EmailQuoteButton
        ref={emailRef}
        quoteId={id}
        clientEmail={clientEmail}
        status={status}
        unavailableReason={emailUnavailableReason}
      />
    </>
  );

  const deleteButton = (
    <DeleteRowButton
      kind="quote"
      id={id}
      confirmMessage="Delete this quote? This can't be undone."
      redirectTo="/quotes"
    />
  );

  if (status === QuoteStatus.DRAFT) {
    return (
      <>
        <Button href={`/quotes/${id}/edit`} variant="secondary" size="sm">
          Edit
        </Button>
        {channelButtons}
        {/* THE primary action for a draft: getting it in front of the
            client. WhatsApp and hand delivery are the primary channels in
            this market, email is the formal alternative, and "sent some
            other way" still needs recording — so Send opens a chooser
            rather than guessing one channel and hiding the other two behind
            equal-weight buttons. */}
        <Button variant="primary" size="sm" onClick={() => setSendChooserOpen(true)}>
          Send
        </Button>
        {deleteButton}
        {sendChooserOpen && (
          <Modal title="Send this quote" onClose={() => setSendChooserOpen(false)}>
            <div className={modalStyles.form}>
              <p>Choose how to send it. Any of these will do.</p>
              {sendError && <span className={modalStyles.error}>{sendError}</span>}
              <div className={modalStyles.actions} style={{ flexDirection: "column", alignItems: "stretch" }}>
                <Button
                  variant="secondary"
                  disabled={whatsappRef.current?.disabled}
                  onClick={() => {
                    setSendChooserOpen(false);
                    whatsappRef.current?.open();
                  }}
                >
                  WhatsApp
                </Button>
                <Button
                  variant="secondary"
                  disabled={!clientEmail?.trim() || !!emailUnavailableReason}
                  onClick={() => {
                    setSendChooserOpen(false);
                    emailRef.current?.open();
                  }}
                >
                  Email
                </Button>
                <Button variant="secondary" onClick={() => setMarkSentOpen(true)}>
                  Mark as sent (sent another way)
                </Button>
                <Button variant="ghost" onClick={() => setSendChooserOpen(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          </Modal>
        )}
        {markSentOpen && (
          <Modal title="Mark as sent?" onClose={() => (sending ? undefined : setMarkSentOpen(false))}>
            <div className={modalStyles.form}>
              <p>
                Use this if you sent the quote yourself — by WhatsApp, in person, or
                any other way. <strong>Nothing is emailed.</strong>
              </p>
              <p>It moves out of Draft and can no longer be edited directly.</p>
              {sendError && <span className={modalStyles.error}>{sendError}</span>}
              <div className={modalStyles.actions}>
                <Button variant="ghost" onClick={() => setMarkSentOpen(false)} disabled={sending}>
                  Cancel
                </Button>
                <Button variant="primary" onClick={confirmMarkSent} disabled={sending}>
                  {sending ? "Saving…" : "Mark as sent"}
                </Button>
              </div>
            </div>
          </Modal>
        )}
      </>
    );
  }

  async function confirmOutcome() {
    if (!outcome) return;
    setRecording(true);
    setOutcomeError("");
    try {
      await setQuoteStatus(id, outcome);
      setOutcome(null);
      router.refresh();
    } catch (err) {
      setOutcomeError(errorMessage(err, "Couldn't record that — check your connection and try again."));
    } finally {
      setRecording(false);
    }
  }

  // The client's answer can be recorded from SENT or VIEWED. Without this the
  // quote could never reach ACCEPTED, so "Convert to invoice" below — which
  // only renders for ACCEPTED — was unreachable and the loop dead-ended.
  const awaitingAnswer = status === QuoteStatus.SENT || status === QuoteStatus.VIEWED;

  return (
    <>
      {channelButtons}
      {awaitingAnswer && (
        <>
          {/* Primary: the money-forward step. Declining is the real, valid
              alternative outcome, so it stays available — just secondary,
              not fighting Accept for attention. */}
          <Button variant="primary" size="sm" onClick={() => setOutcome(QuoteStatus.ACCEPTED)}>
            Mark accepted
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setOutcome(QuoteStatus.DECLINED)}>
            Mark declined
          </Button>
        </>
      )}
      {outcome && (
        <Modal
          title={outcome === QuoteStatus.ACCEPTED ? "Mark as accepted?" : "Mark as declined?"}
          onClose={() => (recording ? undefined : setOutcome(null))}
        >
          <div className={modalStyles.form}>
            <p>
              {outcome === QuoteStatus.ACCEPTED
                ? "Record that the client accepted this quote. You'll then be able to convert it to an invoice."
                : "Record that the client declined this quote. It can still be revised into a new draft."}
            </p>
            {outcomeError && <span className={modalStyles.error}>{outcomeError}</span>}
            <div className={modalStyles.actions}>
              <Button variant="ghost" onClick={() => setOutcome(null)} disabled={recording}>
                Cancel
              </Button>
              <Button variant="primary" onClick={confirmOutcome} disabled={recording}>
                {recording ? "Saving…" : "Confirm"}
              </Button>
            </div>
          </div>
        </Modal>
      )}
      {status === QuoteStatus.ACCEPTED && (
        <Button variant="primary" size="sm" onClick={convertToInvoice} disabled={converting}>
          {converting ? "Converting…" : "Convert to invoice"}
        </Button>
      )}
      <Button variant="secondary" size="sm" onClick={() => setReviseOpen(true)}>
        Revise
      </Button>
      {/* Delete stays DRAFT-only — the API itself rejects deleting any other
          status, so it is intentionally not rendered here. */}
      {convertError && <span style={{ color: "var(--jq-crit)", fontSize: 12.5 }}>{convertError}</span>}
      {reviseOpen && (
        <Modal title="Create a revision?" onClose={() => (revising ? undefined : setReviseOpen(false))}>
          <div className={modalStyles.form}>
            <p>This creates a new DRAFT version of this quote for you to edit — the current version is unchanged.</p>
            {reviseError && <span className={modalStyles.error}>{reviseError}</span>}
            <div className={modalStyles.actions}>
              <Button variant="ghost" onClick={() => setReviseOpen(false)} disabled={revising}>
                Cancel
              </Button>
              <Button variant="primary" onClick={confirmRevise} disabled={revising}>
                {revising ? "Creating…" : "Revise"}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
