import { stopImpersonation } from "@/lib/impersonation-actions";
import styles from "./ImpersonationBanner.module.css";

/**
 * Rendered across every (app) page whenever an admin has a "view as tenant"
 * session active (see lib/impersonation-actions.ts + lib/session.ts's
 * getImpersonation). This banner is the ONLY thing preventing an admin from
 * glancing at a screen and mistaking a viewed tenant's numbers for their
 * own, so it states all three required facts up front — whose data this is,
 * that it's read-only, and that the viewer is staff rather than a member of
 * this business — and uses a solid, high-contrast fill (not a soft tint)
 * that's never used elsewhere in the app for this kind of large surface.
 *
 * The exit button posts to stopImpersonation, which only ever deletes the
 * two impersonation cookies (never calls the API, never touches the admin's
 * own session cookie) — so it works even if the API is down or the
 * impersonation token already expired.
 */
export default function ImpersonationBanner({ tenantName }: { tenantName: string }) {
  return (
    <div className={styles.banner} role="alert">
      <div className={styles.message}>
        <span className={styles.icon} aria-hidden="true">
          👁
        </span>
        <span>
          <strong>Viewing {tenantName} as staff — read only.</strong> You are an admin looking
          at this business&apos;s data, not a member of it. Any change you attempt will be
          rejected.
        </span>
      </div>
      <form action={stopImpersonation}>
        <button type="submit" className={styles.exitButton}>
          Exit to admin console
        </button>
      </form>
    </div>
  );
}
