"use client";

import { useState } from "react";
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

function BrandMark() {
  return (
    <div className={styles.brandMark}>
      <div className={styles.brandMarkInner} />
    </div>
  );
}

export default function Sidebar({ session }: { session: SidebarSession | null }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  return (
    <>
      {/* Mobile top bar — hidden on desktop via CSS. */}
      <header className={styles.topbar}>
        <button
          type="button"
          className={styles.hamburger}
          aria-label="Open navigation menu"
          aria-expanded={open}
          onClick={() => setOpen(true)}
        >
          <span />
          <span />
          <span />
        </button>
        <div className={styles.topbarBrand}>
          <BrandMark />
          <div className={styles.brandName}>JamQuote</div>
        </div>
      </header>

      {/* Backdrop behind the open drawer (mobile only). */}
      {open && <div className={styles.backdrop} onClick={close} aria-hidden="true" />}

      <nav className={`${styles.sidebar} ${open ? styles.sidebarOpen : ""}`}>
        <div className={styles.brand}>
          <BrandMark />
          <div className={styles.brandName}>JamQuote</div>
        </div>

        <div className={styles.nav}>
          {NAV_ITEMS.map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={close}
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
            <Link href="/login" onClick={close} className={styles.navItem} style={{ marginTop: 12 }}>
              <span className={styles.dot} />
              Sign in
            </Link>
          )}
        </div>
      </nav>
    </>
  );
}
