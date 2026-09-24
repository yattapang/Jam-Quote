/**
 * Every word on the public site lives here, not in JSX.
 *
 * WHY THIS FILE EXISTS (ADR 0018)
 *
 * This is what "convertible later" actually means. Moving to a headless CMS becomes
 * replacing the loader below, because no page has its words baked into markup. Put a
 * sentence directly in a component and you have quietly removed that option.
 *
 * WHAT MUST NEVER APPEAR HERE (Rule 20)
 *
 * A testimonial we did not receive. A customer count we cannot evidence. A logo we have
 * no right to use. A review score. An award. A price that has not been decided.
 *
 * There are no customers yet. A prospect who finds an invented claim has learned
 * something true about us, and it is the one thing they will remember. The
 * `socialProof` field below is deliberately an empty array with a comment, rather than
 * absent, so that adding something to it is a decision somebody makes on purpose — and
 * `honest-claims.test.ts` fails if marketing language appears in a page without evidence
 * here.
 */

export interface Tier {
  readonly name: string;
  readonly who: string;
  /** Null until the owner sets it. A placeholder number gets screenshotted (Rule 20). */
  readonly priceLabel: string | null;
  readonly includes: readonly string[];
  /** The one line that explains why someone moves up to this tier. */
  readonly theLine: string;
}

export interface Feature {
  readonly title: string;
  readonly body: string;
}

export const site = {
  name: "Pryvis",
  domain: "pryvis.com",

  /**
   * The interim call to action. Registration is designed (ADR 0015) and not built, so
   * this is a mailto: honest, zero dependencies, and no personal data handed to a
   * third-party form service for an address we can collect ourselves shortly. It is
   * replaced by the real sign-up when the API's HTTP transport lands.
   */
  earlyAccessEmail: "hello@pryvis.com",

  /** Empty on purpose. See the file header. */
  socialProof: [] as readonly { readonly quote: string; readonly who: string }[],

  home: {
    title: "Pryvis — quote, invoice and get paid",
    description:
      "Price a job properly, send a branded quote your client can accept on their phone, then invoice and track what you are owed. Built for contractors in Jamaica.",
    heading: "Quote the job properly. Get paid for it.",
    subheading:
      "Price work from your own materials and labour rates, send a quote your client can accept on their phone, then turn it into an invoice and see what you are actually owed.",
    // Plain, concrete, and true of what the product does. No superlatives: a contractor
    // has read "revolutionary" before and it tells them nothing.
    points: [
      "Build a quote from your own material prices and labour rates — not a generic template.",
      "Price a job once, reuse it. The second bathroom takes minutes instead of an evening.",
      "Send by WhatsApp or email. Your client opens a branded page and accepts or declines.",
      "Turn an accepted quote into an invoice, record payments, and see what is outstanding.",
      "See whether the job actually made money once the receipts are in.",
    ],
  },

  features: {
    title: "What Pryvis does — Pryvis",
    description:
      "Quotes built from your own prices, reusable job recipes, client approval on a phone, invoicing, payments, retention and job profit.",
    heading: "What it does",
    intro:
      "Everything below exists because a contractor asked for it, or because a paper book was doing the job badly.",
    items: [
      {
        title: "Quotes from your own numbers",
        body: "Keep your materials, labour rates and equipment in one place and price work from them. Change a supplier price once and your next quote is right — the quotes you have already sent do not move.",
      },
      {
        title: "Price a job once, reuse it",
        body: "Build up a job from its materials and labour — a square metre of blockwork, a bathroom, a roof — and quote it again in minutes. This is the part contractors tell us saves an evening.",
      },
      {
        title: "GCT handled per line",
        body: "Some lines carry GCT and some do not. Pryvis applies the right treatment line by line, and a quote records the rate it was issued under, so a document from March still reads correctly in December.",
      },
      {
        title: "Your client accepts on their phone",
        body: "Send a link by WhatsApp or email. Your client sees a branded quote and accepts or declines. No app to install, no account to create, no PDF to find in a crowded inbox.",
      },
      {
        title: "Invoices and what you are owed",
        body: "Turn an accepted quote into an invoice without retyping it. Record payments as they arrive, hold and release retention, and see at a glance who is late.",
      },
      {
        title: "Did the job make money?",
        body: "Put purchases and labour against the job as they happen and compare them with what you quoted. The answer is usually interesting and sometimes uncomfortable.",
      },
      {
        title: "Works on the phone you already have",
        body: "Built for a phone first, because that is where quoting actually happens — on a site, standing up, on mobile data.",
      },
    ] satisfies readonly Feature[],
  },

  pricing: {
    title: "Pricing — Pryvis",
    description:
      "Start free. Pryvis is free to quote with, and paid when you start invoicing and getting paid through it.",
    heading: "Start free",
    // Honest about the state of pricing rather than inventing a number (Rule 20).
    intro:
      "Quoting is free, for as long as you want. You pay when Pryvis starts helping you get paid — invoicing, payment recording and job costing. Final prices in Jamaican dollars are being set now; if you want to know before everyone else, ask us.",
    tiers: [
      {
        name: "Free",
        who: "A contractor trying it out",
        priceLabel: "Free",
        theLine: "Enough to win work with, genuinely — not a crippled demo.",
        includes: [
          "3 new jobs quoted a month",
          "Your own materials, labour rates and equipment",
          "Branded PDF quotes",
          "Share by WhatsApp or email, client accepts online",
          "Client list",
          "1 user",
        ],
      },
      {
        name: "Pro",
        who: "A working contractor or a one-crew outfit",
        priceLabel: null,
        theLine: "Quoting wins the work. Pro is where you get paid for it.",
        includes: [
          "Unlimited quotes",
          "Reusable job recipes",
          "Invoices and payment recording",
          "Payment reminders and an overdue list",
          "Card payment links",
          "Retention tracking",
          "Project costing and job profit",
          "Accountant exports",
          "Offline use on your phone",
        ],
      },
      {
        name: "Business",
        who: "A firm with an office and several crews",
        priceLabel: null,
        theLine: "For when more than one person quotes, and someone has to approve it.",
        includes: [
          "Up to 10 users, then per seat",
          "Roles and approvals — who may send or discount",
          "Multiple crews and crew cost rates",
          "Consolidated reporting across projects",
          "Supplier price comparison and alerts",
          "Full document branding and per-client terms",
          "WhatsApp Business sending",
          "API access",
          "Priority support",
        ],
      },
    ] satisfies readonly Tier[],
    footnote:
      "Changing tier does not put your data out of reach. If you stop paying, your quotes and invoices stay readable and exportable.",
  },

  about: {
    title: "About Pryvis",
    description:
      "Pryvis is estimating and invoicing software for contractors, built in Jamaica, starting with the Jamaican construction trade.",
    heading: "Built for the way contracting actually works here",
    body: [
      "Pryvis started from a specific problem: pricing a job properly takes an evening with a paper book and a calculator, and the quote that comes out of it still looks like it came from a paper book.",
      "So it is built around the parts that actually cost contractors money — pricing from real supplier prices, reusing a job you have already priced, getting a client's acceptance in writing, and knowing whether the job made anything once the receipts are in.",
      "It is Jamaican first: GCT treated line by line, prices in Jamaican dollars, quotes sent the way clients here actually read them. Trinidad and Tobago is next, and the tax and currency rules are configuration rather than a rewrite.",
      "It is early. There is no pretence otherwise on this site: no invented customer numbers, no testimonials we have not been given. If you are a contractor willing to tell us what is wrong with it, we would rather hear from you now than after launch.",
    ],
  },

  legal: {
    /**
     * Drafts, and labelled as such on the page. Terms and a privacy policy carry legal
     * responsibility and are required before a self-service sign-up that takes payment
     * (ADR 0015, Rule 20). The owner approves the words; these are a starting point that
     * says what is actually true about our data handling, not boilerplate copied from a
     * company with different processors.
     */
    draft: true,
    lastReviewed: "2026-09-24",
  },
} as const;
