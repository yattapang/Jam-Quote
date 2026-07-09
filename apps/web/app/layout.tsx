import type { Metadata } from "next";
import { Archivo, Public_Sans } from "next/font/google";
import { buildThemeStyleTag } from "@/lib/theme-style";
import "./globals.css";

// next/font/google — self-hosted at build time, matches @jamquote/ui tokens
// (fonts.display = "Archivo", fonts.body = "Public Sans").
const archivo = Archivo({
  subsets: ["latin"],
  weight: ["600", "700", "800", "900"],
  variable: "--font-archivo",
  display: "swap",
});

const publicSans = Public_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-public-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "JamQuote",
  description: "Estimating & invoicing for Jamaican contractors",
};

// Runs before hydration so the persisted theme choice applies with no flash.
const NO_FLASH_SCRIPT = `
(function () {
  try {
    var stored = window.localStorage.getItem('jamquote-theme');
    if (stored === 'light' || stored === 'dark') {
      document.documentElement.setAttribute('data-theme', stored);
    }
  } catch (e) {}
})();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${archivo.variable} ${publicSans.variable}`}>
      <head>
        <style dangerouslySetInnerHTML={{ __html: buildThemeStyleTag() }} />
        <script dangerouslySetInnerHTML={{ __html: NO_FLASH_SCRIPT }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
