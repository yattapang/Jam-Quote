"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import { updateMaterialFavourite, type ApiMaterialCategory } from "@/lib/api-client";
import MaterialForm, {
  materialFormValuesFromMaterial,
  materialPayloadFromValues,
  type MaterialFormValues,
} from "@/components/forms/MaterialForm";
import type { MaterialFavourite } from "@/lib/types";
import { invalidateMaterialSchema } from "@/lib/use-material-schema";

/** Per-row edit action on the materials catalog — mirrors EditLabourRateButton:
 * pre-fills the form (including category + specs) from the existing material
 * and PATCHes instead of POSTing. */
export default function EditMaterialButton({ material }: { material: MaterialFavourite }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(values: MaterialFormValues, category: ApiMaterialCategory | undefined) {
    await updateMaterialFavourite(material.id, materialPayloadFromValues(values, category));
    invalidateMaterialSchema();
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      <Button variant="outlineAccent" size="sm" onClick={() => setOpen(true)}>
        Edit
      </Button>
      {open && (
        <Modal title="Edit material" onClose={() => (busy ? undefined : setOpen(false))}>
          <MaterialForm
            initial={materialFormValuesFromMaterial(material)}
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
