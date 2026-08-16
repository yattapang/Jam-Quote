"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import { updateJob } from "@/lib/api-client";
import JobForm, {
  jobFormValuesFromAssembly,
  jobPayloadFromValues,
  type JobFormValues,
} from "@/components/forms/JobForm";
import type { Job, LabourRate, MaterialFavourite } from "@/lib/types";

/** Per-row edit action on the job-type library — mirrors EditLabourRateButton:
 * pre-fills the builder from the existing job's components and PATCHes
 * (sending `components` replaces the full recipe) instead of POSTing. */
export default function EditJobButton({
  job,
  materials,
  labourRates,
}: {
  job: Job;
  materials: MaterialFavourite[];
  labourRates: LabourRate[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(values: JobFormValues) {
    await updateJob(job.id, jobPayloadFromValues(values));
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
          <JobForm
            initial={jobFormValuesFromAssembly(job)}
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
