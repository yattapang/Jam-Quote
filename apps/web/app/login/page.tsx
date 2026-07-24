import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import LoginForm from "./LoginForm";
import styles from "./login.module.css";

// Auth state depends on the request's cookie, so never statically cache.
export const dynamic = "force-dynamic";

export default async function LoginPage() {
  // Already signed in? Skip the form.
  if (await getSession()) redirect("/dashboard");

  return (
    <main className={styles.wrap}>
      <div className={styles.card}>
        <div className={styles.brand}>
          <h1 className={styles.title}>JamQuote</h1>
          <p className={styles.subtitle}>Estimating &amp; invoicing for Jamaican contractors</p>
        </div>

        <LoginForm />

        <p className={styles.demoHint}>
          Exploring the demo? Sign in with{" "}
          <strong>owner@blackwood.jm</strong> / <strong>Blackwood123!</strong>
        </p>
      </div>
    </main>
  );
}
