"use client";

import { useEffect, useId, useRef } from "react";
import styles from "./Modal.module.css";

/**
 * Registry of every mounted Modal's id and card element, in registration order.
 *
 * Modals can nest (an inline "add new" modal opened from a form that is
 * itself inside a modal, rendered inline with no portal - so its DOM lands
 * inside the outer modal's card). Escape and the focus trap must act on the
 * TOP modal only - a keydown listener on every open modal would otherwise
 * close or trap focus in all of them at once.
 *
 * "Top" is resolved by DOM containment rather than push order: a modal that
 * has another registered modal's card nested inside its own DOM subtree is
 * never top, regardless of which mounted first. This matters because React
 * fires effects bottom-up on a shared commit - when both an outer and inner
 * modal mount in the same render, the inner (child) modal's effect runs
 * BEFORE the outer's, so naive last-pushed-wins bookkeeping picks the wrong
 * one. Containment also resolves correctly when they mount in the more
 * common case of separate commits (inner opened later via a click inside
 * the outer). Ties between unrelated, non-nested modals fall back to
 * registration order (last mounted wins).
 */
const modalRegistry: { id: string; el: HTMLElement }[] = [];

function isTopModal(id: string) {
  const self = modalRegistry.find((m) => m.id === id);
  if (!self) return false;

  const hasNestedModal = modalRegistry.some((m) => m.id !== id && self.el.contains(m.el));
  if (hasNestedModal) return false;

  // Leaf modals (nothing nested inside them): the most recently registered
  // one is authoritative.
  const leaves = modalRegistry.filter(
    (m) => !modalRegistry.some((other) => other.id !== m.id && m.el.contains(other.el)),
  );
  return leaves[leaves.length - 1]?.id === id;
}

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "textarea:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

export default function Modal({
  title,
  onClose,
  children,
  wide,
  closeOnBackdrop,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  /** Widens the modal card (460px -> 680px) for content that needs more
   * horizontal room, e.g. the job component builder's per-row fields. */
  wide?: boolean;
  /**
   * Opt-in: close when the backdrop is clicked. Default false.
   *
   * Backdrop-closes-on-click was the old behaviour, and a single mis-click
   * outside the card could silently discard a half-filled form. Escape and
   * the visible x button remain reliable, explicit ways to close, so the
   * safer default is to require callers to opt in when they actually want
   * click-outside-to-dismiss (e.g. a read-only preview with nothing to lose).
   */
  closeOnBackdrop?: boolean;
}) {
  const cardRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const idRef = useRef<string>(titleId);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  // Register on the modal registry, move focus in, and restore it on unmount.
  useEffect(() => {
    const id = idRef.current;
    const card = cardRef.current;
    if (card) modalRegistry.push({ id, el: card });
    previouslyFocused.current = document.activeElement as HTMLElement | null;

    if (card) {
      // Content first, chrome (the x button) last: a caller's own field is a
      // far more useful first focus than the close button, so the close
      // button is excluded here even though it participates in the Tab trap
      // below. Falls back to the dialog itself when there is no content to
      // focus (e.g. a confirmation dialog with only buttons in its footer...
      // actually those ARE focusable, so this only triggers for pure text).
      const first = Array.from(card.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).find(
        (el) => !el.hasAttribute("data-modal-chrome"),
      );
      (first ?? card).focus();
    }

    return () => {
      const idx = modalRegistry.findIndex((m) => m.id === id);
      if (idx !== -1) modalRegistry.splice(idx, 1);
      const toRestore = previouslyFocused.current;
      if (toRestore && document.contains(toRestore)) {
        toRestore.focus();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Escape-to-close and the Tab focus trap, both gated to the top modal.
  useEffect(() => {
    const id = idRef.current;

    function onKeyDown(e: KeyboardEvent) {
      if (!isTopModal(id)) return;

      // An IME (e.g. composing Japanese/Chinese/Korean text) uses Escape to
      // cancel the current composition, not to close the surrounding UI.
      // `isComposing` is the standard signal; `keyCode === 229` is the
      // fallback some browsers (notably older Safari) send instead for a
      // composition-related key.
      if (e.isComposing || e.keyCode === 229) return;

      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }

      if (e.key === "Tab") {
        const card = cardRef.current;
        if (!card) return;
        const focusable = Array.from(card.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
        if (focusable.length === 0) {
          e.preventDefault();
          card.focus();
          return;
        }
        const first = focusable[0]!;
        const last = focusable[focusable.length - 1]!;
        const active = document.activeElement;

        if (e.shiftKey) {
          if (active === first || !card.contains(active)) {
            e.preventDefault();
            last.focus();
          }
        } else if (active === last || !card.contains(active)) {
          e.preventDefault();
          first.focus();
        }
      }
    }

    // Capture phase so the top modal's listener sees the event before a
    // sibling/ancestor modal's own document-level listener does.
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [onClose]);

  function handleBackdropClick() {
    if (closeOnBackdrop) onClose();
  }

  return (
    <div className={styles.backdrop} onClick={handleBackdropClick}>
      <div
        ref={cardRef}
        className={`${styles.card} ${wide ? styles.cardWide : ""}`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        {children}
        {/* Kept after `children` in DOM order (visually first via CSS
            `order: -1` on .head) so it lands last in the natural tab/focus
            order - see the comment on .card in Modal.module.css. */}
        <div className={styles.head}>
          <h2 className={styles.title} id={titleId}>
            {title}
          </h2>
          <button className={styles.close} onClick={onClose} aria-label="Close" data-modal-chrome>
            ×
          </button>
        </div>
      </div>
    </div>
  );
}

export { styles as modalStyles };
