import styles from "./DemoDataBanner.module.css";

/**
 * Shown when the API is unreachable, so screens may be rendering empty (no
 * live data yet) rather than something being broken. Never implies fake/demo
 * data is being shown — the data layer no longer has a fixture fallback (see
 * lib/api-server.ts's getX() functions), so an unreachable API just means
 * empty lists until the API responds again.
 */
export default function DemoDataBanner() {
  return (
    <div className={styles.banner} role="status">
      <span className={styles.icon} aria-hidden="true">
        ⚠
      </span>
      <span>
        Can&apos;t reach the server right now — screens below may show no data until it&apos;s back. On the
        free tier the API may be waking up from sleep (up to a minute); reload the page in a moment to
        retry. Any changes you make won&apos;t be saved until it&apos;s back.
      </span>
    </div>
  );
}
