import styles from "./LoadFailedNotice.module.css";

/**
 * Inline "this part couldn't load" state for a SECONDARY widget on a page that
 * otherwise rendered (see lib/soft-load.ts). Used in place of the widget's
 * empty state, which would read as "you have none". Works in server and client
 * components; there is no Retry button because a page reload is the retry.
 *
 * Distinct from CatalogLoadError / app/(app)/error.tsx, which replace the whole
 * page when its primary data failed.
 */
export default function LoadFailedNotice({ what }: { what: string }) {
  return (
    <div className={styles.wrap} role="status">
      <span className={styles.icon} aria-hidden="true">
        ⚠
      </span>
      <span>
        <strong>Couldn&apos;t load {what}.</strong>{" "}
        <span className={styles.body}>The server is up, but this part failed. Reload the page to try again.</span>
      </span>
    </div>
  );
}
