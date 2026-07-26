"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import { updateLabourRate, type Trade } from "@/lib/api-client";
import LabourRateForm, {
  labourRateFormValuesFromLabourRate,
  labourRatePayloadFromValues,
  type LabourRateFormValues,
} from "@/components/forms/LabourRateForm";
import type { LabourRate } from "@/lib/types";

/** Per-row edit action on the labour rate book — mirrors EditClientButton:
 * pre-fills a form from the existing rate and PATCHes instead of POSTing. */
export default function EditLabourRateButton({
  rate,
  trades,
}: {
  rate: LabourRate;
  trades: Trade[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(values: LabourRateFormValues) {
    await updateLabourRate(rate.id, labourRatePayloadFromValues(values));
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      <Button variant="outlineAccent" size="sm" onClick={() => setOpen(true)}>
        Edit
      </Button>
      {open && (
        <Modal title="Edit labour rate" onClose={() => (busy ? undefined : setOpen(false))}>
          <LabourRateForm
            initial={labourRateFormValuesFromLabourRate(rate)}
            trades={trades}
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
