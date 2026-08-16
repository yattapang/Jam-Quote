"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import { createEquipmentItem } from "@/lib/api-client";
import EquipmentForm, {
  equipmentPayloadFromValues,
  type EquipmentFormValues,
} from "@/components/forms/EquipmentForm";

export default function AddEquipmentButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(values: EquipmentFormValues) {
    await createEquipmentItem(equipmentPayloadFromValues(values));
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      <Button variant="primary" onClick={() => setOpen(true)}>
        Add equipment
      </Button>
      {open && (
        <Modal title="Add equipment" onClose={() => (busy ? undefined : setOpen(false))}>
          <EquipmentForm
            submitLabel="Save equipment"
            onCancel={() => setOpen(false)}
            onSubmit={handleSubmit}
            onBusyChange={setBusy}
          />
        </Modal>
      )}
    </>
  );
}
