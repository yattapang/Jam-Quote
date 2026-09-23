"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Button from "@/components/ui/Button";
import { useToast } from "@/components/ui/ToastProvider";
import Modal from "@/components/ui/Modal";
import { updateEquipmentItem } from "@/lib/api-client";
import EquipmentForm, {
  equipmentFormValuesFromItem,
  equipmentEditPayloadFromValues,
  type EquipmentFormValues,
} from "@/components/forms/EquipmentForm";
import type { EquipmentItem } from "@/lib/types";

export default function EditEquipmentButton({ item }: { item: EquipmentItem }) {
  const router = useRouter();
  const { showToast } = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(values: EquipmentFormValues) {
    await updateEquipmentItem(item.id, equipmentEditPayloadFromValues(values));
    showToast("Equipment saved");
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      <Button variant="ghost" onClick={() => setOpen(true)}>
        Edit
      </Button>
      {open && (
        <Modal title="Edit equipment" onClose={() => (busy ? undefined : setOpen(false))}>
          <EquipmentForm
            initial={equipmentFormValuesFromItem(item)}
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
