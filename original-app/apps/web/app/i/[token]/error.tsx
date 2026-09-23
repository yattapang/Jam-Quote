"use client";

import { useEffect } from "react";
import styles from "../../q/[token]/shared-quote.module.css";

/**
 * Calm, branded fallback for the public invoice page — the twin of
 * app/q/[token]/error.tsx, and the same reasoning applies: an anonymous
 * client who has never heard of JamQuote must never see Next's generic error
 * screen, "API" anywhere, a stack trace, or an admin-facing action. Only a
 * plain explanation and a retry.
 */
export default function SharedInvoiceError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Public invoice page failed to render:", error);
  }, [error]);

  return (
    <main className={styles.page}>
      <div className={styles.card}>
        <h1 className={styles.title}>This invoice isn&apos;t loading right now</h1>
        <p className={styles.muted}>
          Please try again in a moment. If it still won&apos;t load, ask whoever sent you this link
          to resend it.
        </p>
        <button type="button" className={styles.download} onClick={reset} style={{ border: "none" }}>
          Try again
        </button>
      </div>
    </main>
  );
}
