/**
 * The public site's shell (ADR 0018).
 *
 * No font CDN, no analytics script, no tag manager, no chat widget — Rule 20. Every
 * third-party host is a processor to register, a consent banner to justify and a
 * performance cost, and this page has to load on mobile data.
 */
import type { Metadata } from "next";

import { site } from "../content/site.js";
import "./globals.css";

export const metadata: Metadata = {
  title: site.home.title,
  description: site.home.description,
  metadataBase: new URL(`https://${site.domain}`),
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-JM">
      <body>
        {/* A keyboard user should not have to tab through the nav on every page. */}
        <a className="skip-link" href="#main">
          Skip to content
        </a>

        <header className="site-head">
          <div className="site-head__inner">
            <a className="wordmark" href="/">
              {site.name}
            </a>
            <nav className="site-nav" aria-label="Main">
              <a href="/features">What it does</a>
              <a href="/pricing">Pricing</a>
              <a href="/about">About</a>
            </nav>
          </div>
        </header>

        <main id="main">{children}</main>

        <footer className="site-foot">
          <div className="wrap">
            <p>
              {site.name} — estimating and invoicing for contractors. Built in Jamaica.
            </p>
            <p>
              <a href="/legal/terms">Terms</a> · <a href="/legal/privacy">Privacy</a> ·{" "}
              <a href={`mailto:${site.earlyAccessEmail}`}>{site.earlyAccessEmail}</a>
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
