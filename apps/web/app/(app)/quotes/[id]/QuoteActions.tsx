"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { QuoteStatus } from "@jamquote/core";
import Button from "@/components/ui/Button";
import DeleteRowButton from "@/components/ui/DeleteRowButton";
import Modal, { modalStyles } from "@/components/ui/Modal";
import { deleteQuote, reviseQuote, setQuoteStatus } from "@/lib/api-client";

/**
 * Header actions for the quote detail page. DRAFT quotes can be edited, sent
 * (DRAFT -> SENT), or deleted; any other status can be revised into a new
 * DRAFT copy (see ALLOWED_TRANSITIONS / revise in quotes.service.ts). Every
 * state-changing action confirms via a Modal before calling the API.
 */
export default function QuoteActions({ id, status }: { id: string; status: QuoteStatus }) {
  const router = useRouter();
  const [sendOpen, setSendOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState("");
  const [reviseOpen, setReviseOpen] = useState(false);
  const [revising, setRevising] = useState(false);
  const [reviseError, setReviseError] = useState("");

  async function confirmSend() {
    setSending(true);
    setSendError("");
    try {
      await setQuoteStatus(id, QuoteStatus.SENT);
      setSendOpen(false);
      router.refresh();
    } catch {
      setSendError("Couldn't send — is the API running?");
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
    } catch {
      setReviseError("Couldn't create a revision — is the API running?");
      setRevising(false);
    }
  }

  if (status === QuoteStatus.DRAFT) {
    return (
      <>
        <Button href={`/quotes/${id}/edit`} variant="outlineAccent" size="sm">
          Edit
        </Button>
        <Button variant="primary" size="sm" onClick={() => setSendOpen(true)}>
          Send
        </Button>
        <DeleteRowButton
          confirmMessage="Delete this quote? This can't be undone."
          onDelete={async () => {
            await deleteQuote(id);
            router.push("/quotes");
          }}
        />
        {sendOpen && (
          <Modal title="Send quote?" onClose={() => (sending ? undefined : setSendOpen(false))}>
            <div className={modalStyles.form}>
              <p>Mark this quote as sent to the client? It moves out of Draft and can no longer be edited directly.</p>
              {sendError && <span className={modalStyles.error}>{sendError}</span>}
              <div className={modalStyles.actions}>
                <Button variant="ghost" onClick={() => setSendOpen(false)} disabled={sending}>
                  Cancel
                </Button>
                <Button variant="primary" onClick={confirmSend} disabled={sending}>
                  {sending ? "Sending…" : "Send"}
                </Button>
              </div>
            </div>
          </Modal>
        )}
      </>
    );
  }

  return (
    <>
      <Button variant="outlineAccent" size="sm" onClick={() => setReviseOpen(true)}>
        Revise
      </Button>
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
