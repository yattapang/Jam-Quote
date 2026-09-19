"use client";

import Button from "./Button";
import Modal, { modalStyles } from "./Modal";

/**
 * One confirm pattern for a destructive action that isn't a catalog delete
 * (see DeleteRowButton for those). `window.confirm` cannot be styled, is
 * blocked or auto-dismissed by some mobile browsers, and gives no room to
 * name what's being acted on beyond one line — three contractor-facing
 * screens (PaymentsPanel's void, ProjectCosts's two removes,
 * SupplierPricePanel's remove) used it. This is the same Modal + danger
 * Button the delete flow uses, so a contractor sees one confirm pattern
 * everywhere instead of two.
 *
 * `message` should name the item, e.g. "Void this card payment?" — this
 * component renders it as BOTH the dialog title and its body, same as
 * DeleteRowButton.
 */
export default function ConfirmModal({
  message,
  confirmLabel = "Confirm",
  pendingLabel = "Working…",
  pending,
  onConfirm,
  onCancel,
}: {
  message: string;
  confirmLabel?: string;
  pendingLabel?: string;
  pending: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal title={message} onClose={() => (pending ? undefined : onCancel())}>
      <div className={modalStyles.form}>
        <p>{message}</p>
        <div className={modalStyles.actions}>
          <Button variant="ghost" onClick={onCancel} disabled={pending}>
            Cancel
          </Button>
          <Button variant="danger" onClick={onConfirm} disabled={pending}>
            {pending ? pendingLabel : confirmLabel}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
