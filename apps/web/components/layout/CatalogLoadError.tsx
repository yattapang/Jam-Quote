"use client";

import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import styles from "./CatalogLoadError.module.css";

/**
 * Rendered by the catalog route error.tsx boundaries (materials, labour,
 * equipment, jobs) when the API is reachable but the page's own request
 * failed (a 500, a timeout on that one request, a bad response).
 *
 * Distinct from DemoDataBanner: that one covers the API being asleep, where
 * an empty list is correct and expected. This one covers the API being up
 * and this screen's data failing to load — the empty "No saved … yet" state
 * would read to a contractor as "you have nothing saved," which is false and
 * risks them re-creating items they already have. No stack trace or raw
 * error text is shown; `error.tsx` passes the caught error object to this
 * component's callers but they only use it to call `reset()`, never to
 * render `error.message`.
 */
export default function CatalogLoadError({ label, reset }: { label: string; reset: () => void }) {
  return (
    <Card>
      <div className={styles.wrap} role="alert">
        <span className={styles.icon} aria-hidden="true">
          ⚠
        </span>
        <div className={styles.copy}>
          <span className={styles.title}>Couldn&apos;t load your {label}</span>
          <span className={styles.body}>
            The server is up, but this request failed. Your saved {label} are probably still
            there — retry instead of re-adding them.
          </span>
        </div>
        <Button variant="secondary" onClick={reset}>
          Retry
        </Button>
      </div>
    </Card>
  );
}
