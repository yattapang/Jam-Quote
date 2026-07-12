import Sidebar from "@/components/layout/Sidebar";
import DemoDataBanner from "@/components/layout/DemoDataBanner";
import { checkApiReachable } from "@/lib/api-client";
import styles from "./layout.module.css";

export default async function AppShellLayout({ children }: { children: React.ReactNode }) {
  const apiUp = await checkApiReachable();
  return (
    <div className={styles.shell}>
      <Sidebar />
      <main className={styles.main}>
        {!apiUp && <DemoDataBanner />}
        {children}
      </main>
    </div>
  );
}
