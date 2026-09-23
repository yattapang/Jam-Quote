import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * Pins the rename (ADR 0009) on the PDF documents. Neither QuotePdf nor
 * InvoicePdf ever printed the product name in their footer — only the
 * CONTRACTOR's business name, TRN and document number (see the `footer`
 * views in each file) — so there is no old-brand string to swap for "Pryvis"
 * without inventing new copy, which the rename explicitly avoids. This guard
 * instead pins the negative: the source that generates the PDF a client
 * receives must never regress to naming the product "JamQuote", the same
 * defect-catching shape as lib/brand-name-guard.test.ts, scoped to the two
 * files that are not under apps/web/app or apps/web/components.
 */
describe("PDF documents carry no old brand name", () => {
  it.each(["QuotePdf.tsx", "InvoicePdf.tsx"])("%s does not mention JamQuote", (file) => {
    const src = readFileSync(path.join(__dirname, file), "utf-8");
    // Case-sensitive: the lowercase "@jamquote/..." npm scope (step 2 of the
    // rename, untouched here) must not make this a false positive.
    expect(src).not.toMatch(/JamQuote/);
  });
});
