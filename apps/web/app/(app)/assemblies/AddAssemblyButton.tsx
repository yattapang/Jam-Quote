"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import { createAssembly } from "@/lib/api-client";
import AssemblyForm, { assemblyPayloadFromValues, type AssemblyFormValues } from "@/components/forms/AssemblyForm";
import type { LabourRate, MaterialFavourite } from "@/lib/types";

export default function AddAssemblyButton({
  materials,
  labourRates,
}: {
  materials: MaterialFavourite[];
  labourRates: LabourRate[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(values: AssemblyFormValues) {
    await createAssembly(assemblyPayloadFromValues(values));
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      <Button variant="primary" onClick={() => setOpen(true)}>
        + New job type
      </Button>
      {open && (
        <Modal title="Add job type" onClose={() => (busy ? undefined : setOpen(false))} wide>
          <AssemblyForm
            materials={materials}
            labourRates={labourRates}
            submitLabel="Save job type"
            onCancel={() => setOpen(false)}
            onSubmit={handleSubmit}
            onBusyChange={setBusy}
          />
        </Modal>
      )}
    </>
  );
}
