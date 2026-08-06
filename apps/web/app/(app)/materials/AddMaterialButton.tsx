"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import { createMaterialFavourite, type ApiMaterialCategory } from "@/lib/api-client";
import MaterialForm, { materialPayloadFromValues, type MaterialFormValues } from "@/components/forms/MaterialForm";
import { invalidateMaterialSchema } from "@/lib/use-material-schema";

export default function AddMaterialButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(values: MaterialFormValues, category: ApiMaterialCategory | undefined) {
    await createMaterialFavourite(materialPayloadFromValues(values, category));
    // A new spec value becomes this business's own option server-side, so the
    // cached schema is stale until we drop it.
    invalidateMaterialSchema();
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
