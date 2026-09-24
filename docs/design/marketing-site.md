# Design — the public site at pryvis.com

**Status: Proposed.** Awaiting the owner's approval. No page is built or un-parked until then
(Rule 1.1).

**Brief:** §17a, inside §18 step 2 (the first end-to-end vertical slice).
**Rules:** 1.1 (this gate), 2 (readable), 3 (no country branching in copy either), 18 (register any
tool), 20 (the public site and what we say on it).
**Decisions it implements:** ADR 0018 (pages in our own app, not a site builder), ADR 0007 (tiers),
ADR 0015 (self-service sign-up), ADR 0017 (trade-neutral, construction first).
**Related:** `PRODUCT-OPPORTUNITIES.md` — the terms of service carry the price-index consent, and
that has a deadline the rest of this does not.

---

## 1. The problem, and whose it is

**Marva** runs a five-person finishing outfit in Portmore. She prices work in the evening with a
paper book, a calculator and last month's supplier receipts. Her quotes go out as a WhatsApp voice
note and a number, and she has twice been told "that's not what you said". She has never bought
software. She has a mid-range Android phone, pay-as-you-go data, and about ninety seconds of patience
for something a friend mentioned.

Marva is who the site is for. Not "SMEs in the construction sector".

**What she needs from this site, in this order:** *is this for someone like me? what would it
actually do for me on Monday? what does it cost? can I try it without talking to anyone?*

**The second reader** is Dane, who does estimating for a firm with an office and three crews. He
wants to know whether more than one person can use it, who can approve a discount, and whether it
will produce something his boss will accept. He reads more than Marva does and needs to find the
Business tier without being sold to.

**The third reader** is nobody we have met: a supplier, a developer, a journalist, someone the owner
is talking to. They need to understand what the company is in thirty seconds and find a way to make
contact.

## 2. What this has to achieve to be worth building

Stated so failure is recognisable, not so it always passes:

1. **A contractor arriving cold can say what Pryvis does in one sentence, without scrolling.** If
   five contractors read the hero and three describe it wrongly, the copy has failed.
2. **A contractor can find what it costs in one tap**, and is not misled: they learn quoting is free
   and invoicing is paid, before they invest any effort.
3. **Someone who wants in can act**, on the day they arrive, without a phone call.
4. **It loads and is readable on a mid-range phone on mobile data, outdoors.** Not "is responsive".
5. **Nothing on it is untrue.** No invented customers, no placeholder price, no borrowed logos.
6. **It works while the product is asleep.** The API on a free tier cold-starts; the front door must
   not look broken because of it.

**Explicitly not goals:** ranking for competitive search terms, a blog, a content programme, a
brand identity beyond a wordmark and a colour, or conversion optimisation. All premature before
anyone can sign up.

## 3. The shape

### Pages, and the one job each has

| Page | Its one job | Must contain | Must not |
|---|---|---|---|
| `/` | Make Marva recognise her own problem and see the shape of the answer | One-sentence heading, five concrete capabilities in her words, the CTA, who it is for | Feature tables, jargon, superlatives, a carousel |
| `/features` | Answer "what would it do for me on Monday" | Seven short cards, each a real capability with the reason it exists; what is coming next | Screenshots of unbuilt screens, roadmap promises with dates |
| `/pricing` | Let her decide without a conversation | The three tiers, what each includes, **"price being set"** where it is, what happens if she stops paying | A placeholder number, a fake discount, "contact us for pricing" on a self-service tier |
| `/about` | Establish we are real, local, and early | Why it exists, that it is Jamaica-first, that it is early — said plainly | Founder mythology, a team page of one, invented traction |
| `/legal/terms`, `/legal/privacy` | Be true, and be readable | Plain language; the actual processors; that data leaves Jamaica; the aggregate-data consent | Boilerplate naming processors we do not use |

Six pages. Each addition needs a reason.

### The journey, and the hole in it

```
   site  →  sign up  →  first quote  →  send  →  accepted
                ↑
        does not exist yet
```

**Registration is designed (ADR 0015) and not built.** So the CTA has nowhere to go, and this is the
design's biggest decision:

- **Chosen: a `mailto:` "ask for early access".** Zero dependencies, no third-party processor, no
  personal data collected before we have a lawful basis written down, and honest — it says sign-up
  opens shortly. It converts worse than a form. That is accepted for a few weeks.
- **Rejected: a free form service** (Formspree, Tally). Better conversion, but it means a new
  processor in the register, a privacy note, and other people's email addresses in someone else's
  database for an address we can collect ourselves within weeks.
- **Rejected: build a waitlist endpoint now.** It needs HTTP transport, which does not exist, and
  would pull the API's first public endpoint forward ahead of its own design.
- **Trigger to revisit:** the moment registration exists, the CTA becomes a real sign-up, and this
  design is superseded rather than amended.

### Content model

Every word lives in typed data (`web/content/site.ts`), not in JSX (ADR 0018). Moving to a CMS later
replaces the loader. A sentence written directly into a component quietly removes that option, so
that is the thing to watch for in review.

### Technical shape

- Next.js App Router in `new-app/web`, statically rendered. No client-side data fetching: the pages
  are identical for everyone, so they are HTML on a CDN and survive a sleeping API.
- **Public pages at the root, the product under `/app/*`.** One origin, one deploy, one certificate;
  the sign-up link is an internal link rather than a hand-off. `app.pryvis.com` stays possible later
  because every internal link is relative.
- One stylesheet, tokens first, system font stack. **No font CDN, no analytics, no tag manager, no
  chat widget** (Rule 20) — each is a processor to register and a consent banner to justify.
- Colour and type chosen for a phone held outdoors: high contrast, 17px base, no thin grey on white.
  Dark mode because a 6am start happens in a dark truck cab.
- Touch targets ≥ 48px. Skip link. Visible focus. Semantic landmarks.

### Trade-neutral wording (ADR 0017)

Construction is the first trade, not the only one. The copy says "contractors" and names trades as
examples rather than defining the product as construction software. Naming the product after one
trade in prose is how the verticalisation decision gets undone in prose and then in code.

## 4. Trade-offs, stated

- **Honesty over conversion.** No social proof, no urgency, no invented numbers. We will convert
  worse than a competitor who fabricates. That is the trade, taken deliberately.
- **`mailto:` over a form.** Worse conversion, no new processor. Temporary.
- **Six pages, not a site.** Faster to true and to maintain; weaker for search. Search does not
  matter before sign-up exists.
- **Our own pages over a site builder.** Slower to something pretty; no migration later (ADR 0018).
- **Legal pages written to be true rather than comprehensive.** They will be shorter than a lawyer's,
  and they will not claim protections we do not provide. The owner and a lawyer settle the final
  words; until then they are labelled drafts and are not presented as final.

## 5. How it will be proved

Guards over the site's own pages, each with a planted defect (Rule 8):

| Guard | Plant that must fail it |
|---|---|
| Every page has a title and a meta description | Remove one page's metadata |
| Every internal link resolves to a real route | Add a link to `/plans` |
| No external script, stylesheet or font host appears in any page | Add a Google Fonts link |
| No social-proof claim unless `site.socialProof` has evidence | Add "trusted by 200 contractors" to the hero |
| No tier shows a price unless its `priceLabel` is set | Put "$4,000/mo" on Pro |
| Legal pages carry the draft banner while `legal.draft` is true | Set `draft: false` with the wording unapproved |
| Every page's copy comes from `content/`, not inline JSX | Hard-code a sentence in a page |

Plus what a test cannot judge, and so needs a person: **read the hero to three contractors and ask
them what it does.** If they describe it wrongly, the copy is wrong — no guard will ever say so.

Not proved by any of this: that the pages convert, that the design is attractive, or that the legal
wording is sufficient. The first two need real visitors; the third needs a lawyer.

## 6. Dependencies

| Needed | From | Blocks |
|---|---|---|
| Approval of this design | Owner | Everything below |
| **Aggregate-data consent wording** for the terms | Owner's decision on the price index (`PRODUCT-OPPORTUNITIES.md`) | The terms, and therefore registration |
| Approval of the terms and privacy wording | Owner, ideally with a lawyer | Removing the draft banners; legally, sign-up |
| Prices for Pro and Business | Owner | The pricing page saying anything but "being set" |
| A wordmark, and a square icon | Owner | Header, favicon, social preview |
| `hello@pryvis.com` receiving mail | Owner (GoDaddy DNS) | The CTA working at all |
| Registration endpoint | Us, after transport | Replacing the `mailto:` |

**The CTA dependency is the sharp one:** if `hello@pryvis.com` does not receive mail, the site's only
call to action is broken, and that is worse than having none.

## 7. What already exists

An implementation of most of this is parked on `wip/marketing-site-built-before-design` — built
before this design existed, which is why it is parked (Rule 1.1). If the design is approved close to
as written, that branch is the starting point and needs: the legal pages finished, the guards in §5
written, and a review against this document. If the design changes materially, the branch is
abandoned rather than bent to fit.
