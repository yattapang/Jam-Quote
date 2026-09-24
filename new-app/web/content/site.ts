/**
 * Every word on the public site lives here, not in JSX.
 *
 * WHY THIS FILE EXISTS (ADR 0018)
 *
 * This is what "convertible later" actually means: moving to a headless CMS becomes
 * replacing the loader, because no page has its words baked into markup. Put a sentence
 * directly in a component and you have quietly removed that option — which is why
 * `content-source.test.ts` fails when a page carries prose of its own.
 *
 * WHAT MUST NEVER APPEAR HERE (Rule 20)
 *
 * A testimonial we did not receive. A customer count we cannot evidence. A logo we have
 * no right to use. A review score. An award. A price that has not been decided.
 *
 * There are no customers yet. A prospect who finds an invented claim has learned
 * something true about us, and it is the one thing they will remember. `socialProof` is
 * deliberately an empty array rather than absent, so adding to it is a decision somebody
 * makes on purpose — and `honest-claims.test.ts` fails if social-proof language appears
 * anywhere without evidence here.
 *
 * THE SPEED CLAIM IS CONDITIONAL, AND THE CONDITION TRAVELS WITH IT
 *
 * The site leads on Delroy's roadside estimate (docs/design/marketing-site.md §1): a
 * defensible number in minutes, standing at the gate. That is true *once he has a saved
 * job recipe for the thing he is pricing*. His FIRST fence is not a three-minute job — it
 * is setting up the recipe. So every sentence claiming speed carries that condition in the
 * same breath, and `honest-claims.test.ts` refuses one that does not. A contractor who
 * tries it at the gate on an empty account and fails will never open it again.
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
   * The interim call to action. Registration is designed (ADR 0015) and not built, so this
   * is a mailto: honest, zero dependencies, and no personal data handed to a third-party
   * form service for an address we can collect ourselves shortly. Replaced by the real
   * sign-up when the API's HTTP transport lands.
   *
   * `info@` rather than `hello@`: it is what a contractor guesses, and it reads as a
   * business rather than a startup. One line to change if the owner prefers another.
   */
  contactEmail: "info@pryvis.com",

  /** Empty on purpose. See the file header. */
  socialProof: [] as readonly { readonly quote: string; readonly who: string }[],

  /**
   * The chrome's words. Here rather than in layout.tsx for the same reason as everything else: the
   * first draft had the footer tagline written into the component, and the content-source guard
   * refused it. The rule applies to the easy words too, or it is not a rule.
   */
  chrome: {
    skipToContent: "Skip to content",
    nav: [
      { href: "/features", label: "What it does" },
      { href: "/pricing", label: "Pricing" },
      { href: "/about", label: "About" },
    ],
    footerTagline: "Estimating and invoicing for contractors. Built in Jamaica.",
    termsLabel: "Terms",
    privacyLabel: "Privacy",
  },

  home: {
    title: "Pryvis — price the job while you are standing there",
    description:
      "Price work from your own material prices and labour rates, quote it on your phone at the gate, then invoice and track what you are owed. Built for contractors in Jamaica.",

    // Leads with the roadside moment, because that is what sells the product in a sentence
    // (design §1, §2 goal 2). The condition — "price it once" — is in the heading itself,
    // not buried in a footnote.
    heading: "Price it once. Then quote it at the gate in minutes.",
    subheading:
      "A client asks what the fence will cost. Instead of guessing, or promising to call back tonight and losing the job, you measure it, pick the fence you have already priced, and give them a number built from your own material prices and labour rates.",

    // Concrete, in their words, no superlatives. A contractor has read "revolutionary"
    // before and it told them nothing.
    points: [
      "Build a job up once — a fence, a bathroom, a square metre of blockwork — from real materials and labour. After that, quoting it is a measurement and a multiplication.",
      "Quote from your phone, standing up, on mobile data. No laptop, no office, no calling back later.",
      "Your prices, not a generic template. Change a supplier price once and your next quote is right, while quotes you have already sent stay as the client saw them.",
      "Send by WhatsApp or email. Your client opens a branded page and accepts or declines, so you have it in writing.",
      "Turn an accepted quote into an invoice, record payments, and see who is late.",
      "See whether the job actually made money once the receipts are in.",
    ],

    // The honest framing of the first run, said plainly rather than hidden. This sentence is
    // the reason the heading is allowed to promise minutes.
    firstRun:
      "Your first job of a kind takes a few minutes to price properly, because you are telling Pryvis what your materials and labour actually cost. Every job like it after that takes about as long as measuring it.",

    forWho:
      "Contractors in Jamaica who price their own work: builders, finishers, electricians, plumbers, and the one-person outfit that has outgrown a paper book. Construction first, other trades next.",
  },

  features: {
    title: "What Pryvis does — Pryvis",
    description:
      "Reusable job recipes, quotes built from your own prices, GCT per line, client approval on a phone, invoicing, payments, retention and job profit.",
    heading: "What it does",
    intro:
      "Everything here exists because a contractor asked for it, or because a paper book was doing the job badly.",
    items: [
      // Recipes first: they are what makes the roadside estimate possible at all
      // (design §3, the features page's job).
      {
        title: "Price a job once, quote it for years",
        body: "Build a job up from its materials and labour — 100 feet of chain-link, a bathroom, a square metre of render — and Pryvis remembers the build-up. The next one is a measurement: enter 90 feet and the price comes out of your own numbers.",
      },
      {
        title: "Quotes from your own numbers",
        body: "Keep your materials, labour rates and equipment in one place and price from them. Change a supplier price once and your next quote is right, while quotes you have already sent stay exactly as the client saw them.",
      },
      {
        title: "GCT handled per line",
        body: "Some lines carry GCT and some do not. Pryvis applies the right treatment line by line, and a document records the rate it was issued under — so a quote from March still reads correctly in December.",
      },
      {
        title: "Your client accepts on their phone",
        body: "Send a link by WhatsApp or email. Your client sees a branded quote and accepts or declines. No app to install, no account to create, no PDF lost in a crowded inbox — and you have their answer in writing.",
      },
      {
        title: "Invoices and what you are owed",
        body: "Turn an accepted quote into an invoice without retyping it. Record payments as they arrive, hold and release retention, and see at a glance who is late.",
      },
      {
        title: "Did the job make money?",
        body: "Put purchases and labour against the job as they happen and compare them with what you quoted. The answer is usually interesting and occasionally uncomfortable.",
      },
      {
        title: "Built for the phone you already have",
        body: "Quoting happens on a site, standing up, in sunlight, on mobile data. That is what this is designed for, not a desk.",
      },
    ] satisfies readonly Feature[],
    next: "Coming next, in this order and one at a time: staged deposit and progress invoicing, a signed record of the client's acceptance, change orders as their own documents, and supplier price comparison.",
  },

  pricing: {
    title: "Pricing — Pryvis",
    description: "Start free. Quoting is free; you pay when Pryvis starts helping you get paid.",
    heading: "Start free",
    intro:
      "Quoting is free, for as long as you want it. You pay when Pryvis starts helping you get paid — invoicing, payment recording and job costing. Final prices in Jamaican dollars are being set now.",
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
      "Pryvis started from two specific problems. A contractor standing at a gate, asked what a job will cost, who has to either guess or promise to call back — and often loses the work either way. And the evening afterwards, spent pricing with a paper book, a calculator and last month's receipts.",
      "So it is built around the parts that actually cost contractors money: pricing a job once and reusing it, quoting from real supplier prices rather than memory, getting the client's acceptance in writing, and knowing whether the job made anything once the receipts are in.",
      "It is Jamaican first: GCT treated line by line, prices in Jamaican dollars, quotes sent the way clients here actually read them. Trinidad and Tobago is next, and the tax and currency rules are configuration rather than a rewrite.",
      "It is early, and there is no pretence otherwise on this site: no invented customer numbers, no testimonials we have not been given. If you are a contractor willing to tell us what is wrong with it, we would rather hear from you now than after launch.",
    ],
  },

  legal: {
    /**
     * Drafts, and labelled as such on the page. Terms and a privacy policy carry legal
     * responsibility and are required before a self-service sign-up that takes payment
     * (ADR 0015, Rule 20). The owner approves the words; these say what is actually true
     * about our data handling rather than being boilerplate from a company with different
     * processors.
     */
    draft: true,
    lastReviewed: "2026-09-24",

    /**
     * The banner's words. They were written inside DraftBanner.tsx first, and the
     * content-source guard refused that — correctly, because this is the most
     * consequential sentence on the site and it must be editable by the person who
     * carries the legal responsibility for it.
     *
     * `{subject}`, `{name}` and `{date}` are filled in by the component.
     */
    draftLabel: "Draft — not yet in force.",
    draftNotice:
      "{subject} describes what we actually do with data today, but it has not been reviewed by a lawyer or approved by the owner of {name}. Do not rely on it. Last written {date}.",
  },
} as const;
