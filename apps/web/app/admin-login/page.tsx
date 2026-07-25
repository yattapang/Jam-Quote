import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import AdminLoginForm from "./AdminLoginForm";
import styles from "../login/login.module.css";

// Dedicated staff/admin entry point (separate from the contractor /login).
// Lives OUTSIDE the /admin segment so it isn't caught by the admin layout's
// gate (which would otherwise redirect here in a loop).
export const dynamic = "force-dynamic";
export const metadata = { title: "Staff Console — Sign in · JamQuote" };

export default async function AdminLoginPage() {
  // Already an admin? Straight to the console.
  const session = await getSession();
  if (session?.user.role === "ADMIN") redirect("/admin");

  return (
    <main className={styles.wrap}>
      <div className={styles.card}>
        <div className={styles.brand}>
          <h1 className={styles.title}>JamQuote Staff</h1>
          <p className={styles.subtitle}>Sign in to the internal staff console</p>
        </div>

        <AdminLoginForm />

        <p className={styles.demoHint}>
          Contractors sign in at the <a href="/login" style={{ color: "var(--jq-accent, #9c6e1b)", fontWeight: 600 }}>main login</a>.
        </p>
      </div>
    </main>
  );
}
