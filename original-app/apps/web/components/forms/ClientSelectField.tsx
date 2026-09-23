"use client";

import { useState } from "react";
import Select from "@/components/ui/Select";
import Modal from "@/components/ui/Modal";
import ClientForm, { clientPayloadFromValues, type ClientFormValues } from "./ClientForm";
import { createClient } from "@/lib/api-client";
import type { ClientOption } from "./types";

const ADD_NEW = "__add_new_client__";

/**
 * A client <Select> with an inline "+ Add new client…" option. Picking it
 * opens a Modal with ClientForm; on success the new client is appended to
 * the caller's list (via `onCreated`) and immediately selected (via
 * `onChange`) — no navigation, so in-progress work elsewhere on the page
 * (e.g. a quote being built) is never lost.
 */
export default function ClientSelectField({
  label = "Client",
  placeholder = "Select client…",
  clients,
  value,
  onChange,
  onCreated,
}: {
  label?: string;
  placeholder?: string;
  clients: ClientOption[];
  value: string;
  onChange: (clientId: string) => void;
  onCreated: (client: ClientOption) => void;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const options = [
    { value: "", label: placeholder },
    ...clients.map((c) => ({ value: c.id, label: c.name })),
    { value: ADD_NEW, label: "+ Add new client…" },
  ];

  function handleChange(next: string) {
    if (next === ADD_NEW) {
      setOpen(true);
      return;
    }
    onChange(next);
  }

  async function handleCreate(values: ClientFormValues) {
    const created = await createClient(clientPayloadFromValues(values));
    onCreated({ id: created.id, name: created.name });
    onChange(created.id);
    setOpen(false);
  }

  return (
    <>
      <Select label={label} options={options} value={value} onChange={(e) => handleChange(e.target.value)} />
      {open && (
        <Modal title="Add new client" onClose={() => (busy ? undefined : setOpen(false))}>
          <ClientForm
            submitLabel="Add client"
            onCancel={() => setOpen(false)}
            onSubmit={handleCreate}
            onBusyChange={setBusy}
          />
        </Modal>
      )}
    </>
  );
}
