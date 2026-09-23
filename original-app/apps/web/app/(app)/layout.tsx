import Sidebar from "@/components/layout/Sidebar";
import DemoDataBanner from "@/components/layout/DemoDataBanner";
import ImpersonationBanner from "@/components/layout/ImpersonationBanner";
import ToastProvider from "@/components/ui/ToastProvider";
import { getApiReachable } from "@/lib/api-reachable";
import { getSession, getImpersonation } from "@/lib/session";
import styles from "./layout.module.css";

export default async function AppShellLayout({ children }: { children: React.ReactNode }) {
  // getApiReachable() (not a fresh checkApiReachable() call) so this shares
  // its one answer, memoised per request via React's cache(), with every
  // getX() in api-server.ts that hits emptyOnlyIfUnreachable on this same
  // page load — see lib/api-reachable.ts.
  const [apiUp, session] = await Promise.all([getApiReachable(), getSession()]);
  const impersonation = getImpersonation();
  return (
    <ToastProvider>
      <div className={styles.shell}>
        <Sidebar session={session?.business ? { businessName: session.business.name } : null} />
        <main className={styles.main}>
          {impersonation && <ImpersonationBanner tenantName={impersonation.tenantName} />}
          {!apiUp && <DemoDataBanner />}
          {children}
        </main>
      </div>
    </ToastProvider>
  );
}
