# ADR 0022 — One tenant per user, one email each; a tenant's clients have no login

- **Status:** Accepted
- **Date:** 2026-09-25
- **Decided by:** the owner, answering the two questions `docs/design/domain-model.md` §11 raised as
  blocking the PRD.
- **Affects:** Tenancy (the spine) and Documents (what an outsider can read). Both are expensive to
  change later, which is why they were asked before the schema was written rather than after.
- **Delegation (Rule 16.5):** Opus — product and schema shape, 16.2's own category.

## Context

The domain model named two questions it could not answer from the code, because they are questions
about how contractors actually operate:

1. May one person hold more than one business?
2. Do a tenant's own clients ever get a login?

Both change the model materially rather than cosmetically. Guessing either would have produced a
schema that looked finished and was wrong in the one place that is hardest to migrate.

## Decision

**1. A user belongs to exactly one tenant. One person may hold several businesses, using a different
email account for each.**

So `app_user.email` stays **globally unique**, and that uniqueness is not a limitation to work
around — it is the **enforcement mechanism** for the owner's rule. One address, one user, one tenant;
a second business requires a second address, and the database says so rather than a policy document.

This **withdraws** a correction the domain model proposed. I had written that email must become
unique *per tenant* because "two contracting businesses may legitimately share an owner's address",
and called it the most consequential correction in the document. It rested on an assumption about the
world, not on anything in the code. The migration is cancelled and the sign-in lookup stands
unchanged.

**2. A tenant's clients do not get a login. The owner expects this may change.**

A client meets us through a `share_link` — a hashed, expiring, revocable capability URL scoped to one
issue — and an `acceptance` that records a typed name, a timestamp, the IP and the user agent.
Nothing in the model assumes a client identity, and no table gains a nullable "client user" column
against a future that may not arrive.

## Consequences

**Of one tenant per user:**

- No account switcher, no membership join table, no policy rewrite. Row-level security stays
  `tenant_id` on every row, single-valued, which is the simplest thing that can be correct.
- **The cost, stated rather than discovered:** the same human signing in to their second business
  must use its own address, and there is no "switch business" affordance. If that becomes a real
  complaint, the change is a **person** entity above `user` — a change to the spine, touching
  sessions, credentials and every policy. Recorded now so that conversation starts from a known
  price rather than a fresh argument.
- A person with two businesses has two MFA enrolments (ADR 0021). Correct, and worth saying: their
  second factor protects an account, not a human.

**Of no client logins:**

- Documents has no outside reader, so the threat model's cross-tenant surface stays as it is.
- `share_link` is a **credential** and is treated as one: high-entropy token, hashed at rest, scoped
  to a single issue, expiring, revocable. That is what carries the weight a login would otherwise
  carry.
- **What keeps the door open:** `acceptance` already records who acted and how, and `share_link` is
  already scoped per issue rather than per client, so a future portal adds a client identity and
  reuses both. What a portal would **not** be is a small change — it makes tenant data readable by
  someone who is not one of the tenant's users, which is a new row-level-security surface, a new
  threat-model section and a new consent question. It is a later *decision*, not a deferred detail,
  and this ADR will be superseded rather than extended.

## Alternatives considered

- **A `person` entity above `user`, with a membership table** (the standard multi-tenant shape). More
  flexible, and it would let one address hold two businesses. Rejected **for now** because the owner
  does not want that behaviour: they want the separation, and the simpler model enforces it for free.
  Flexibility nobody asked for is the cost paid in every policy afterwards.
- **A nullable client-user column, "for later".** Rejected. A column that exists for a future that
  may not arrive is a column every query must reason about now, and it is how optional identity
  becomes an accidental authentication path.
- **Email unique per tenant** (my own proposal). Rejected by the answer: it would weaken a guarantee
  to support a case that does not arise.

## What this does not settle

- Whether a tenant's **staff** can be invited to more than one tenant. The same reasoning applies —
  one address, one tenant — but invitations do not exist yet, and the PRD will state it explicitly
  rather than leaving it to be inferred from this ADR.
- What a client portal would look like, if it ever arrives. Deliberately unwritten: designing it now
  would be designing for a decision that has not been made (Rule 1.1).
