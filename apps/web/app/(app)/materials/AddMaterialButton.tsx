"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import { createMaterialFavourite } from "@/lib/api-client";
import MaterialForm, { materialPayloadFromValues, type MaterialFormValues } from "@/components/forms/MaterialForm";

export default function AddMaterialButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(values: MaterialFormValues) {
    await createMaterialFavourite(materialPayloadFromValues(values));
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      <Button variant="primary" onClick={() => setOpen(true)}>
        Add material
      </Button>
      {open && (
        <Modal title="Add material" onClose={() => (busy ? undefined : setOpen(false))}>
          <MaterialForm submitLabel="Save material" onCancel={() => setOpen(false)} onSubmit={handleSubmit} onBusyChange={setBusy} />
        </Modal>
      )}
    </>
  );
}
