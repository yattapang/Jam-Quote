import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { safeRedirectPath } from "@/lib/safe-redirect";
import LoginForm from "./LoginForm";
import styles from "./login.module.css";

// Auth state depends on the request's cookie, so never statically cache.
export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  // `redirect` is set by middleware.ts when it bounced an unauthenticated
  // request away from a protected page; `expired` is set by the 401 handlers
  // in lib/api-server.ts / lib/api-client.ts when a previously-valid session
  // stopped working mid-visit.
  searchParams: { reset?: string; redirect?: string; expired?: string };
}) {
  const redirectTo = safeRedirectPath(searchParams.redirect);
  // Already signed in? Skip the form and go straight to where they were headed.
  if (await getSession()) redirect(redirectTo);

  return (
    <main className={styles.wrap}>
      <div className={styles.card}>
        <div className={styles.brand}>
          <h1 className={styles.title}>JamQuote</h1>
          <p className={styles.subtitle}>Estimating &amp; invoicing for Jamaican contractors</p>
        </div>

        {searchParams.reset === "success" && (
          <p className={styles.subtitle}>Your password has been reset. Sign in with your new password.</p>
        )}
        {searchParams.expired === "1" && (
          <p className={styles.subtitle}>Your session expired — sign in again to continue.</p>
        )}

        <LoginForm redirectTo={redirectTo} />

        <p className={styles.demoHint}>
          Exploring the demo? Sign in with{" "}
          <strong>owner@blackwood.jm</strong> / <strong>Blackwood123!</strong>
        </p>
      </div>
    </main>
  );
}
