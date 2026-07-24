"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import { updateClient } from "@/lib/api-client";
import ClientForm, {
  clientFormValuesFromClient,
  clientPayloadFromValues,
  type ClientFormValues,
} from "@/components/forms/ClientForm";
import type { Client } from "@/lib/types";

/** Header action on the client detail page — mirrors AddClientButton but
 * pre-fills from the existing client and PATCHes instead of POSTing. */
export default function EditClientButton({ client }: { client: Client }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(values: ClientFormValues) {
    await updateClient(client.id, clientPayloadFromValues(values));
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      <Button variant="outlineAccent" size="sm" onClick={() => setOpen(true)}>
        Edit
      </Button>
      {open && (
        <Modal title="Edit client" onClose={() => (busy ? undefined : setOpen(false))}>
          <ClientForm
            initial={clientFormValuesFromClient(client)}
            submitLabel="Save changes"
            onCancel={() => setOpen(false)}
            onSubmit={handleSubmit}
            onBusyChange={setBusy}
          />
        </Modal>
      )}
    </>
  );
}
