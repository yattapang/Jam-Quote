"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Button from "./Button";
import Modal, { modalStyles } from "./Modal";
import { deleteClient, deleteJob, deleteQuote } from "@/lib/api-client";
import styles from "./DeleteRowButton.module.css";

const DELETERS: Record<DeleteKind, (id: string) => Promise<void>> = {
  client: deleteClient,
  job: deleteJob,
  quote: deleteQuote,
};

export type DeleteKind = "client" | "job" | "quote";

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
}: {
  kind: DeleteKind;
  id: string;
  label?: string;
  confirmMessage: string;
  /** Where to go after deleting. Omit to refresh the current route in place. */
  redirectTo?: string;
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
    } catch {
      setError("Couldn't delete — is the API running?");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <button
        type="button"
        className={styles.trigger}
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
          <Modal title="Delete?" onClose={() => (saving ? null : setOpen(false))}>
            <div className={modalStyles.form}>
              <p>{confirmMessage}</p>
              {error && <span className={modalStyles.error}>{error}</span>}
              <div className={modalStyles.actions}>
                <Button variant="ghost" onClick={() => setOpen(false)} disabled={saving}>
                  Cancel
                </Button>
                <Button variant="danger" onClick={confirm} disabled={saving}>
                  {saving ? "Deleting…" : "Delete"}
                </Button>
              </div>
            </div>
          </Modal>
        </div>
      )}
    </>
  );
}
