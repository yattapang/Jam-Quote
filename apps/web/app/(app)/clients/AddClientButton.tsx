"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import { createClient } from "@/lib/api-client";
import ClientForm, { clientPayloadFromValues, type ClientFormValues } from "@/components/forms/ClientForm";

export default function AddClientButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(values: ClientFormValues) {
    await createClient(clientPayloadFromValues(values));
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      <Button variant="primary" onClick={() => setOpen(true)}>
        Add client
      </Button>
      {open && (
        <Modal title="Add client" onClose={() => (busy ? undefined : setOpen(false))}>
          <ClientForm submitLabel="Save client" onCancel={() => setOpen(false)} onSubmit={handleSubmit} onBusyChange={setBusy} />
        </Modal>
      )}
    </>
  );
}
