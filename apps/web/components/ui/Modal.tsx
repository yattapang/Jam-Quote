"use client";

import styles from "./Modal.module.css";

export default function Modal({
  title,
  onClose,
  children,
  wide,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  /** Widens the modal card (460px -> 680px) for content that needs more
   * horizontal room, e.g. the job component builder's per-row fields. */
  wide?: boolean;
}) {
  return (
    <div className={styles.backdrop} onClick={onClose} role="dialog" aria-modal="true">
      <div className={`${styles.card} ${wide ? styles.cardWide : ""}`} onClick={(e) => e.stopPropagation()}>
        <div className={styles.head}>
          <h2 className={styles.title}>{title}</h2>
          <button className={styles.close} onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export { styles as modalStyles };
