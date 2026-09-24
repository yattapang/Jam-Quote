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
          {site.chrome.skipToContent}
        </a>

        <header className="site-head">
          <div className="site-head__inner">
            {/*
              The supplied logo, as SVG: sharp at any size, ~16 KB, and no raster to pick a
              resolution for. `alt` carries the product name so the header still says "Pryvis" to
              a screen reader and when images fail — a logo with empty alt in the one place the
              brand is named is a page that introduces itself to nobody. Width and height match
              its 3.68:1 aspect so the header does not jump as it loads.
            */}
            <a className="wordmark" href="/" aria-label={`${site.name} home`}>
              {/*
                Two real files rather than a CSS filter. A filter flattens every path to one
                colour, so the leaf — the distinguishing part of the mark — came out as a white
                blob on dark. `pryvis-logo-dark.svg` lightens only the letterforms and leaves the
                leaf's greens and cyans exactly as supplied.

                <picture> means the browser chooses before paint: no flash, no JavaScript, and it
                still works with JavaScript off.
              */}
              <picture>
                <source srcSet="/pryvis-logo-dark.svg" media="(prefers-color-scheme: dark)" />
                {/* eslint-disable-next-line @next/next/no-img-element -- no optimiser (ADR 0018) */}
                <img src="/pryvis-logo.svg" alt={site.name} width={110} height={30} />
              </picture>
            </a>
            <nav className="site-nav" aria-label="Main">
              {site.chrome.nav.map((item) => (
                <a key={item.href} href={item.href}>
                  {item.label}
                </a>
              ))}
            </nav>
          </div>
        </header>

        <main id="main">{children}</main>

        <footer className="site-foot">
          <div className="wrap">
            <p>
              {site.name} — {site.chrome.footerTagline}
            </p>
            <p>
              <a href="/legal/terms">{site.chrome.termsLabel}</a>{" "}
              <a href="/legal/privacy">{site.chrome.privacyLabel}</a>{" "}
              <a href={`mailto:${site.contactEmail}`}>{site.contactEmail}</a>
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
