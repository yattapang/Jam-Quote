"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import { createLabourRate, type Trade } from "@/lib/api-client";
import LabourRateForm, {
  labourRatePayloadFromValues,
  type LabourRateFormValues,
} from "@/components/forms/LabourRateForm";

export default function AddLabourRateButton({ trades }: { trades: Trade[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(values: LabourRateFormValues) {
    await createLabourRate(labourRatePayloadFromValues(values));
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      <Button variant="primary" onClick={() => setOpen(true)}>
        Add labour rate
      </Button>
      {open && (
        <Modal title="Add labour rate" onClose={() => (busy ? undefined : setOpen(false))}>
          <LabourRateForm
            trades={trades}
            submitLabel="Save labour rate"
            onCancel={() => setOpen(false)}
            onSubmit={handleSubmit}
            onBusyChange={setBusy}
          />
        </Modal>
      )}
    </>
  );
}
