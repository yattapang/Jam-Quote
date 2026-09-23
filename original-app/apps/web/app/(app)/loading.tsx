import shared from "./shared.module.css";
import styles from "./loading.module.css";

/**
 * App-wide loading fallback.
 *
 * Next renders this in place of `children` inside `(app)/layout.tsx` while a
 * page's server component is still fetching - the sidebar and any banners in
 * the layout stay mounted and visible, only the page content area swaps in
 * this skeleton. Before this existed, a slow connection made every
 * navigation look dead until the new page's data was fully ready.
 */
export default function AppLoading() {
  return (
    <div className={shared.page}>
      <div className={styles.status} role="status" aria-label="Loading…">
        <div className={styles.bar} style={{ width: "40%" }} />
        <div className={styles.block} />
        <div className={styles.bar} style={{ width: "70%" }} />
        <div className={styles.bar} style={{ width: "55%" }} />
        <div className={styles.block} />
      </div>
    </div>
  );
}
