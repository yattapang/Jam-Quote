"use client";

import shared from "./shared.module.css";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import styles from "@/components/layout/CatalogLoadError.module.css";
import { useRetry } from "@/lib/use-retry";

/**
 * Fallback boundary for every app route without its own error.tsx.
 *
 * The server getters for a page's primary data (catalogs, clients, quotes,
 * invoices, projects, reports, business, settings vocabulary) rethrow when the
 * API is reachable but their request failed, rather than returning an empty
 * list; the detail getters rethrow for anything but a genuine 404. The catalog
 * pages have their own boundaries; every other screen lands here instead of
 * showing "No ... yet" or a false "not found". Side widgets do not reach this:
 * they use softLoad() and render their own "couldn't load" state.
 * An unreachable API still returns empty lists and shows DemoDataBanner, so this
 * only appears when the server is up and a request on this page failed. No error
 * text or stack trace is shown.
 */
export default function AppError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const { retry } = useRetry(reset);
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
          <Button variant="secondary" onClick={retry}>
            Retry
          </Button>
        </div>
      </Card>
    </div>
  );
}
