# 0018 — The marketing site is pages in our own Next.js app, on free tooling, with no lock-in

**Date:** 2026-09-24
**Status:** Accepted
**Decided by:** the owner — build it now, on free tools that can be converted or upgraded later
**Relates to:** ADR 0010 (repo layout), ADR 0015 (self-service sign-up), Rule 10, Rule 18

## Context

The Phase 0 audit found there is **no marketing website**: `/` redirects to `/dashboard`, so the
product has no public description of what it is, who it is for, or what it costs. That is a launch
dependency, not a documentation gap — a self-service sign-up (ADR 0015) needs somewhere to sign up
*from*, and a contractor who lands on a login form leaves.

The owner owns **pryvis.com** and wants it built now, on free tooling, convertible or upgradable
later.

"Free" has two very different meanings here, and the difference is the decision:

- free **hosting** for something we own and can move; or
- a free **site builder** — Framer, Webflow, Carrd, Wix — where the content lives in someone
  else's database, behind their editor, in their format.

## Decision

**The marketing site is static pages in our own Next.js app** (`new-app/web`), deployed on
Vercel's free tier, served from `pryvis.com`. Not a site builder.

- **One application, two audiences.** `/`, `/features`, `/pricing`, `/about` and `/legal/*` are
  public marketing pages; the product lives under `/app/*` behind authentication. One deploy, one
  domain, one certificate, and a sign-up link that is an ordinary internal link rather than a
  hand-off between systems.
- **Content lives in typed data files** (`web/content/*.ts`), not inside JSX and not in a
  third-party CMS. That is what makes it convertible: moving to a headless CMS later means
  replacing the loader, because every page already reads its words from data rather than having
  them baked into markup.
- **Statically rendered, no client-side data fetching.** The pages are the same for everyone, so
  they are HTML on a CDN. That is what survives a cold-starting API and a sleeping free-tier
  instance: the marketing site stays up when the product is asleep.
- **No third-party scripts. No trackers, no tag manager, no chat widget, no font CDN.** Each one is
  a processor to register (Rule 18), a consent banner to justify, and a performance cost. If
  analytics are wanted, the choice is privacy-preserving and server-side, and it goes in the
  service register with everything else.
- **Nothing is claimed that is not true.** There are no customers yet, so there are no
  testimonials, no logos, no "trusted by 500 contractors", and no invented review counts. Prices
  are not set, so the pricing page says what each tier *includes* and is honest that the price is
  coming — it does not display a placeholder number that someone will screenshot.

## Alternatives considered

**A free site builder (Framer, Webflow, Carrd, Wix).** Faster to a pretty page, and genuinely
tempting. Rejected on Rule 10: the content becomes theirs, in their format, behind their editor,
and "upgradable later" turns into a migration nobody scheduled. It also splits the sign-up journey
across two systems and two domains, which is where conversion is lost and where cookie and consent
problems start.

**A separate static-site generator in its own folder** (Astro, Eleventy, plain HTML). Lighter than
Next.js and perfectly portable. Rejected because `web/` has to exist anyway for the product UI, and
one framework means one build, one set of design tokens, one test setup and one deploy — against
two of everything for a handful of pages. Revisit if the marketing site ever grows a blog large
enough to want a content pipeline of its own.

**WordPress on free hosting.** Rejected: a database, a plugin surface and a patching obligation, to
serve five static pages.

**Marketing on `pryvis.com`, app on `app.pryvis.com`.** The conventional split, and a reasonable
future move. Rejected for now: two origins means CORS, cookie-domain decisions and a second deploy
target, for no benefit at this size. **The path is kept open** because every internal link is
relative and the app is already under its own path prefix.

## Consequences

- **The site can ship before the API exists**, because it is static and calls nothing. That is why
  it is worth doing now rather than after transport.
- **The sign-up call to action has nowhere to go yet.** Registration is designed (ADR 0015) and not
  built, so the interim CTA is a plain `mailto:` — honest, zero dependencies, and no personal data
  handed to a third party. It is deliberately temporary and is replaced by the real sign-up the
  moment transport lands. A free form service would convert better and would mean registering a new
  processor and writing consent copy for an address we can collect ourselves in a fortnight.
- **Legal pages are now on the critical path.** Self-service sign-up that will take payment needs
  Terms of Service and a Privacy Policy, and the privacy policy has to name the processors and the
  fact that data leaves Jamaica (`SERVICE-REGISTER.md` §6). **These need a human with legal
  responsibility — the owner — to approve the words.** They ship as clearly-marked drafts and must
  not be presented as final.
- **Prices are the one thing blocking a complete pricing page.** The tier *contents* are settled
  (`TIERS.md`); the numbers are the owner's.
- Free tier limits apply, and the trigger for paying is the same one Rule 10 already asks for in an
  ADR: the first paying tenant.
- A site that is only ever read by us proves nothing. **Accessibility and mobile performance are
  requirements, not polish:** a Jamaican contractor arrives on a phone, on mobile data, in
  sunlight.
