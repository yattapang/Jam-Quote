"use client";

import styles from "./shared-quote.module.css";

/**
 * "Save as PDF" for the client, via the browser's own print sheet.
 *
 * Deliberately NOT a server-rendered PDF route. QuotePdf needs the full
 * Quote/Client/Business view types, while the public endpoint returns a
 * narrow allow-list — and widening the one unauthenticated response in the
 * API to feed a renderer would trade a security boundary for a convenience.
 *
 * The print sheet offers "Save as PDF" on iOS Safari and Android Chrome as
 * well as desktop, so the client still ends up with a file they can forward.
 */
export default function PrintButton() {
  return (
    <button type="button" className={styles.download} onClick={() => window.print()}>
      Save as PDF
    </button>
  );
}
