"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import { createJob } from "@/lib/api-client";
import JobForm, { jobPayloadFromValues, type JobFormValues } from "@/components/forms/JobForm";
import type { ClientOption } from "@/components/forms/types";

export default function AddJobButton({ clients }: { clients: ClientOption[] }) {
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
        New job
      </Button>
      {open && (
        <Modal title="New job" onClose={() => (busy ? undefined : setOpen(false))}>
          <JobForm clients={clients} submitLabel="Save job" onCancel={() => setOpen(false)} onSubmit={handleSubmit} onBusyChange={setBusy} />
        </Modal>
      )}
    </>
  );
}
