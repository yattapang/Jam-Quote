"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import ThemeToggle from "./ThemeToggle";
import { logout } from "@/lib/auth-actions";
import styles from "./Sidebar.module.css";

export interface SidebarSession {
  businessName: string;
}

/**
 * Order follows the 2026-09-18 owner decision (PLANNING.md "Sidebar order"):
 * the money screens (Quotes, Invoices, Reports) sit near the top, and the
 * catalogue (Materials, Labour, Equipment, Jobs) — reference data the
 * contractor sets up once and rarely opens day to day — groups below its own
 * heading. Clients/Projects stay between the two: relationship data, not
 * money and not catalogue.
 */
type NavEntry = { href: string; label: string } | { heading: string };

const NAV_ITEMS: NavEntry[] = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/quotes", label: "Quotes" },
  { href: "/invoices", label: "Invoices" },
  { href: "/reports", label: "Reports" },
  { href: "/clients", label: "Clients" },
  { href: "/projects", label: "Projects" },
  { heading: "Catalogue" },
  { href: "/materials", label: "Materials" },
  { href: "/labour", label: "Labour" },
  { href: "/equipment", label: "Equipment" },
  { href: "/jobs", label: "Jobs" },
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
  const [isMobile, setIsMobile] = useState(false);
  const close = () => setOpen(false);

  // The drawer only goes off-canvas below the CSS breakpoint (767px); on
  // desktop it's always visible so it must never be made inert.
  useEffect(() => {
    const mql = window.matchMedia("(max-width: 767px)");
    setIsMobile(mql.matches);
    const onChange = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  const drawerHidden = isMobile && !open;

  // The `inert` DOM attribute isn't in this React version's JSX typings as
  // a settable string, and passing the boolean `true` prop is silently
  // dropped by React 18's renderer (it only recognizes it as a string
  // attribute) — so it's set imperatively via the DOM API instead, which
  // works identically in jsdom and real browsers.
  const navRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = navRef.current;
    if (!el) return;
    if (drawerHidden) {
      el.setAttribute("inert", "");
    } else {
      el.removeAttribute("inert");
    }
  }, [drawerHidden]);

  return (
    <>
      {/* Mobile top bar — hidden on desktop via CSS. */}
      {/* data-print-hide: navigation is chrome, not content — see the print
          rules in globals.css. Marked here rather than wrapping the shell so
          the layout grid keeps exactly the children it expects. */}
      <header className={styles.topbar} data-print-hide>
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
          <div className={styles.brandName}>Pryvis</div>
        </div>
      </header>

      {/* Backdrop behind the open drawer (mobile only). */}
      {open && <div className={styles.backdrop} onClick={close} aria-hidden="true" />}

      <nav
        ref={navRef}
        className={`${styles.sidebar} ${open ? styles.sidebarOpen : ""}`}
        data-print-hide
        aria-hidden={drawerHidden || undefined}
      >
        <div className={styles.brand}>
          <BrandMark />
          <div className={styles.brandName}>Pryvis</div>
        </div>

        <div className={styles.nav} data-testid="sidebar-nav-list">
          {NAV_ITEMS.map((item) => {
            if ("heading" in item) {
              return (
                <div key={item.heading} className={styles.navSectionHeading}>
                  {item.heading}
                </div>
              );
            }
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={close}
                className={active ? styles.navItemActive : styles.navItem}
                aria-current={active ? "page" : undefined}
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
