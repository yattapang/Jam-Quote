import Sidebar from "@/components/layout/Sidebar";
import styles from "./layout.module.css";

export default function AppShellLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={styles.shell}>
      <Sidebar />
      <main className={styles.main}>{children}</main>
    </div>
  );
}
