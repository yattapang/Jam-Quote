"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import { updateMaterialFavourite, type ApiMaterialCategory } from "@/lib/api-client";
import MaterialForm, {
  materialFormValuesFromMaterial,
  materialPayloadFromValues,
  type AppliedPrice,
  type MaterialFormValues,
} from "@/components/forms/MaterialForm";
import SupplierPricePanel from "@/components/forms/SupplierPricePanel";
import { priceDollarsToCents } from "@/lib/supplier-prices";
import type { MaterialFavourite } from "@/lib/types";
import { invalidateMaterialSchema } from "@/lib/use-material-schema";

/** Per-row edit action on the materials catalog — mirrors EditLabourRateButton:
 * pre-fills the form (including category + specs) from the existing material
 * and PATCHes instead of POSTing. Unlike the add flows it also carries the
 * supplier price comparison, which needs a material that already exists. */
export default function EditMaterialButton({ material }: { material: MaterialFavourite }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [appliedPrice, setAppliedPrice] = useState<AppliedPrice>();

  /** Clears the applied price along with the modal: a price carried over into
   * the next session would re-apply itself the moment the form mounted, which
   * is exactly the silent overwrite the per-row button exists to avoid. */
  function close() {
    setOpen(false);
    setAppliedPrice(undefined);
  }

  async function handleSubmit(values: MaterialFormValues, category: ApiMaterialCategory | undefined) {
    await updateMaterialFavourite(material.id, materialPayloadFromValues(values, category));
    invalidateMaterialSchema();
    close();
    router.refresh();
  }

  // What the price field holds: the saved price until a supplier row is
  // applied, and that row's price afterwards. A price typed by hand is not
  // tracked here — the panel only needs to know which row it already gave you,
  // so it can grey that button out.
  const currentPriceCents = appliedPrice
    ? priceDollarsToCents(appliedPrice.priceDollars)
    : material.priceCents;

  return (
    <>
      <Button variant="outlineAccent" size="sm" onClick={() => setOpen(true)}>
        Edit
      </Button>
      {open && (
        <Modal title="Edit material" onClose={() => (busy ? undefined : close())} wide>
          <MaterialForm
            initial={materialFormValuesFromMaterial(material)}
            submitLabel="Save changes"
            onCancel={close}
            onSubmit={handleSubmit}
            onBusyChange={setBusy}
            appliedPrice={appliedPrice}
          />
          <SupplierPricePanel
            materialFavouriteId={material.id}
            currentPriceCents={currentPriceCents}
            onUsePrice={(priceCents, supplierId) =>
              setAppliedPrice({ priceDollars: String(priceCents / 100), supplierId })
            }
          />
        </Modal>
      )}
    </>
  );
}
