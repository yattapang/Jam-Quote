"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import ThemeToggle from "./ThemeToggle";
import { logout } from "@/lib/auth-actions";
import styles from "./Sidebar.module.css";

export interface SidebarSession {
  businessName: string;
}

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/quotes", label: "Quotes" },
  { href: "/clients", label: "Clients" },
  { href: "/jobs", label: "Jobs" },
  { href: "/materials", label: "Materials" },
  { href: "/invoices", label: "Invoices" },
  { href: "/reports", label: "Reports" },
  { href: "/settings", label: "Settings" },
];

export default function Sidebar({ session }: { session: SidebarSession | null }) {
  const pathname = usePathname();

  return (
    <nav className={styles.sidebar}>
      <div className={styles.brand}>
        <div className={styles.brandMark}>
          <div className={styles.brandMarkInner} />
        </div>
        <div className={styles.brandName}>JamQuote</div>
      </div>

      <div className={styles.nav}>
        {NAV_ITEMS.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={active ? styles.navItemActive : styles.navItem}
            >
              <span className={active ? styles.dotActive : styles.dot} />
              {item.label}
            </Link>
          );
        })}
      </div>

      <div className={styles.footer}>
        <ThemeToggle />
        {session ? (
          <form action={logout} style={{ marginTop: 12 }}>
            <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 6 }}>{session.businessName}</div>
            <button
              type="submit"
              className={styles.navItem}
              style={{ width: "100%", cursor: "pointer", background: "none", border: "none", textAlign: "left" }}
            >
              <span className={styles.dot} />
              Sign out
            </button>
          </form>
        ) : (
          <Link href="/login" className={styles.navItem} style={{ marginTop: 12 }}>
            <span className={styles.dot} />
            Sign in
          </Link>
        )}
      </div>
    </nav>
  );
}
