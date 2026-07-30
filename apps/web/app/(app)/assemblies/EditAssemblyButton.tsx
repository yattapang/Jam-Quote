"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import { updateAssembly } from "@/lib/api-client";
import AssemblyForm, {
  assemblyFormValuesFromAssembly,
  assemblyPayloadFromValues,
  type AssemblyFormValues,
} from "@/components/forms/AssemblyForm";
import type { Assembly, LabourRate, MaterialFavourite } from "@/lib/types";

/** Per-row edit action on the job-type library — mirrors EditLabourRateButton:
 * pre-fills the builder from the existing assembly's components and PATCHes
 * (sending `components` replaces the full recipe) instead of POSTing. */
export default function EditAssemblyButton({
  assembly,
  materials,
  labourRates,
}: {
  assembly: Assembly;
  materials: MaterialFavourite[];
  labourRates: LabourRate[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(values: AssemblyFormValues) {
    await updateAssembly(assembly.id, assemblyPayloadFromValues(values));
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      <Button variant="outlineAccent" size="sm" onClick={() => setOpen(true)}>
        Edit
      </Button>
      {open && (
        <Modal title="Edit job type" onClose={() => (busy ? undefined : setOpen(false))} wide>
          <AssemblyForm
            initial={assemblyFormValuesFromAssembly(assembly)}
            materials={materials}
            labourRates={labourRates}
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
