import { logout } from "@/lib/auth-actions";
import { getSession } from "@/lib/session";
import Button from "@/components/ui/Button";
import styles from "./account-required.module.css";

// Auth state depends on the request's cookie, so never statically cache.
export const dynamic = "force-dynamic";

/**
 * Landed on when a *signed-in* tenant-app request gets a 403 from the API —
 * a valid JWT, but no usable business. Per the API's TenantAuthGuard that's
 * always one of: an admin account (no businessId at all), or a business
 * that's been suspended/soft-deleted. Either way, showing an empty dashboard
 * would look broken; this page explains what's actually going on.
 *
 * Reached from lib/api-server.ts's redirectOnAuthError() (server reads) and
 * lib/api-client.ts's request() (client-side writes) whenever the API
 * answers 403. `reason` carries the API's own error message when available.
 */
export default async function AccountRequiredPage({
  searchParams,
}: {
  searchParams: { reason?: string };
}) {
  const session = await getSession();
  const isAdmin = session?.user.role === "ADMIN";

  return (
    <main className={styles.wrap}>
      <div className={styles.card}>
        <h1 className={styles.title}>This account can&apos;t open JamQuote</h1>
        <p className={styles.body}>
          {searchParams.reason ||
            "Your account doesn't have a business profile associated with it, so there's nothing to show here."}
        </p>
        {isAdmin ? (
          <p className={styles.body}>
            This looks like a staff/admin account — use the staff console instead of the contractor app.
          </p>
        ) : (
          <p className={styles.body}>
            If you believe this is a mistake, contact support — your business account may be suspended.
          </p>
        )}
        <div className={styles.actions}>
          {isAdmin && <Button href="/admin">Go to staff console</Button>}
          <form action={logout}>
            <Button type="submit" variant="secondary">
              Sign out
            </Button>
          </form>
        </div>
      </div>
    </main>
  );
}
