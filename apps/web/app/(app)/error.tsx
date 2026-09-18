"use client";

import shared from "./shared.module.css";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import styles from "@/components/layout/CatalogLoadError.module.css";

/**
 * Fallback boundary for every app route without its own error.tsx.
 *
 * The four catalog getters now rethrow when the API is reachable but their
 * request failed, rather than returning an empty list. The catalog pages have
 * their own boundaries, but the quote builder, invoice editor, project page and
 * settings also call those getters for their pickers - without this, a single
 * failed catalog request would crash those screens to Next's generic error page.
 * An unreachable API still returns empty lists and shows DemoDataBanner, so this
 * only appears when the server is up and a request on this page failed. No error
 * text or stack trace is shown.
 */
export default function AppError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className={shared.page}>
      <Card>
        <div className={styles.wrap} role="alert">
          <span className={styles.icon} aria-hidden="true">
            ⚠
          </span>
          <div className={styles.copy}>
            <span className={styles.title}>Couldn&apos;t load this page</span>
            <span className={styles.body}>
              The server is up, but part of this page failed to load. Nothing you saved has been
              lost - retry in a moment.
            </span>
          </div>
          <Button variant="secondary" onClick={reset}>
            Retry
          </Button>
        </div>
      </Card>
    </div>
  );
}
