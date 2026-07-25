import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import ForgotPasswordForm from "./ForgotPasswordForm";
import styles from "../login/login.module.css";

// Auth state depends on the request's cookie, so never statically cache.
export const dynamic = "force-dynamic";

export default async function ForgotPasswordPage() {
  // Already signed in? Skip the form.
  if (await getSession()) redirect("/dashboard");

  return (
    <main className={styles.wrap}>
      <div className={styles.card}>
        <div className={styles.brand}>
          <h1 className={styles.title}>Forgot password</h1>
          <p className={styles.subtitle}>
            Enter your account email and we&apos;ll send you a link to reset your password.
          </p>
        </div>

        <ForgotPasswordForm />

        <p className={styles.switch}>
          Remembered it?
          <Link href="/login" className={styles.switchButton}>
            Sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
