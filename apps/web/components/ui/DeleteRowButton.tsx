"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Button from "./Button";
import Modal, { modalStyles } from "./Modal";
import {
  ApiError,
  deleteJob,
  deleteClient,
  deleteInvoice,
  deleteProject,
  deleteLabourRate,
  deleteEquipmentItem,
  deleteMaterialFavourite,
  deleteQuote,
} from "@/lib/api-client";
import styles from "./DeleteRowButton.module.css";

const DELETERS: Record<DeleteKind, (id: string) => Promise<void>> = {
  client: deleteClient,
  project: deleteProject,
  quote: deleteQuote,
  material: deleteMaterialFavourite,
  labourRate: deleteLabourRate,
  equipment: deleteEquipmentItem,
  job: deleteJob,
  invoice: deleteInvoice,
};

export type DeleteKind = "client" | "project" | "quote" | "material" | "labourRate" | "equipment" | "job" | "invoice";

/**
 * Small, unobtrusive per-row delete affordance. Always confirms via a Modal
 * before deleting the entity, then either navigates to `redirectTo` or
 * `router.refresh()`es the current list. Props are all serializable (kind +
 * id), so this is safe to render directly from a Server Component — passing a
 * function like `onDelete` across the server/client boundary is not allowed.
 * Stops event propagation on its own trigger so it's safe to drop into rows
 * that are themselves clickable (e.g. a row wrapped in a navigation handler).
 */
export default function DeleteRowButton({
  kind,
  id,
  label = "Delete",
  confirmMessage,
  redirectTo,
  disabledReason,
}: {
  kind: DeleteKind;
  id: string;
  label?: string;
  confirmMessage: string;
  /** Where to go after deleting. Omit to refresh the current route in place. */
  redirectTo?: string;
  /**
   * Why this row cannot be deleted, when it cannot. Set it and the control
   * explains itself instead of offering an action that can only fail.
   *
   * Offering Delete on a quote the API will refuse is how the owner met
   * "Couldn't delete — is the API running?" on a rule that had nothing to do
   * with the API.
   */
  disabledReason?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function confirm() {
    setSaving(true);
    setError("");
    try {
      await DELETERS[kind](id);
      setOpen(false);
      if (redirectTo) router.push(redirectTo);
      else router.refresh();
    } catch (err) {
      // The API's OWN message, when it sent one. This used to be a bare catch
      // that discarded the error and guessed at the cause, so a deliberate
      // rule — "Only DRAFT quotes can be deleted" — reached the contractor as
      // "is the API running?", sending them to check infrastructure over a
      // business rule. Reporting the wrong cause is worse than reporting none.
      setError(
        err instanceof ApiError && err.message
          ? err.message
          : "Couldn't delete — is the API running?",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <button
        type="button"
        className={styles.trigger}
        // Not `disabled`: a dead control with no explanation reads as a bug,
        // and `title` alone is invisible on the phone this is mostly used on.
        // It still opens the modal, which says why.
        aria-disabled={disabledReason ? true : undefined}
        title={disabledReason}
        style={disabledReason ? { opacity: 0.45 } : undefined}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen(true);
        }}
      >
        {label}
      </button>
      {open && (
        // Some rows (e.g. quotes) are themselves click-to-navigate; stop the
        // modal's clicks (including a backdrop dismiss) from bubbling into it.
        <div onClick={(e) => e.stopPropagation()}>
          <Modal
            title={disabledReason ? "Can't delete this" : "Delete?"}
            onClose={() => (saving ? null : setOpen(false))}
          >
            <div className={modalStyles.form}>
              <p>{disabledReason ?? confirmMessage}</p>
              {error && <span className={modalStyles.error}>{error}</span>}
              <div className={modalStyles.actions}>
                {disabledReason ? (
                  <Button variant="primary" onClick={() => setOpen(false)}>
                    Close
                  </Button>
                ) : (
                  <>
                    <Button variant="ghost" onClick={() => setOpen(false)} disabled={saving}>
                      Cancel
                    </Button>
                    <Button variant="danger" onClick={confirm} disabled={saving}>
                      {saving ? "Deleting…" : "Delete"}
                    </Button>
                  </>
                )}
              </div>
            </div>
          </Modal>
        </div>
      )}
    </>
  );
}
