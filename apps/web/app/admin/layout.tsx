import styles from "./admin.module.css";

export const metadata = { title: "JamQuote Admin · internal" };

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={styles.shell}>
      <header className={styles.topbar}>
        <div className={styles.brand}>
          JamQuote <span className={styles.badge}>ADMIN</span>
        </div>
        <span className={styles.env}>Internal platform console · staff only</span>
      </header>
      <main className={styles.main}>{children}</main>
    </div>
  );
}
