/**
 * The guards the approved design asks for (docs/design/marketing-site.md §5).
 *
 * These read the site's own source, because the claims they protect are claims about what is
 * WRITTEN — no tracker, no invented social proof, no price before a price exists. Rendering the
 * pages would prove less: a claim can be true of the DOM and still be sitting in a component
 * where it escapes the content model.
 *
 * HOW THEY READ IT
 *
 * Through the TypeScript parser where structure matters, and over source text where the claim is
 * about the text itself. Never a bare regex for something structural: a regex cannot tell a
 * specifier in a comment from an import (Rule 8).
 *
 * WHAT THEY DO NOT PROVE
 *
 * - Nothing about whether the copy WORKS. If five contractors read the hero and three describe the
 *   product wrongly, every test here still passes. The design says to read it to three
 *   contractors, at least one of them a Delroy who prices at the gate, and that is the only test
 *   that can find it.
 * - Nothing about whether the legal wording is sufficient. That needs a lawyer.
 * - Nothing about performance or accessibility beyond the structural checks below. A real
 *   measurement on a real phone is owed.
 * - Not that the site is deployed correctly, or that the mailto address receives mail — which is
 *   the site's single point of failure right now.
 */
import { readdir, readFile } from "node:fs/promises";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { describe, expect, it } from "vitest";

import { privacy as privacyContent, terms as termsContent } from "../content/legal.js";
import { site } from "../content/site.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const WEB = join(HERE, "..");
const APP = join(WEB, "app");

interface Page {
  /** Route path as a visitor sees it: "/", "/features", "/legal/terms". */
  readonly route: string;
  readonly file: string;
  readonly source: string;
}

async function tsxUnder(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const out: string[] = [];
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await tsxUnder(full)));
    else if (entry.name.endsWith(".tsx")) out.push(full);
  }
  return out;
}

/** Every route the site serves, from the App Router's own convention. */
async function pages(): Promise<Page[]> {
  const files = (await tsxUnder(APP)).filter((f) => f.endsWith(`${sep}page.tsx`));
  return Promise.all(
    files.map(async (file) => {
      const rel = relative(APP, dirname(file)).split(sep).join("/");
      return { route: rel === "" ? "/" : `/${rel}`, file, source: await readFile(file, "utf8") };
    }),
  );
}

/** Every .tsx under app/, pages and components alike. */
async function components(): Promise<{ file: string; source: string }[]> {
  const files = await tsxUnder(APP);
  return Promise.all(
    files.map(async (file) => ({
      file: relative(WEB, file).split(sep).join("/"),
      source: await readFile(file, "utf8"),
    })),
  );
}

/**
 * Is `component` actually RENDERED in this source, as a JSX element?
 *
 * Parsed rather than text-matched, because an import statement mentions a component without
 * rendering it — and a guard satisfied by an import line proves nothing. See the draft-banner
 * guard below for the plant that taught this.
 */
function usesComponent(source: string, fileName: string, component: string): boolean {
  const sf = ts.createSourceFile(fileName, source, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TSX);
  let found = false;

  const nameOf = (tag: ts.JsxTagNameExpression): string =>
    ts.isIdentifier(tag) ? tag.text : tag.getText(sf);

  const visit = (node: ts.Node): void => {
    if (found) return;
    if (ts.isJsxSelfClosingElement(node) && nameOf(node.tagName) === component) found = true;
    else if (ts.isJsxElement(node) && nameOf(node.openingElement.tagName) === component) {
      found = true;
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return found;
}

/** All prose the site can show, from the content module rather than the markup. */
function allCopy(): string {
  const parts: string[] = [];
  const walk = (value: unknown): void => {
    if (typeof value === "string") parts.push(value);
    else if (Array.isArray(value)) value.forEach(walk);
    else if (value && typeof value === "object") Object.values(value).forEach(walk);
  };
  walk(site);
  // The legal documents are copy too. An invented claim in the terms would be worse than one in
  // the hero, so they are not exempt from the honesty guards.
  walk(privacyContent);
  walk(termsContent);
  return parts.join("\n");
}

describe("the guard has subjects", () => {
  it("finds every page the design lists, and no page it does not", async () => {
    // A guard that silently matched nothing passes forever (Rule 8). This also fails when a page
    // is added without the design being updated, which is the point.
    const routes = (await pages()).map((p) => p.route).sort();

    expect(routes).toEqual([
      "/",
      "/about",
      "/features",
      "/legal/privacy",
      "/legal/terms",
      "/pricing",
    ]);
  });
});

describe("every page can be found and understood", () => {
  it("declares a title and a description", async () => {
    // The root page's metadata lives in layout.tsx; every other page exports its own.
    const missing: string[] = [];
    for (const page of await pages()) {
      const source =
        page.route === "/" ? await readFile(join(APP, "layout.tsx"), "utf8") : page.source;
      if (!/title:/.test(source)) missing.push(`${page.route} has no title`);
      if (!/description:/.test(source)) missing.push(`${page.route} has no description`);
    }
    expect(missing, missing.join("; ")).toEqual([]);
  });

  it("links only to routes that exist", async () => {
    // A dead internal link on a six-page site is careless in a way a visitor notices.
    const known = new Set((await pages()).map((p) => p.route));
    const broken: string[] = [];

    for (const { file, source } of await components()) {
      for (const match of source.matchAll(/href=["']([^"'{}]+)["']/g)) {
        const href = match[1]!;
        if (!href.startsWith("/")) continue; // mailto:, external, or a template expression
        if (href.startsWith("/#")) continue;
        if (!known.has(href)) broken.push(`${file} links to ${href}, which is not a route`);
      }
    }
    expect(broken, broken.join("; ")).toEqual([]);
  });
});

describe("no third-party hosts", () => {
  it("loads no external script, stylesheet or font", async () => {
    // Rule 20: each one is a processor to register, a consent banner to justify and a performance
    // cost on mobile data. Checked as source text because the claim IS about the text.
    const offences: string[] = [];
    const banned = [
      /<script\s+[^>]*src=/i,
      /fonts\.googleapis\.com/i,
      /fonts\.gstatic\.com/i,
      /googletagmanager/i,
      /google-analytics/i,
      /https:\/\/cdn\./i,
      /@import\s+url\(/i,
    ];

    const sources = [
      ...(await components()),
      {
        file: "app/globals.css",
        source: await readFile(join(APP, "globals.css"), "utf8"),
      },
    ];

    for (const { file, source } of sources) {
      for (const pattern of banned) {
        if (pattern.test(source)) offences.push(`${file} matches ${pattern}`);
      }
    }
    expect(offences, offences.join("; ")).toEqual([]);
  });
});

describe("nothing untrue", () => {
  it("makes no social-proof claim, because there is no evidence for one", () => {
    // site.socialProof is empty, so any language implying customers or ratings is invented
    // (Rule 20). If it is ever populated, this guard relaxes deliberately rather than silently.
    const copy = allCopy();
    // The population pattern was too greedy on its first run: it flagged "Up to 10 users, then per
    // seat", which is a TIER LIMIT, not a boast. A guard that cries wolf gets switched off, so it now
    // needs either a three-figure population or a verb that actually claims adoption. The narrowing
    // is deliberate and loses some coverage: "50 contractors use Pryvis" would slip past, and review
    // is what catches that.
    const claims = [
      /trusted by/i,
      /\b(?:join|joined|used by|chosen by|loved by)\s+\d/i,
      /\b\d[\d,]{2,}\+?\s+(?:contractors|businesses|customers|users)\b/i,
      /\b\d[\d,]*\+?\s+(?:contractors|businesses|customers|users)\s+(?:use|trust|rely|have)\b/i,
      /rated \d/i,
      /\b\d(?:\.\d)? out of \d\b/i,
      /award[- ]winning/i,
      /market leader/i,
      /thousands of/i,
    ];

    const found = claims.filter((c) => c.test(copy)).map(String);
    if (site.socialProof.length === 0) {
      expect(
        found,
        `social-proof language with no evidence in site.socialProof: ${found.join(", ")}`,
      ).toEqual([]);
    }
  });

  it("shows a price only where a price has been decided", () => {
    // A placeholder number gets screenshotted and quoted back (Rule 20).
    const withPrices = site.pricing.tiers.filter((t) => t.priceLabel !== null);
    const suspicious = withPrices.filter((t) => /\d/.test(t.priceLabel ?? ""));

    expect(
      suspicious.map((t) => `${t.name}: ${t.priceLabel}`),
      "a tier shows a number; prices are not set yet, so this must be approved by the owner first",
    ).toEqual([]);

    // And the free tier must still say it is free, or the page says nothing useful.
    expect(site.pricing.tiers[0]?.priceLabel).toBe("Free");
  });

  it("never claims speed without the condition that makes it true", () => {
    // The design's adjustment (Delroy at the gate) lets the site promise minutes. That is only
    // true once a job recipe exists, so any speed claim must travel with its condition — a
    // contractor who tries it at the gate on an empty account and fails never returns.
    const speed = /\b(?:in minutes|three minutes|instant|instantly|on the spot|seconds)\b/i;
    const condition = /(?:price(?:d)? it once|already priced|priced once|first job|build a job up|remembers the build-up|saved|recipe)/i;

    const offenders: string[] = [];
    const check = (label: string, block: readonly string[]) => {
      const text = block.join(" ");
      if (speed.test(text) && !condition.test(text)) {
        offenders.push(`${label} claims speed with no condition in the same block`);
      }
    };

    check("home.heading + subheading + firstRun", [
      site.home.heading,
      site.home.subheading,
      site.home.firstRun,
    ]);
    check("home.points", site.home.points);
    for (const item of site.features.items) check(`features: ${item.title}`, [item.title, item.body]);

    expect(offenders, offenders.join("; ")).toEqual([]);
  });
});

describe("the legal pages", () => {
  it("carry the draft banner while the wording is unapproved", async () => {
    // The owner approves legal wording (Rule 20). A test cannot verify approval, but it can
    // refuse a legal page that does not show the banner while the flag says draft.
    const legal = (await pages()).filter((p) => p.route.startsWith("/legal/"));
    expect(legal.length).toBe(2);

    if (site.legal.draft) {
      // The pages render through LegalDocument, which is where the banner lives, so the chain is
      // what gets checked. Either link breaking means an unapproved document could present itself
      // as final.
      //
      // RENDERED, not merely mentioned. The first version of this guard matched /DraftBanner/ over
      // the source, and planting the defect showed it was worthless: deleting the
      // `<DraftBanner />` element left `import { DraftBanner } from …` behind, which the regex
      // happily matched. That is the exact failure the Phase 0 audit named in the previous
      // application — "a guard could be satisfied by an import line" — reproduced here by me and
      // caught only because the defect was planted.
      for (const page of legal) {
        expect(
          usesComponent(page.source, page.file, "LegalDocument"),
          `${page.route} does not render <LegalDocument>`,
        ).toBe(true);
      }
      const sharedPath = join(APP, "legal", "LegalDocument.tsx");
      const shared = await readFile(sharedPath, "utf8");
      expect(
        usesComponent(shared, sharedPath, "DraftBanner"),
        "LegalDocument does not render <DraftBanner> (an import alone is not a render)",
      ).toBe(true);
    }
  });

  it("names the processors that actually hold data", async () => {
    // Boilerplate naming processors we do not use would be a false statement about where a
    // contractor's customers' details are held. These come from docs/SERVICE-REGISTER.md.
    // Read from the content module, which is where the words live — not from the page, which is
    // presentation. A guard pointed at the page would have passed while the notice said nothing.
    const notice = JSON.stringify(privacyContent);
    for (const processor of ["Neon", "Render", "Vercel", "Resend", "WiPay"]) {
      expect(notice, `privacy notice does not name ${processor}`).toContain(processor);
    }
  });
});

describe("the content model holds", () => {
  it("keeps prose out of the pages", async () => {
    // ADR 0018: every word lives in content/site.ts so the site is convertible to a CMS later. A
    // sentence written into a component removes that option quietly, so it is refused here.
    //
    // Parsed, not grepped: JSX text is a distinct node type, and a regex over the source would
    // flag className strings, imports and comments.
    const offenders: string[] = [];

    for (const { file, source } of await components()) {
      const sf = ts.createSourceFile(file, source, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TSX);
      const diagnostics = (sf as unknown as { parseDiagnostics?: ts.Diagnostic[] }).parseDiagnostics;
      if (diagnostics?.length) {
        throw new Error(
          `${file} does not parse: ${ts.flattenDiagnosticMessageText(diagnostics[0]!.messageText, " ")}`,
        );
      }

      const visit = (node: ts.Node): void => {
        if (ts.isJsxText(node)) {
          const text = node.text.replace(/\s+/g, " ").trim();
          // A handful of words is a label or a link; a sentence is content. The threshold is
          // deliberately generous, because the failure this catches is paragraphs, not "Terms".
          const words = text.split(" ").filter(Boolean);
          const isSentence = words.length > 6 || /[.!?]$/.test(text);
          if (text.length > 0 && isSentence) {
            offenders.push(`${file} contains prose in JSX: "${text.slice(0, 60)}…"`);
          }
        }
        ts.forEachChild(node, visit);
      };
      visit(sf);
    }

    expect(offenders, offenders.join("\n")).toEqual([]);
  });
});
