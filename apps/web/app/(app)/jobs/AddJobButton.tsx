"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import { createJob, type Trade } from "@/lib/api-client";
import JobForm, { jobPayloadFromValues, type JobFormValues } from "@/components/forms/JobForm";
import type { EquipmentItem, LabourRate, MaterialFavourite } from "@/lib/types";

export default function AddJobButton({
  materials,
  labourRates,
  trades,
  equipment,
}: {
  materials: MaterialFavourite[];
  labourRates: LabourRate[];
  trades: Trade[];
  equipment: EquipmentItem[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(values: JobFormValues) {
    await createJob(jobPayloadFromValues(values));
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
          <JobForm
            materials={materials}
            labourRates={labourRates}
            trades={trades}
            equipment={equipment}
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
