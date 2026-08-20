"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Button from "@/components/ui/Button";
import Modal, { modalStyles } from "@/components/ui/Modal";
import { sendInvoiceReminder, type InvoiceReminder } from "@/lib/api-client";
import { toIntlPhone } from "../../quotes/[id]/WhatsAppButton";

/**
 * Chase an unpaid invoice (#4).
 *
 * **WhatsApp first, deliberately.** It is how a Jamaican contractor actually
 * chases a client, and it works today — email to clients still needs the
 * verified sending domain, so the email option stays disabled with a reason
 * rather than reporting sends into a void, which is the defect this codebase
 * has now produced twice.
 *
 * The message is composed by the API, not here. Two screens writing their own
 * wording is how the WhatsApp text and the email body end up quoting two
 * different figures.
 */
export default function RemindButton({
  invoiceId,
  clientPhone,
  reminders,
  emailUnavailableReason,
}: {
  invoiceId: string;
  clientPhone?: string;
  reminders: InvoiceReminder[];
  /** Why client email cannot go out, or undefined when it can. */
  emailUnavailableReason?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const hasPhone = Boolean(clientPhone?.trim());
  const last = reminders[0];

  async function chase(channel: "EMAIL" | "WHATSAPP") {
    setBusy(true);
    setError("");
    try {
      const { body } = await sendInvoiceReminder(invoiceId, channel);
      if (channel === "WHATSAPP") {
        // Opened only AFTER the message exists — opening first and filling it
        // in later hands the contractor a half-written chat if the call fails.
        window.open(
          `https://wa.me/${toIntlPhone(clientPhone ?? "")}?text=${encodeURIComponent(body)}`,
          "_blank",
          "noopener,noreferrer",
        );
      }
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't send the reminder.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
        Send reminder
      </Button>
      {/* The count is the whole point of the ledger: nobody remembers whether
          they already chased this one. */}
      {last && (
        <span style={{ fontSize: 11.5, opacity: 0.75 }}>
          Reminded {reminders.length}×, last {new Date(last.sentAt).toLocaleDateString()}
        </span>
      )}
      {open && (
        <Modal title="Send a payment reminder" onClose={() => (busy ? undefined : setOpen(false))}>
          <div className={modalStyles.form}>
            <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.5 }}>
              JamQuote writes the message — it names what is still owed, not the invoice total, and
              never accuses, since the client may have paid this morning.
            </p>
            {error && <span className={modalStyles.error}>{error}</span>}
            <div className={modalStyles.actions}>
              <Button variant="ghost" onClick={() => setOpen(false)} disabled={busy}>
                Cancel
              </Button>
              <Button
                variant="secondary"
                onClick={() => chase("EMAIL")}
                disabled={busy || Boolean(emailUnavailableReason)}
                title={emailUnavailableReason}
              >
                Email
              </Button>
              <Button
                variant="primary"
                onClick={() => chase("WHATSAPP")}
                disabled={busy || !hasPhone}
                title={hasPhone ? undefined : "No phone number on file for this client"}
              >
                {busy ? "Preparing…" : "WhatsApp"}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
