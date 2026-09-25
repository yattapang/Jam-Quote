# ADR 0023 — What the free tier meters, where the offline line falls, and one recipe

- **Status:** Accepted
- **Date:** 2026-09-25
- **Decided by:** the owner, accepting the recommendations in `PRD.md` §8a after the first Rule 1.10
  review raised them as open questions (F7, F8, F10, F15).
- **Affects:** `TIERS.md`, `PRD.md` §7 and R1.32, and the built marketing site's tier lists.
- **Delegation (Rule 16.5):** Opus — commercial and product boundaries, 16.2's own category.

## Context

The review found three tier questions that three different documents answered three different ways, and
one question that is not an engineering question at all. Guessing any of them would have repeated the
mistake ADR 0022 corrected: deciding a fact about the world from the code.

## Decisions

### 1. A "job quoted" means a distinct job **numbered** in the calendar month

The free tier allows three. The counter increments when a number is allocated — not when a job is
sealed, and not when a document is sent.

**Why numbering rather than sealing:** sealing happens on the device, offline, and the meter is enforced
server-side. Metering on seal would mean either trusting a client-side count or refusing work already
done at a client's gate, which is the one moment the product must not fail.

**Why not on sending:** a tenant could seal unlimited work and deliver it by screenshot, and the meter
would measure nothing.

**Revisions and declines are free.** A revision is the same job priced again; charging for it would
meter care. A declined quote is work that earned nothing, and billing for it teaches contractors to
quote less — the opposite of what the product is for.

**The consequence, stated because it is not obvious:** a job sealed offline in one month and synced in
the next counts in the month it was **numbered**. A contractor who seals four jobs on a Sunday with no
signal has three numbered and one refused when they sync. That is the correct behaviour — the free limit
is a limit — but the app must explain it at the moment it happens rather than appearing to lose work.
The sealed snapshot is not destroyed; it waits, and upgrading releases it.

### 2. Offline **sealing** is on every tier. Offline **issuing** (release 2) is Pro

`TIERS.md` put "offline mobile use" on Pro, `PRD.md` §7 gave offline pricing to Free, and the site listed
offline under Pro. Three documents, three answers (F8).

**Sealing is the core promise and cannot be a paid feature.** The product's entire claim is *price the
job while you are standing there*, and a contractor on the free tier standing at a gate with no signal is
exactly the person the marketing site was written for. Gating that makes the free tier fail in the moment
it is being evaluated, and a free tier that fails at first use does not spread by word of mouth — which
is the only distribution this product has.

Offline **issuing** — allocating a number from a device lease, release 2 — can carry the Pro line. It is
a genuine convenience rather than the promise, and it costs real engineering (leases, expiry, burned
numbers, and a trade-down on gaplessness: see the domain model §6.1a).

### 3. A free tenant may create **one** recipe

Free previously got "recipes: view only", and in release 1 a new free tenant has nothing to view (F7).
The wedge could not demonstrate the differentiator — a demonstration with nothing in it demonstrates
nothing.

One is deliberate: enough to price the same job twice and feel why the product is worth paying for, not
enough to run a business on. The second recipe is the Pro line, and it is the most honest upsell in the
ladder because the contractor discovers the need themselves.

### 4. Whether a typed name is enough is a legal question, and goes to the attorney

R1.20 records a typed name, a timestamp, the IP and the user agent when a client accepts. Whether that is
worth anything in a Jamaican dispute is **not for us to assert** (F15), and the PRD had implied it was
settled.

It goes to the owner's attorney **with the terms and privacy wording that are already awaiting approval**
— one conversation, not two. The answer is recorded in an ADR. If the answer is "not enough", the
options are a stronger acceptance record (a one-time code to the client's phone, or a countersigned PDF)
and that is a design change, not a copy change, so it is better known before W5 is built than after.

**Until the answer exists, nothing in the product claims the acceptance record is legally binding.** The
UI states what it recorded, which is true, and not what it proves, which is unknown.

## Consequences

- `TIERS.md` and the built site's tier lists both disagree with this ADR today and must be amended to
  match. Those edits are **owed**, held only because an independent review was reading the documents
  when this was decided (Rule 16), and they land with the post-review amendment pass.
- R1.32's wording changes from "3 new jobs quoted per calendar month" to the numbering rule above, and
  needs a message for the refused fourth job that explains rather than scolds.
- The meter needs a **test for the cross-month case**: sealed in one month, synced in the next. That is
  the kind of boundary that is obvious once written down and invisible otherwise.
- The free tier is now genuinely usable at a gate, which raises the cost of abuse: one free account per
  verified address with a bound on addresses per device (R1.30c) is what stops three-jobs-a-month from
  becoming unlimited via new accounts. These two decisions lean on each other.

## What this does not settle

- **The prices.** Still the owner's, still blocking the paid tier.
- **How the site presents undelivered features** — marked "coming in release 2" or removed until they
  ship. That is the remaining half of F5, it is public copy, and it is the owner's call. The
  recommendation is to **mark them with the release they land in**: a labelled roadmap is not a claim,
  and removing them makes the product look thinner than it is.
- **Whether three is the right number.** It is a guess, and it is an entitlement value rather than a code
  path precisely so it can change without a release.
