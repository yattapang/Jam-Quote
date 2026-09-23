import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * Pins the rename (ADR 0009) on the public quote page — what a contractor's
 * CLIENT sees, with no login and no app chrome. By design (see page.tsx's own
 * header comment: "written for someone who has never heard of JamQuote and
 * will never sign in") this page never names the product at all; the
 * `metadata.title` is the generic "Your quote" and everything on the page is
 * the business's own name, not the platform's. There is therefore no old
 * brand string to swap for "Pryvis" here without inventing new copy, which
 * the rename explicitly avoids (see docs/adr/0009-brand-pryvis.md).
 *
 * This guard pins the negative instead — the same defect-catching shape as
 * lib/brand-name-guard.test.ts — over every source file behind this public
 * route, so it fails loudly the moment someone adds "JamQuote" here.
 */
describe("public quote page carries no old brand name", () => {
  it.each(["page.tsx", "QuoteDecision.tsx", "PrintButton.tsx", "error.tsx"])(
    "%s does not mention JamQuote in code (comments aside, none rename to Pryvis by design)",
    (file) => {
      const src = readFileSync(path.join(__dirname, file), "utf-8");
      // Rendered text/strings only — the file's own explanatory comments are
      // allowed to keep saying "JamQuote" (history: why the page has no
      // login), same allowance lib/brand-name-guard.test.ts makes by only
      // scanning strings and JSX text, never comments.
      const withoutComments = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
      // Case-sensitive: the lowercase "@jamquote/..." npm scope (step 2 of the
      // rename, untouched here) must not make this a false positive.
      expect(withoutComments).not.toMatch(/JamQuote/);
    },
  );
});
