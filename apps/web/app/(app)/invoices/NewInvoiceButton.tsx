"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Modal, { modalStyles } from "@/components/ui/Modal";
import ClientSelectField from "@/components/forms/ClientSelectField";
import { createInvoice } from "@/lib/api-client";
import type { ClientOption } from "@/components/forms/types";

/**
 * Raise an invoice with no source quote (#27 follow-on).
 *
 * Not every invoice starts as an estimate — a call-out, a repeat job, or
 * materials already supplied have nothing to convert from. Previously the only
 * route to an invoice was to first invent a quote for work already agreed.
 *
 * This deliberately collects only the header — client and due date — then
 * hands off to the existing DRAFT editor for the lines, rather than
 * duplicating that whole builder. The client is asked for HERE because
 * InvoiceBuilder has no client field: a from-quote invoice inherits one from
 * its quote, so there was never anywhere to choose it.
 */
export default function NewInvoiceButton({ clients }: { clients: ClientOption[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState(clients);
  const [clientId, setClientId] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const invoice = await createInvoice({
        clientId: clientId || undefined,
        dueDate: dueDate || undefined,
      });
      // Straight into the editor: an invoice with no lines isn't finishable,
      // so dropping the user on the read-only detail page would just make them
      // find the Edit button themselves.
      router.push(`/invoices/${invoice.id}/edit`);
    } catch {
      setError("Couldn't create the invoice — is the API running?");
      setSaving(false);
    }
  }

  return (
    <>
      <Button variant="primary" size="sm" onClick={() => setOpen(true)}>
        New invoice
      </Button>

      {open && (
        <Modal title="New invoice" onClose={() => (saving ? undefined : setOpen(false))}>
          <form className={modalStyles.form} onSubmit={submit}>
            <ClientSelectField
              clients={options}
              value={clientId}
              onChange={setClientId}
              onCreated={(c) => {
                setOptions((prev) => [...prev, c]);
                setClientId(c.id);
              }}
            />
            <Input
              label="Due date"
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
            />
            {error && <span className={modalStyles.error}>{error}</span>}
            <div className={modalStyles.actions}>
              <Button variant="ghost" type="button" onClick={() => setOpen(false)} disabled={saving}>
                Cancel
              </Button>
              <Button variant="primary" type="submit" disabled={saving}>
                {saving ? "Creating…" : "Create draft"}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
