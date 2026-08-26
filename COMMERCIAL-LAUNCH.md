# JamQuote — from field testing to commercial deployment

**Written 2026-08-21.** Companion to `PLANNING.md`, which covers what is built
and what is left to build. This covers something different: what has to be true
before **strangers pay for this**, as opposed to two contractors trying it as a
favour.

The distinction matters because most of what follows is not code. Every feature
that was agreed is built. What stands between here and charging money is
hosting, delivery, law, and the answer to "what happens when it breaks at 6pm
on a Friday".

---

## 0. How to use this document

Work the gates in order. **Gate 1 items are genuine blockers** — shipping
without them means either the product silently fails or the business takes a
risk it cannot see. Gate 2 items are things you will wish you had done in month
two. Gate 3 can wait for real demand.

Where something needs a decision rather than work, it says **DECIDE** and names
who can make it. Where I am not certain, it says so rather than guessing —
particularly on anything legal.

---

## 0.5 While field testing runs — do these in parallel

**Owner's sequence, agreed 2026-08-21: contractor testing FIRST, then this
document.** That is the right order. But four things below are worth doing
*during* testing rather than after, because they are free now and get more
expensive or less useful with every week that passes.

| Do it now | Why it cannot wait until after testing |
|---|---|
| **The backup restore drill** (1.3) | 11 MB and 41 tables today. This is the smallest and quickest this database will ever be, and the procedure has to be known before it is needed, not discovered during an incident. |
| **Ask the testers what they would pay** (§4) | Only answerable by someone who has just used it. Ask a week in, while the experience is fresh — not in a follow-up call a month later. |
| **Write down every question they ask** (§1) | Impossible to reconstruct afterwards. Each one is a support article or a UI fix; asked twice, it is a UI fix. |
| **Settle the NAME, then start the domain purchase and DNS verification** (1.1) | DNS propagation and Resend verification take days, and a warmed sending domain needs weeks of low volume before mailbox providers trust it. **Blocked on the rename below** — buying and warming a domain you then abandon throws the whole warming period away. |

**Everything else in this document can and should wait** until testing tells
you whether to spend the money at all.

---

### 0.6 The rename — decide it before anything is bought or printed

**Raised by the owner 2026-08-21: "JamQuote" is too specific for where this is
going.** They are right on both halves. *Jam* pins it to one island; *Quote*
pins it to one of five things the app now does — quoting, invoicing, chasing
payment, job costing and accountant exports.

**Do it now, or accept it forever.** The cost of renaming rises sharply and
permanently at three points, all of which are close:

| Once this happens | The rename costs |
|---|---|
| A domain is bought and warmed as a sender | The warming period, restarted from zero |
| Contractors are onboarded | Their bookmarks, their habits, and an explanation to every one of them |
| A quote PDF reaches a CLIENT | Nothing — the documents are signed with the CONTRACTOR's business name, not ours. This is the one place the name does not leak. |

**Today the name lives in exactly four places**, none of them public: the repo,
the npm scope `@jamquote/*`, a handful of env var names, and platform email
copy. That is a day's work. After launch it is a migration with an audience.

**What the name has to survive:**

- **Being read aloud down a phone line.** A contractor will spell it to their
  accountant. Anything needing "no, with a K" is a tax on every conversation.
- **Being a sending domain.** Short, unambiguous, no doubled letters people
  drop.
- **Growing past quoting AND past Jamaica** — the two traps being escaped.

**Not a constraint, usefully:** it does not need to appeal to the contractor's
CLIENT. Quotes and invoices carry the contractor's own business name and sign
off as them. This is a name for tradespeople, not homeowners.

## 1. Exit criteria: when is field testing actually finished?

Field testing is not finished when the contractors stop complaining. It is
finished when you can answer these with evidence, not impression:

| Question | Evidence that answers it |
|---|---|
| Did a contractor quote a real job, unaided, on a phone? | A quote in the database they created without you on the call |
| Did a client receive it and answer? | A `Quote` with `decidedByName` set — the client's own act, through the link |
| Did the money seam hold? | An invoice converted from a quote, part-paid, with the figures matching what the contractor expected |
| Did anyone use it twice? | Two quotes from the same tenant, more than a week apart |
| Would they pay? | Asked directly, after they have used it — not before |

**The last one is the only one that decides whether to launch.** The others
decide whether it works.

**Two more things to capture while testing, because they are cheap now and
expensive to reconstruct later:**

- **Every question they ask you.** Each one is either a support article or a UI
  fix. A question asked twice is a UI fix.
- **Anything they did that you did not expect.** The recurring defect class in
  this project is the design not matching what the word on the button means to
  the person clicking it. That only shows up here.

---

## 2. Gate 1 — blockers. Do not charge anyone until these are closed.

### 1.1 A sending domain, and email that actually delivers

**Status: the single largest functional gap.** Client email is deliberately
disabled (`clientMailStatus` in core). Contractors can send by WhatsApp and
PDF, which works — but a paying customer will expect email, and platform mail
to the contractor themselves (overdue digests, subscription notices, quote
decision alerts) has the same limitation: from the `resend.dev` test sender it
reaches only the account owner.

**Work:**
1. Buy the domain. **DECIDE** — owner.
2. Verify it in Resend: SPF, DKIM, and a DMARC record. Do not skip DMARC; mail
   from a new domain to Gmail without it lands in spam, and a quote in a
   client's spam folder is indistinguishable from a quote that was never sent.
3. Set `QUOTE_FROM_EMAIL` on **Production** in Vercel (currently Preview only)
   and `EMAIL_FROM` on Render.
4. Send a real quote to a Gmail, a Yahoo, and an @gov.jm-style corporate
   address before believing it works.

**Set reply-to to the contractor's own address.** A client replying to a quote
must reach the contractor, not JamQuote. This is not built yet — see
`PLANNING.md` §4i.

**Warming matters.** A brand-new domain sending its first hundred emails to
strangers looks like spam infrastructure. Send the first weeks' volume slowly.

### 1.2 Paid hosting — the free tier will break three features

**Status: a real, verifiable defect at launch, not a nicety.**

`render.yaml` says `plan: free`. A free Render service **sleeps when idle**,
and three daily jobs depend on it being awake:

| Cron | What silently stops |
|---|---|
| `SubscriptionSweepService` | Renewal reminders and automatic revert-to-free. Tenants stop paying and keep Pro. |
| `InvoiceOverdueService` | Invoices never become OVERDUE; contractors are never told what is outstanding |
| `QuoteExpiryService` | Quotes never expire |

`SubscriptionSweepRun` exists precisely so "no reminders sent" can be told apart
from "the sweep never ran" — that table is the check, and it should be looked at
in week one after launch.

The cold start also costs the first visitor of the day ~90 seconds. A
contractor who opens the app at a client's kitchen table and waits ninety
seconds will not open it again.

**Work:** move Render to a paid instance. Budget for it in pricing (see §4).
Then confirm from `SubscriptionSweepRun` that the daily jobs fire.

### 1.2b Get the topology right BEFORE it costs something to change

**Verified 2026-08-21.** Where things actually run:

| Component | Region | Verdict |
|---|---|---|
| Neon database | `us-east-1` (Virginia) | **Correct.** Closest AWS region to Jamaica. |
| Vercel web | `iad1` (Virginia) | **Correct**, and co-located with the database. |
| Render API | `oregon` (us-west-2) | **Wrong.** |

Every request currently travels Jamaica → Virginia (Vercel) → **Oregon** (API)
→ **Virginia** (Neon) → back. It crosses the continent twice for no reason,
adding roughly 60–70ms to every database round trip, and Prisma issues several
per page.

**Neither region can be changed in place.** A Neon project's region is fixed at
creation; a Render service's is fixed at creation too — moving means a NEW
service. The database is in the right place, so the fix is to recreate the API
in `virginia`.

**Cost of doing it now:** the API URL changes, so `NEXT_PUBLIC_API_BASE_URL` on
Vercel and `apps/mobile/eas.json` need updating, and API and web must be
redeployed together as always. With three test tenants that is twenty minutes.
**The cost is identical at fifty paying tenants, except that fifty people are
watching.** Do it as part of the move to paid hosting (1.2) — a new service is
being created either way.

**Also verify on Render, which cannot be read from the repo:** `DATABASE_URL`
should use the **`-pooler`** host and `DIRECT_URL` should NOT. The local `.env`
has both pointing at the same unpooled host, which is fine for development. In
production, unpooled means connection exhaustion under concurrency — a failure
that appears exactly when paying customers arrive.

**The good news, and it is worth stating plainly: going Pro on Neon IS just a
transaction.** Upgrading the plan does not recreate the project, move data, or
change the connection string; it changes storage limits, compute allowance and
the point-in-time-recovery window. Nothing in the app code depends on any
Neon-specific feature — it is plain Postgres 18.6 behind Prisma — so the
migration risk is genuinely low. **The things that are NOT reversible are the
regions above, which is why they belong here rather than in a later phase.**

### 1.3 Backups, and a restore you have actually performed

**Status: unknown, and unknown is not acceptable for other people's business
records.**

The database is Neon, provisioned through Vercel. Before launch:

1. Find out what point-in-time recovery the current Neon plan gives, and for
   how long. **Verify — do not assume.** This is one of the things a paid plan
   buys, so check it against what the Pro plan would give before deciding the
   upgrade is only about storage.

   **Do this drill NOW, at 11 MB and 41 tables.** Not because you need the
   backup today, but because the procedure must be known before it is needed,
   and it will never again be this quick to rehearse.
2. **Perform a restore.** Restore to a scratch branch, point a local API at it,
   and confirm a quote you know exists is there. A backup that has never been
   restored is a belief, not a backup.
3. Write down the recovery steps somewhere that is not this repo — if the
   repo's host is what broke, you cannot read them.

**This is the one item where the downside is unrecoverable.** Everything else
on this list costs money or reputation; this one costs a contractor their
records.

### 1.4 How tenants actually pay you

**Status: manual only. Card checkout is blocked on WiPay credentials.**

Today the platform records payments by hand (`SubscriptionPayment`), derives
standing from the ledger, and reverts to free when a term lapses. That machinery
is real and tested. What does not exist is a way for a tenant to *pay* without
you doing something.

**DECIDE — owner.** Three viable shapes, in ascending order of work:

1. **Bank transfer / mobile money, recorded by hand.** Works today, zero build.
   Fine for the first 10–20 tenants and honestly normal in Jamaica. Costs you
   an hour a month and does not scale past ~30.
2. **WiPay card checkout.** Blocked on credentials — chase them, since the lead
   time is theirs, not yours.
3. **Invoice-on-terms for larger contractors.** No build; just policy.

**Recommendation: launch on (1), pursue (2) in parallel.** Do not delay launch
for card payments — manual collection at 10 tenants is an evening's work, and
you will learn more from having 10 paying tenants than from a payment
integration with none.

### 1.5 Terms of service, privacy policy, and Jamaican data protection

**Status: not started, and I am not the right source for the details.**

You will be holding, on behalf of other businesses: their clients' names,
addresses, phone numbers, email addresses and TRNs, plus the contractors' own
tax numbers and pricing. In Jamaica this engages the **Data Protection Act
(2020)**, which establishes an Information Commissioner and obligations on data
controllers — registration among them.

**I am not able to tell you reliably whether JamQuote must register, what the
current deadlines are, or what the penalties look like.** My knowledge has a
cutoff and this is exactly the kind of thing that changes. **Get an hour with a
Jamaican attorney who does technology or data-protection work** before taking
paying customers. That hour is cheap relative to the exposure.

Bring these specific questions:

- Is JamQuote a data controller, a processor, or both, for the client records
  its tenants store?
- Does it need to register with the Information Commissioner? By when?
- What must the privacy policy say, and where must it be shown?
- What are the breach-notification obligations and timelines?
- Anything specific about holding **TRNs** — they are tax identifiers and may
  carry their own handling requirements.

**What to prepare regardless:**

- **Terms of service** — including, critically, what happens to a tenant's data
  when they stop paying. The system currently *reverts them to free* and they
  keep trading; say so, because the alternative reading is that you delete
  their records.
- **Privacy policy**, linked from the login page and the public share pages,
  since clients who never signed up land there.
- **A data export a tenant can take with them.** The accountant CSVs are most
  of this already. Being able to leave is both a legal expectation and the
  thing that makes people comfortable joining.

### 1.6 Know what broke before the customer tells you

**Status: nothing is watching.**

There is no error tracking. Today that is fine — you are the only user. At 20
tenants a 500 on quote creation is invisible until someone rings you, and most
will not ring; they will stop using it.

**Work, in order of value:**
1. **Error tracking** (Sentry or equivalent) on both API and web. The free tier
   is enough at this size.
2. **Uptime check** on `/api/health`, which already reports `db` and `email`.
3. **One alert that reaches your phone.** An alert you read on Monday is a
   report, not an alert.

---

## 3. Gate 2 — do these in the first month

### 2.1 Enforce the tiers you decided

§4k accepted **Free / Pro / Books**. Only the quote cap is enforced; everything
else — job costing, purchases, exports, reports — is open to every tenant.

That is *correct for field testing*, where paywalls teach you nothing. It is
wrong once people pay, because there is nothing to buy.

**Before enforcing, read §4k's principle again: gate capacity and insight,
never correctness.** GCT, PDFs, share links and converting to an invoice stay
free at every tier. A quote with wrong tax on it is not a lesser product, it is
a broken one, and a contractor who sends a client a wrong invoice because they
were on the free tier will never trust the paid one.

### 2.2 Onboarding that does not need you

A new tenant currently lands in an empty app. The first quote is the moment
they decide whether this is worth it, and right now it requires knowing that
materials, labour rates and jobs exist as concepts.

Cheapest thing that works: **a starter library** — twenty common Jamaican
materials with realistic units, a handful of trades and day rates — offered on
first run and dismissible. `packages/core/src/fixtures` already has the shape.

### 2.3 A support channel, and an answer to "how do I get help?"

**DECIDE — owner.** A WhatsApp number is the honest answer for this market and
costs nothing. Whatever it is, put it in the app, because a contractor stuck at
a client's house will not go looking for it.

### 2.4 Reply-to on client email

Covered in 1.1 but worth its own line: a client replying to a quote must reach
the contractor. Until then every reply comes to you or vanishes.

---

## 4. Pricing — what has to be decided

The machinery is built and configurable from the Staff Console without a
release (`PricingConfig`). Current values:

| Setting | Value now |
|---|---|
| Free quotes per month | 5 |
| Pro monthly | J$2,000 |
| Pro annual | J$20,000 (two months free) |

**DECIDE — owner, after field testing, not before:**

1. **Does J$2,000/month survive contact with a real contractor?** Ask the
   testers directly once they have used it. The answer is worth more than any
   amount of reasoning here.
2. **Is 5 free quotes/month right?** Too high and nobody upgrades; too low and
   nobody gets far enough to see the value. Watch what the testers actually hit.
3. **Does the price cover costs?** Paid hosting, the domain, Resend, and error
   tracking are now real monthly costs. Work out the per-tenant break-even and
   how many tenants clear it.
4. **What does the "Books" tier cost, and is it a tier or an add-on?**

**One trap to avoid: do not launch with an introductory price you intend to
raise.** Raising a price on early customers who took a risk on you is the
fastest way to lose the people most likely to recommend you. Launch at the
price you mean, and discount the annual term instead — which the system already
supports.

---

## 5. Launch sequence

Ordered so that each step is verifiable before the next depends on it.

1. **Close field testing** against §1's exit criteria. Write down what the
   testers asked for; fix anything asked twice.
2. **Domain + email** (1.1). Verify against three real inboxes.
3. **Paid hosting** (1.2). Confirm from `SubscriptionSweepRun` that crons fire.
4. **Backup restore drill** (1.3). Actually restore something.
5. **Legal** (1.5). Attorney, then terms and privacy policy live.
6. **Monitoring** (1.6). Break something on purpose and confirm you hear about
   it.
7. **Decide pricing** (§4) and set it in the Staff Console.
8. **Enforce tiers** (2.1) — last, so the first paying tenants see a coherent
   product rather than a moving one.
9. **Onboard the field testers as the first paying tenants**, at a price they
   agreed to. They are the best-qualified customers you will ever have.
10. **Then grow, slowly.** Ten tenants you can support beats fifty you cannot.

**Deploy discipline stays as it is in `PLANNING.md` §4b: API and web together,
build locally first, migrations apply themselves on boot.**

### 5.1 The recommendations, gathered in one place

Everything above, reduced to the calls I would make. Each is argued for in its
own section; this is the summary to read first when picking this document back
up.

1. **Bundle the region move with the move to paid hosting.** You create a new
   Render service either way — creating it in `virginia` instead of `oregon`
   costs nothing extra at that moment and is otherwise permanent. (1.2b)
2. **Launch on manual payment collection; chase WiPay in parallel.** Ten
   paying tenants collected by hand teach you more than a card integration with
   none, and manual collection at that size is an evening a month. (1.4)
3. **Do not launch with an introductory price you intend to raise.** Launch at
   the price you mean and discount the annual term, which the system already
   supports. Raising prices on the people who took a risk on you is the fastest
   way to lose your best advocates. (§4)
4. **Enforce the tiers LAST**, after pricing is decided and the first tenants
   are onboarded — so they see a coherent product rather than a moving one.
   And keep §4k's principle: gate capacity and insight, never correctness.
   (2.1)
5. **Get the attorney hour before taking money, not before launch day.** It has
   a lead time you do not control, and the answer may change what the terms of
   service have to say. (1.5)
6. **Onboard the field testers as the first paying tenants.** They are the
   best-qualified customers you will ever have, and they have already told you
   whether the price is right.
7. **Do not build anything else first.** Every agreed feature is built. The gap
   between here and a business is not features — see §7.

---

## 6. Day-two operations — the things nobody plans

- **Someone will forget their password.** Reset exists; confirm it works from
  the deployed site before launch, not after.
- **Someone will want their data out.** The accountant CSVs cover most of it.
- **Someone will stop paying.** The system reverts them to free and they keep
  trading — deliberate, documented in §4e. Make sure the terms say it.
- **Someone will ask you to delete their account.** Suspension and deletion
  exist in the console. Know which one you mean, and what the terms promise.
- **A tenant will find a bug that loses them work.** Have a way to look at
  their data — impersonation exists and is audited — and a habit of saying what
  actually happened.

---

## 7. What I would deliberately NOT do before launch

Written down because each is tempting and each would cost weeks:

- **The mobile app.** The web app works on a phone. A second client to maintain
  before there is a business is the wrong order.
- **Automated tax-rate updates.** Deliberately not built (`PLANNING.md` §5) —
  no machine-readable feed of Jamaican rates exists, and a scraper over prose
  would give confident wrong answers about tax. An honest "last verified on"
  beats a wrong number.
- **More features.** Everything agreed is built. The gap between here and a
  business is not features.
- **Rewriting anything.** The recurring defect class here is wiring, not
  architecture. A rewrite would produce new wiring bugs and no new value.

---

## 8. The honest summary

**The software is ready to be tested by real contractors. It is not yet ready
to be sold**, and the distance between those two states is almost entirely
non-code: a domain, a paid server, a backup you have restored, an attorney's
hour, and a decision about price.

The largest technical risk remains the one `PLANNING.md` has carried for weeks:
**nothing has met a real user.** Four defects surfaced in the last session
alone, three of them found by the owner clicking rather than by any test. That
number will not go to zero from more building.

The largest *business* risk is different, and worth naming: **you do not yet
know whether a Jamaican contractor will pay J$2,000 a month for this.**
Everything in Gate 1 is worth doing only if the answer is yes. Ask the field
testers that question directly, after they have used it, and before you spend
money on any of the above.
