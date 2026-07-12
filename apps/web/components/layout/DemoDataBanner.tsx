import styles from "./DemoDataBanner.module.css";

/**
 * Shown when the API is unreachable so the app's screens are rendering bundled
 * demo data instead of live records. Prevents the silent fixture-fallback from
 * masquerading as real data (which once hid a production misconfiguration).
 */
export default function DemoDataBanner() {
  return (
    <div className={styles.banner} role="status">
      <span className={styles.icon} aria-hidden="true">
        ⚠
      </span>
      <span>
        Showing demo data — can&apos;t reach the server right now. On the free tier it may be waking up
        (up to a minute); refresh in a moment. Any changes you make won&apos;t be saved until it&apos;s back.
      </span>
    </div>
  );
}
