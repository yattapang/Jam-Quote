import Sidebar from "@/components/layout/Sidebar";
import DemoDataBanner from "@/components/layout/DemoDataBanner";
import ImpersonationBanner from "@/components/layout/ImpersonationBanner";
import { checkApiReachable } from "@/lib/api-client";
import { getSession, getImpersonation } from "@/lib/session";
import styles from "./layout.module.css";

export default async function AppShellLayout({ children }: { children: React.ReactNode }) {
  const [apiUp, session] = await Promise.all([checkApiReachable(), getSession()]);
  const impersonation = getImpersonation();
  return (
    <div className={styles.shell}>
      <Sidebar session={session?.business ? { businessName: session.business.name } : null} />
      <main className={styles.main}>
        {impersonation && <ImpersonationBanner tenantName={impersonation.tenantName} />}
        {!apiUp && <DemoDataBanner />}
        {children}
      </main>
    </div>
  );
}
