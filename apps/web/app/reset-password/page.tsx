import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import ResetPasswordForm from "./ResetPasswordForm";
import styles from "../login/login.module.css";

// Auth state depends on the request's cookie, so never statically cache.
export const dynamic = "force-dynamic";

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: { token?: string };
}) {
  // Already signed in? Skip the form.
  if (await getSession()) redirect("/dashboard");

  const token = searchParams.token;

  return (
    <main className={styles.wrap}>
      <div className={styles.card}>
        <div className={styles.brand}>
          <h1 className={styles.title}>Reset password</h1>
          <p className={styles.subtitle}>Choose a new password for your account.</p>
        </div>

        {token ? (
          <ResetPasswordForm token={token} />
        ) : (
          <span className={styles.error}>
            This reset link is missing its token.{" "}
            <Link href="/forgot-password" className={styles.switchButton}>
              Request a new one
            </Link>
            .
          </span>
        )}
      </div>
    </main>
  );
}
