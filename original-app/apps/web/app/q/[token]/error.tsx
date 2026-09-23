"use client";

import { useEffect } from "react";
import styles from "./shared-quote.module.css";

/**
 * Calm, branded fallback for the public quote page.
 *
 * Without this, an API outage or an unhandled exception in the server
 * component above surfaces Next's generic error screen to an anonymous
 * client who has never heard of JamQuote and has no idea what "Application
 * error: a client-side exception has occurred" means. This must never say
 * "API", never show a stack trace or the error's own message (which can
 * carry internal detail — see the `error` param below, deliberately unused
 * in the markup), and must offer nothing an admin would need: there is no
 * sign-in, no retry-with-diagnostics, nothing but "try again" and a way to
 * reach the business the old-fashioned way.
 */
export default function SharedQuoteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Logged for the contractor/ops to find later, never rendered.
    console.error("Public quote page failed to render:", error);
  }, [error]);

  return (
    <main className={styles.page}>
      <div className={styles.card}>
        <h1 className={styles.title}>This quote isn&apos;t loading right now</h1>
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
