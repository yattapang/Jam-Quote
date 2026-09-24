/**
 * The legal pages' words, as data.
 *
 * WHY THESE ARE HERE AND NOT IN THE PAGES
 *
 * The first draft wrote them as prose inside the page components, and the content-source guard
 * refused it — correctly. Long-form text is exactly the content most likely to be revised by
 * someone who does not write TSX: a lawyer, or the owner. Keeping it as data means their revisions
 * land in one file, the pages stay presentation, and the same rule applies to every word on the
 * site rather than to the easy words only (ADR 0018).
 *
 * WHAT IS DELIBERATELY ABSENT FROM THE TERMS
 *
 * The clause permitting aggregate, non-identifying use of price data to build a material price
 * index. It cannot be retro-fitted once tenants have signed up under terms silent on it, so it is a
 * dependency of registration (brief §5a, docs/PRODUCT-OPPORTUNITIES.md). It is the owner's decision
 * to make, and drafting it speculatively would invite it to be shipped unread.
 *
 * Both documents are drafts until the owner approves them; `site.legal.draft` controls the banner.
 */

export interface Section {
  readonly heading: string;
  readonly paragraphs?: readonly string[];
  readonly bullets?: readonly string[];
  /** Renders the contact address as a link. Used once, at the end of each document. */
  readonly contact?: boolean;
}

export const privacy = {
  heading: "Privacy",
  bannerSubject: "This privacy notice",
  sections: [
    {
      heading: "Two kinds of people in this notice",
      paragraphs: [
        "You, the contractor using Pryvis. And your customers, whose names and contact details you put into it. You chose to use Pryvis; they did not — so their details get the same care as yours, and are never used for anything except showing them to you and putting them on your documents.",
      ],
    },
    {
      heading: "What we hold",
      bullets: [
        "Your account: name, email address, business details, and a hash of your password.",
        "Your business data: customers, quotes, invoices, prices, materials, labour rates, payments.",
        "Records of documents sent on your behalf — to whom, when, and whether delivery succeeded.",
        "Technical logs needed to keep the service running and secure. These do not contain your customers’ personal details.",
      ],
    },
    {
      heading: "Who else processes it, and where",
      paragraphs: [
        "Pryvis runs on services outside Jamaica, so your data and your customers’ data are stored and processed abroad. You are entitled to know exactly who.",
      ],
      // These names come from docs/SERVICE-REGISTER.md, and a guard checks they are all present.
      // Boilerplate naming processors we do not use would be a false statement about where a
      // contractor's customers' details are held.
      bullets: [
        "Neon — the database. Holds all account and business data.",
        "Render — runs the application. Data passes through it.",
        "Vercel — serves this website and the app interface.",
        "Resend — sends email on your behalf: quotes, invoices, reminders, password resets. It therefore handles the recipient’s address and the document.",
        "WiPay — card payments, where you use them. Card details go directly to WiPay and never reach us.",
      ],
    },
    {
      heading: "What we do not do",
      paragraphs: [
        "We do not sell data, and we do not share it for advertising. This site carries no trackers, no advertising pixels and no third-party analytics.",
      ],
    },
    {
      heading: "Artificial intelligence",
      paragraphs: [
        "We use AI tools to help build and maintain Pryvis. We do not send your data or your customers’ data to them — only redacted or made-up examples. That is a rule we hold ourselves to in writing, not a preference.",
      ],
    },
    {
      // Added with the audit log (ADR 0020). An IP address is personal data and the trail keeps
      // one, so shipping that table without saying so here would have made this notice untrue -
      // which is the failure the site's own guards exist to prevent.
      heading: "Records of what happened in your account",
      paragraphs: [
        "We keep a record of significant actions in your account: who changed a price or a permission, when, and from which internet address. You can see this record, including any action taken by Pryvis staff on your account.",
        "We keep it because it is the only way to answer “who changed this?” after the fact, and the only way you or we could investigate if something went wrong. It cannot be edited or deleted by anyone at Pryvis, deliberately — a record that can be altered is not a record.",
        "We keep it for seven years, so that it outlives the quotes and invoices it describes and your business record-keeping obligations. After that it is deleted automatically. Closing your account does not delete it: if there were ever a dispute, it is the evidence for both of us.",
      ],
    },
    {
      heading: "How long we keep the rest",
      paragraphs: [
        "While your account is open, and for a period afterwards so you can come back to your own quote and invoice history. You can ask for your data to be exported or deleted. A document you have already sent to a customer is a record of a transaction, and deleting your account does not reach into their inbox.",
      ],
    },
    {
      heading: "Your choices",
      paragraphs: [
        "You can ask what we hold about you, ask for a copy, ask for a correction, or ask for deletion. Write to us and a person will answer.",
      ],
      contact: true,
    },
    {
      heading: "If something goes wrong",
      paragraphs: [
        "If data is exposed, we will tell the people affected and say what happened, what we know and what we are doing — rather than the smallest statement we can get away with.",
      ],
    },
  ] satisfies readonly Section[],
} as const;

export const terms = {
  heading: "Terms",
  bannerSubject: "These terms",
  sections: [
    {
      heading: "What Pryvis is",
      paragraphs: [
        "Software for pricing work, sending quotes, issuing invoices and tracking payments. It helps you produce documents and keep records. It is not an accountant, a lawyer or a tax adviser, and a figure it calculates is still your figure to check.",
      ],
    },
    {
      heading: "Your account",
      bullets: [
        "One business per account. You are responsible for what the people you invite do in it.",
        "Keep your password to yourself. Tell us promptly if you think someone else has it.",
        "Your data is yours. You can export it, and we will not hold it hostage.",
      ],
    },
    {
      heading: "Paying",
      bullets: [
        "The free tier is free, and is not a trial that expires.",
        "Paid tiers are billed for the term you choose. If a payment fails or lapses, paid features stop and your data stays intact and readable.",
        "Where you pay another way — bank transfer or cheque — your account is upgraded once we have checked the payment against our bank records, which takes longer than a card.",
      ],
    },
    {
      heading: "What we do not promise",
      paragraphs: [
        "We do not promise the service is never unavailable. We are a small operation on modest infrastructure, and we would rather say so than print a number we cannot stand behind. We will tell you about planned work, and we keep backups.",
        "We do not promise the software is free of defects. When we find one that affects your figures, we tell you rather than quietly correcting it.",
      ],
    },
    {
      heading: "Fair use",
      paragraphs: [
        "Do not use Pryvis to send people documents they have not asked for, to impersonate someone else, or to break the law. We may suspend an account doing any of those, and we will say why.",
      ],
    },
    {
      heading: "Ending it",
      paragraphs: [
        "You can stop whenever you like and take your data with you. We can end an account for the reasons above, or if we stop offering the service — in which case you get notice and time to export everything.",
      ],
    },
    {
      heading: "Questions",
      paragraphs: ["Write to us."],
      contact: true,
    },
  ] satisfies readonly Section[],
} as const;
