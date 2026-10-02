# Design: support and feedback — channels, tickets, the help centre, the chatbot path, and the feedback loop

**Status: APPROVED by the owner, 2026-10-02 — every recommendation, SF1-SF8, and the chatbot route of §4**
("Approved"). **Amended the same day** to answer its independent read (findings SR1-SR15, §10). The reader agreed
with SF1-SF4, SF6 and the phases of §4, and disagreed in part with SF5, SF7 and SF8's guard; each disagreement is
adopted. The amendments are approved with the step's sign-off. Build plan step A3 (`docs/BUILD-PLAN.md`). The closing
check is owed before the step is ticked; at sign-off an ADR records the support decision (brief §15 asks for one).
Nothing here is built until steps E1 and E2 begin (and H6 for the chatbot's second phase).

Date: 2026-10-02 · **This is the options paper brief §15 requires** — options with pros, cons, cost and a
recommendation, before anything is built (Rule 25.1) · **Implements the direction of** ADR 0030 decisions 3 (support
model) and 4 (feedback loop), within ADR 0029 E1 (no chatbot at the web launch) and PRD R1.38 (support in R1 is
email; in-app threads are R2) · **Under** Rule 15 (no tenant or client personal data reaches a model; three approval
gates for Claude maintenance) and Rule 25 (support and feedback) · **Delegation (Rule 16.5):** Opus — product
direction, and a privacy boundary.

**Prices are public list prices found on 2026-10-02, in US dollars, mostly from third-party summaries; each is
checked on the vendor's own page before anything is bought** (sources in §9; SR14). No recommendation here depends on
a price. Our time to build is not priced; it is stated as the size of the work.

Text marked *(SRn)* answers the independent read's finding of that number (§10).

---

## 1. The problem, in one paragraph

The owner's requirement (brief §15) is that customer service is built into the product — "through emails,
messages, or bots" — and that customer feedback helps with maintenance. Two things are settled already:

- support at the web launch is email, with no chatbot (ADR 0029 E1, R1.38);
- the reason is that a chatbot sends whatever a person types to a model, and Rule 15 forbids sending tenant or
  client personal data to one.

This paper settles the rest:

- which tools carry the email;
- whether a helpdesk is bought or a small one built;
- how a contractor reaches us from inside the app;
- what the help centre is;
- what route leads to the chatbot the owner still wants;
- how a complaint becomes a fix without any personal data reaching Claude-assisted maintenance.

## 2. Who writes in, and what they need

- **A contractor, signed in**, stuck on a screen or hitting an error. Needs a way to ask from where they are, with
  enough context attached that we do not have to ask "which screen?".
- **A contractor locked out** — forgotten password, lost second factor, card declined. Cannot use anything inside
  the app. Needs an address that works without an account, and a recovery route that does not depend on support
  believing an email (SF3).
- **A contractor's client** — confused by a quote link or a code. Not our customer; their contractor is. Needs to be
  pointed to the contractor, kindly, and never shown anything about the contractor's account. Two exceptions: a
  request about their own data, and a report of abuse (SF3).
- **Someone considering Pryvis** — a question before signing up.

Release 1 is the owner (and the second staff member, once named — OA4) answering a few messages a day. The design is
sized for that, and does not stop growth.

## 3. The decisions

Each has options and a recommendation, **(rec)**.

### SF1 · Where support conversations live — buy a helpdesk, or build a small one

| Option | For | Against | Cost |
|---|---|---|---|
| A. A shared mailbox only | Nothing to build | No link to the tenant, tier or version; nothing to measure response time with; feedback cannot be tagged or triaged except by hand; Rule 25.3 cannot be met | Mailbox only (SF2) |
| B. A hosted helpdesk — Zoho Desk, Freshdesk, Help Scout | Inbound email threading, canned replies, reports and a help-centre builder, all ready | **A new processor of tenant data.** Support messages carry clients' names, addresses and amounts, and they would sit outside our row-level security, our audit trail and our least-privilege checks. Each needs a register row and a privacy-notice entry; linking a ticket to the tenant, tier and app version is manual or needs an integration; costs per agent rise as we grow | Zoho Desk: free for up to 3 agents, then US$7-14 per agent a month (annual). Freshdesk: free for 2 agents for 6 months only, then US$19 per agent a month. Help Scout: about US$21-25 per user a month |
| **C. (rec) A small ticket built into Pryvis, plus a mailbox** | Tickets are tenant-scoped rows under row-level security, audited like every other action (R1.39), and linked to the tenant, tier and app version (SF5); staff see them in the staff console we build anyway (D7), under a capability; no new processor for in-app messages; measures come from our own data | We build it: two tables, a form, a console view and two reports — small, but ours to maintain. **No inbound email threading in R1**: a reply to a support email lands in the mailbox and is added to the ticket by hand (inbound handling is deferred, `docs/SERVICE-REGISTER.md` §3b) | No licence. The mailbox (SF2) |

**Why C.** The deciding issue is not price — Zoho Desk is free at our size — but **how much of tenants' clients'
data leaves our isolation**. Support messages are full of it ("the Browns at 12 Hope Road say the deposit is
wrong"). Brief §11 and Rule 4 hold that data to tenant isolation in the database.

- With C, what is written **inside the app** never leaves the database.
- Email is a second copy we cannot avoid: anything sent to `support@`, and any reply that quotes an earlier message,
  sits in the mailbox until it is deleted (SF7) *(SR7)*.
- A helpdesk would add a third copy of everything, held by a vendor.

The cost of C is a small build and hand-copying replies, which at a few messages a day takes minutes.

**When to revisit:** when support volume passes what one person can copy by hand — a stated trigger of more than 20
new tickets a day for a month. At that point either inbound email handling (§3b of the register) is built, or a
helpdesk is chosen with its processor terms in hand.

### SF2 · The mailbox

- **Two addresses, one mailbox:** `info@pryvis.com` (already the site's contact, PRD §9 item 1) and
  `support@pryvis.com` as an alias of it. One place to read, and two addresses so a support reply never looks like
  marketing.
- **The provider is chosen in A5**, with the rest of the register. **The deciding requirement is that it can delete
  mail automatically on a schedule** (SF7) *(SR7)*; price comes second.

| Option | Cost | Note |
|---|---|---|
| Zoho Mail, free plan | US$0 for up to 5 users | Web and app access; a further processor (it holds what people email us) |
| Google Workspace, Business Starter | About US$7 per user a month (annual), US$8.40 monthly | The same processor question; more storage and tools |

- **Mail sent from the product** — codes, quotes, replies from the console — goes through the transactional email
  service of design A6, not the mailbox.
- **The mailbox is not the record.** Anything in it that needs action becomes a ticket (SF3), so it is tagged,
  measured and triaged like everything else. Everything else in it is deleted on SF7's schedule.
- **System alerts land here too** *(SR15)*: the nightly reconciliation emails the support address when it finds a
  mismatch (R1.24e).
  - Such an alert carries only a tenant reference and the kind of mismatch, never client data. Its exact contents
    are designed in A12.
  - It is not a ticket. It is acted on through the staff console and deleted with the mailbox's other mail.

### SF3 · The ticket, and how a person reaches us

**Three ways in.**

1. **"Contact support" inside the app** (signed in): a form with a category (question, problem, billing, idea), a
   subject and a message.
   - It creates a ticket for the caller's tenant and user.
   - It emails the mailbox a notice carrying **only the ticket's reference and category** — never the message.
   - The person sees "We'll reply by email, usually within one working day" (SF6).
2. **"Report a problem"** — the same form, opened from an error message or the menu, with the category preset to
   "problem" and the diagnostic consent of SF5.
3. **Email to `support@`** — for people who cannot sign in, clients, and anyone outside the app. Handled under the
   rules below *(SR4)*.

**Two tables, so a tenant's tickets are never mixed with unverified mail** *(SR4, SR8)*:

- **The tenant's tickets** are tenant-owned rows: `tenant_id` is required, under row-level security, and the
  tenant's own users see them.
- **The support inbox** holds tickets created from email that are not yet confirmed as a tenant's. It is a platform
  table, visible to staff only. Like `platform_capability`, the application can reach it only through door
  functions.

**An email becomes part of a tenant's account only when the tenant confirms it** *(SR4)*:

1. A sender's address is checked by a door function that answers only whether it **exactly** matches a verified
   sign-in address, and if so, for which tenant. Staff never browse credentials. An email's From line can be forged,
   so even a match proves nothing on its own.
2. The ticket stays in the support inbox. Pryvis emails **the account's own verified address** — not the reply-to of
   the message: "We received a support message from this address. Sign in and confirm it to attach it to your
   account."
3. Only when the person confirms, signed in, does the ticket move to their tenant's tickets.
4. Until then, replies to the sender contain **no account detail at all**: no plan, no payment status, nothing about
   the account's documents.

A person who owns several businesses, each with its own address, confirms on the account they mean.

**What a ticket holds:**

- the tenant (none in the support inbox) and the user (or none);
- the category, the subject and the message;
- the status: open, waiting on us, waiting on them, or closed;
- when the message was **received**, when we first replied, and when the ticket was closed (SF6);
- the triage outcome (SF8);
- the tier and app version (always, SF5), and, only with consent, the page and error references (SF5).

The message is free text and may hold personal data. It stays in the ticket, under row-level security, and **never
reaches a model** (Rule 15).

**How we reply.** From the ticket, in the staff console, through the product's email (design A6), with `support@` as
the reply-to.

- The reply is stored on the ticket, and the first reply stamps the first-response time.
- When the person answers, their email arrives in the mailbox, and staff add it to the ticket.
- Replying by email rather than in the app is R1.38's decision; in-app threads are release 2 (H6).

**How staff reach tickets** *(SR8)*. No deployed role bypasses row-level security (privilege model D4), so staff work
through door functions that check the caller holds **`answer_support`** (R1.46): list tickets for triage, read one
ticket, reply, set the status and the triage outcome. Each read and each change is recorded twice:

- in the **tenant's own audit trail**, which the tenant can see — the privacy notice promises "any action taken by
  Pryvis staff on your account" (`new-app/web/content/legal.ts`);
- in the **platform audit trail** (R1.48).

A ticket still in the support inbox belongs to no tenant yet, so staff reads and changes to it are recorded in the
platform trail only. Once a tenant confirms it, later actions are recorded in both.

**An audit entry about a ticket carries only the ticket's reference and category, never its subject or message**
*(SR7)*, because audit entries outlive the ticket by years (ADR 0020).

A ticket is what the person chose to send **to us**, so `answer_support` opens tickets and nothing else.

- If answering truly needs a look at the tenant's own records, that is R1.47's time-limited, tenant-visible, audited
  access grant, asked for and recorded separately — never a side door through the ticket.
- A staff member **never impersonates** a tenant (there is no impersonation in R1, R1.47).

**People who are locked out** *(SR4)*. Support never changes a sign-in, a second factor or an email address because
an email asked it to — an email proves nothing about who sent it. The routes are self-service and designed in A8
(sign-up and verification):

- the password reset by email;
- the second factor's recovery codes;
- for someone who has lost both, a written recovery procedure with its identity checks.

Until A8 exists, support's reply points to those routes and changes nothing.

**Clients of a contractor** who write in are answered with a fixed, kind reply naming no account details: "Please
contact the business that sent you the link — they can resend it or answer questions about the quote." They are
never told whether that business is a Pryvis customer.

**Two kinds of message never get the fixed reply** *(SR6)*:

- **A request about the person's own data** — a copy, a correction, a deletion. It is handled as a data request under
  R1.44, through the procedure of design A11, because the privacy notice promises "Write to us and a person will
  answer".
- **A report of abuse** — for example a share page used to deceive people. It goes to staff review, which can
  revoke share links and refer the tenant for `suspend_tenant` (R1.46).

Both are recorded in the support inbox with their own category, so they are tracked and measured.

### SF4 · The help centre

| Option | For | Against | Cost |
|---|---|---|---|
| **A. (rec) Articles in our own site**, at `pryvis.com/help`, written in Markdown in the repository and built into static pages | Reviewed like code; versioned with the product, so an article changes in the same pull request as the screen it describes; no new service; searchable in the browser; works on a cheap phone | We write it | US$0 (the site's existing host) |
| B. A helpdesk's knowledge base (SF1 B) | A builder with templates | Ties the help centre to a vendor we did not choose for tickets; articles drift from the product | Part of the helpdesk's price |
| C. A documentation SaaS | Polished | Another vendor for static text | Typically US$0-50 a month |

**How it works:**

- **Articles live in a `help` folder under `new-app/web/content/`**, one Markdown file per task — for example "Send a quote by
  WhatsApp", or "A client says the code didn't arrive" *(SR11)*.
  - The folder is inside `new-app/`, so the tax-name guard of `docs/design/tax-and-documents.md` T1 reads them.
  - The guard also checks **file names and page addresses**, not only file contents. An article about tax rates is
    filed under a neutral name such as tax-rates.md, and the tax's name in it is read from the rule pack.
  - This extends T1's scope, and is built with it (B6).
- **Search loads the whole index with the page and searches it in memory** *(SR2)*.
  - The library is **MiniSearch** (rec): small, plain JavaScript, no WebAssembly, so the site's
    Content-Security-Policy is not loosened. It goes in the SBOM with this reason.
  - Libraries that fetch parts of the index while a person types are **not used**. The read showed that Pagefind
    fetches an index shard chosen by the word typed, so the host's access log learns roughly what was searched. A
    hosted search service sends every keystroke to a third party.
  - With MiniSearch, **typing causes no network request of any kind**. That is the property, and §8 tests exactly
    it.
- **What we learn instead** *(SR9)*:
  - each article has "Did this help? Yes / No", counted per article, with no text box;
  - a search that finds nothing is counted when the person submits it, with no record of what was typed.

  Both counts are sent to a counting route **without credentials** (no cookie), with no referrer, and the search
  text is never put in the page's address. So no request carries who searched or what. Recurring questions come
  from tickets (SF8), where they arrive with the person's consent.
- **Written at development time.** Claude may draft articles from the product's own screens and from **synthetic or
  redacted** questions (Rule 15). Every article is reviewed and merged under Rule 15's gates.
- Each screen that has an article links to it ("How does this work?").

### SF5 · Report a problem — what is always recorded, and what needs consent

**Recorded on every ticket, without asking** *(SR5)*:

- **the tenant's tier**, which the server already knows;
- **the web app's version**, sent by the app and checked against the list of released versions.

Neither is personal data. Rule 25.3 requires every piece of feedback to be linked to both, and SF6's per-tier measures
need them.

**This changes ADR 0030 decision 4** *(SR5)*. That decision put "the app version, tier and page" behind consent. This
design keeps only the page and the error references behind consent, and records tier and version always. The two
conflict, so this design governs:
- ADR 0030 carries a dated note pointing here;
- the ADR that records this design at sign-off states the change.

Rule 25.3 already reads this way — every piece of feedback is linked to the version and tier, and only the
"non-sensitive context" of a report needs consent — so the rule is unchanged.

**Attached only with consent** — a checkbox, unticked by default, because consent is an act, not a default (brief
§15). The wording matches exactly what is attached *(SR10)*:

> **Attach technical details** — the page you were on, the time, and the references of your last three errors. No
> names, amounts or client details are included.

- **The page** is sent as the route template, never its full address, which can hold an identifier. **The server
  accepts it only if it is on the closed list of the web app's routes**, and drops it otherwise *(SR10)*. So the
  field cannot become a free-text channel.
- **The error references** are the request ids (AP9 of `docs/design/api-layer.md`) of the last three failed
  requests. The app keeps them in memory for this purpose only. The server accepts only UUIDs *(SR10)*.
- **Nothing else** is attached: no form contents, no screenshots, no local storage.

**The error link.** An error reference lets staff open the matching event in error tracking (chosen in A5).

- Staff open it **through the console**, which checks `answer_support` and records the access *(SR10)*.
- The events themselves must hold no personal data. AP9's test searches log lines, so B3 adds the same test to the
  payload sent to error tracking.

**The person's own words** are in the message, as they chose to write them, and go nowhere but the ticket.

### SF6 · How fast we answer, and what we measure

- **The promise shown to people (rec, approved):** "We reply by email, usually within one working day".
  - A working day is Monday to Friday, 9:00-17:00 Jamaica time.
  - Public holidays come from the Jamaica rule pack *(SR12)*.
  - A tighter promise is a staffing decision.
- **Measured from the tickets themselves** (Rule 25.3; PRD R1.42's measures), and shown in the staff console:
  - **first-response time and resolution time, in working hours** — the median and the slowest tenth, per week.
    They are counted from when the message was **received**: for an emailed ticket, the time the email arrived, not
    the time staff created the ticket *(SR12)*;
  - open tickets by age;
  - tickets by category and by triage outcome;
  - tickets per 100 active tenants — an active tenant being one with a user who signed in during the period — so
    growth does not hide a worsening product *(SR12)*;
  - for each help article, the "did this help?" ratio, and the count of searches that found nothing.
- **No measure needs personal data**, and none is sent to any analytics service.

### SF7 · Keeping, and deleting — every copy

**Tickets are kept for 24 months after they close** (rec, approved). That is long enough to see a recurring problem
across a year and to answer a dispute about what support said, and short enough not to hoard. The attorney confirms
the period under the Data Protection Act 2020 (OA10).

A ticket has copies outside its row, and **each copy has its own rule** *(SR7)*:

| Copy | Where | Kept | How it is deleted |
|---|---|---|---|
| The ticket, its messages and its diagnostics | Our database | 24 months after closing | A daily job, through a named door (AP10 of `docs/design/api-layer.md`) |
| An unconfirmed email ticket (support inbox) | Our database | 90 days if never confirmed; then as a ticket | The same job |
| Audit entries about a ticket | Our database | 7 years (ADR 0020) | They hold only the ticket's reference and category, so there is nothing personal to delete |
| Our replies, as sent | The transactional email provider (A6) | The shortest retention the provider allows | The provider's own setting, chosen in A6. Its register row lists support replies among what it holds |
| Mail received, sent, and in trash | The mailbox | 90 days; a message made into a ticket is deleted at once | An automatic rule in the mailbox provider (the deciding requirement in SF2) |
| Error-tracking events linked to a ticket | The error-tracking service (A5) | The provider's retention, at most 90 days | The provider's setting; the events hold no personal data (SF5) |
| Backups | The database host (A4) | The backup period set in A4 | Deleted data remains in a backup until that backup expires; restore drills run in an isolated environment that is destroyed after the drill. The privacy notice says so |
| Redacted issues | The maintenance task list in our database (A4), **not** git *(SR3)* | While open, then 24 months after done | The same job. Being in a database, an issue that should not exist can be deleted |

**Two tenant rights reach tickets** *(SR7)*:

- **Export (R1.43).** A tenant's data export includes its tickets, their messages and our replies.
- **A client's erasure (R1.44).** Tickets hold free text that may name a client. When a client's personal fields are
  redacted, staff are shown the tenant's tickets that mention the client's name or address (the same matching door
  as SF8), and redact those passages too.

`docs/PRD.md` R1.43 and R1.44 carry pointers to this.

**What this design used to claim, corrected** *(SR7)*. The mailbox notice carries only a reference, but the mailbox
still holds what people email us, and what they quote back in replies. That is why the mailbox has a deletion rule,
not a promise.

### SF8 · From feedback to maintenance — without personal data reaching Claude

This is the loop the owner asked for ("customer feedback should also help with maintenance"). It runs under Rule 15:
no tenant or client personal data reaches a model, and the start gate approves from "a triaged, redacted task list".

1. **Triage, weekly (rec: every Monday)**, in the staff console. Every ticket closed or still open from the week gets
   one outcome:
   - *answered, no action*;
   - *help article* (new or changed);
   - *usability fix*;
   - *bug*;
   - *feature idea*;
   - *billing* (handled by staff, never a code task).

   The outcome is a field on the ticket. **There are no free-text "triage notes"** *(SR3)*: anything staff want to
   remember about the case is a note on the ticket, under the ticket's rules.
2. **A ticket whose outcome is a code or article task becomes a redacted issue**, written by staff **in their own
   words**: what goes wrong, on which screen, how often, and which tier.
   - **Never** in the text: a person's name, a client's name, an address, a phone number, an email address, a
     registration number, an amount, a link, or any copy of the person's message.
   - **The ticket's reference is kept beside the issue, not in its text** *(SR3)*, so what Claude reads carries no
     key back to a person.
3. **The guard runs on the server** when an issue is saved, and refuses the issue, naming what matched *(SR3)*:

   | Check | Source |
   |---|---|
   | Email addresses, links and anything shaped like a token (a long run of letters and digits) | Fixed patterns. Share links are credentials (AP9) |
   | Phone numbers in local and international form, and registration numbers | **The rule pack's patterns** (Jamaica: area codes 876 and 658, and the TRN). So a new country brings its own, and no tax or registration label is written into console code (T1) *(SR11)* |
   | Amounts: any number that looks like money | Fixed pattern. Staff describe size in words ("a large invoice") |
   | The person's own name and email address | The ticket's user |
   | The tenant's clients' names and addresses | A door function that answers only **match or no match**, and which category matched, against the tenant's client book. Neither staff nor the console read the client book |
   | A copy of the message | Any run of six words that also appears in the ticket's message |

4. **What the guard cannot catch, stated** (Rule 21.4) *(SR3)*:
   - a paraphrase ("the lady on the hill road");
   - an abbreviation ("Mrs B.");
   - a name that is not in the tenant's client book.

   Two things stand behind the guard:
   - **the administrator's start approval** (Rule 15). The administrator reads the issue before Claude may begin,
     which is a second human check, by design;
   - **deletability.** Issues live in a database, not in git history, so a miss can be removed.

   "By construction" is therefore not claimed. What Claude sees is what passed both the guard and the administrator.
5. **Recurring questions** — several tickets with the same answer — become a help article or a usability fix at
   triage (brief §15: "recurring questions drive documentation and UX fixes").

## 4. The chatbot — the route to the owner's goal, in three phases

The owner wants a chatbot (ADR 0027 D9), and accepted that it cannot be at the web launch (ADR 0029 E1). This is the
route, with each phase's gate.

| Phase | What the person sees | What reaches a model | When | Cost to run |
|---|---|---|---|---|
| **1 — the web launch** | The help centre with search (SF4), and "Contact support" | Nothing | Steps E1-E2 | US$0 |
| **2 — answers from our help content (rec)** | An "Ask a question" box that answers with the best-matching passages from our help articles, links to them, and always offers "Contact support" | **Nothing.** It is SF4's in-memory search, presented as an answer. No model runs at run time, typing makes no network request, and **no question text is recorded anywhere** *(SR1)*. Articles are written at development time with Claude, from synthetic or redacted questions | Release 2 (H6), or earlier if the owner moves it — it needs no rule change | US$0 |
| **3 — a live AI assistant** | A conversation that understands the question and answers from our help content | **What the person types.** That is why it needs the gate below | Only after the gate | Small: see below |

**When phase 3 comes back to the owner** *(SR1)*. Phase 3 is put to the owner when the data we already hold shows
that people need more than articles can give. The signals are:

- questions arriving as tickets that triage marks *answered, no action*, because the article already existed;
- low "did this help?" ratios;
- a rising count of searches that found nothing.

**Not** when "phase 2 shows what people ask": phase 2 must never record what they ask.

**Phase 3's gate — all of these, in this order, before anything is built:**

1. **Rule 15 amended by the owner** (Rule 23), naming exactly what may reach a model and from which feature. Today
   Rule 15 forbids it, and that is correct until this list is done.
2. **The attorney's review:** the consent wording shown before the person types, and the model provider as a
   processor under the Data Protection Act 2020, including the transfer outside Jamaica.
3. **The register and the privacy notice** name the model provider as a processor of support conversations, with
   its data-retention terms as they stand on the day (checked then, not assumed now).
4. **Defence in depth, built in and proved by planted defects** *(SR13)*:
   - what is typed passes **SF8's guard**, run on the input before it is sent;
   - the assistant has **no tools and no access to tenant data**. It reads only our help articles, so it cannot show
     one tenant another's data (Rule 25.2), because it holds none;
   - it never approves a payment or changes an account, and it always offers a human;
   - conversations are kept redacted, for a stated short period, or not at all;
   - there is a **switch that turns it off at once**, a per-tenant rate limit, and a daily cap, so it cannot be used
     as a free general-purpose model.
5. **A spend limit.** The Claude spend cap (OA3) covers it, with its own share.

**Phase 3's running cost, estimated** — not a quote.

- **Prices.** Anthropic's published API prices, as of 2026-09-25 (§9): Claude Haiku 4.5 costs US$1 per million
  tokens read and US$5 per million written; Claude Sonnet 5.5 costs US$2 and US$10.
- **The conversation assumed:** three exchanges. Each sends about 4,000 tokens — the question with the matching help
  passages — **plus the conversation so far**, which a model needs in order to follow up *(SR13)*. Each receives
  about 500 tokens.
- **Totals:** about 25,500 tokens read and 1,500 written. That is roughly **US$0.03 per conversation on Haiku 4.5**
  and **US$0.07 on Sonnet 5.5**.
- **Per month:** a thousand conversations is about **US$33-66**. The lighter model is the starting point (Rule 15: "a
  lighter model for routine work").

**Recommendation:** build phase 1 for the web launch and phase 2 in release 2. Bring phase 3 back to the owner as its
own decision, with its gate, when the signals above say so.

## 5. Options rejected for release 1, and why

- **A WhatsApp support line.** Jamaican contractors live on WhatsApp, which is the case for it. Against it:
  - the WhatsApp Business **app** puts every support conversation — clients' names and addresses included — on one
    staff member's phone, outside our tickets, audit trail and measures, and it cannot be handed over when a person
    leaves;
  - the WhatsApp Business **Platform** (the proper route) needs templates and an approved provider, and its pricing
    for service messages is changing. A third-party source says service messages become billable per message from
    1 October 2026; **this is checked against Meta's own pricing page** when the line is reconsidered *(SR14)*.

  The rejection rests on the first point, not the price. **Revisit with WhatsApp sending in release 3 (I3)**, when the
  Platform is integrated anyway — a support line then costs little more.
- **In-app support threads** (replies inside the app): release 2, by R1.38 and finding B26. SF3's ticket is built so
  threads are an addition, not a rewrite.
- **A live chat widget** (a person typing to staff in real time): it promises an immediacy one person cannot keep,
  and most widgets are third-party scripts on our pages, which AP2's CSRF reasoning and the site's
  Content-Security-Policy are written to exclude.
- **A phone line**: the same immediacy problem, and calls cannot be redacted, tagged or measured without recording
  them.

## 6. What it costs, in one table

| Item | At the web launch | Later |
|---|---|---|
| Tickets, form, console, measures (SF1, SF3, SF5, SF6, SF8) | US$0 licence; a small build in E1-E2 | — |
| Mailbox (SF2) | US$0 (Zoho Mail free) to about US$7-8.40 per user a month (Google Workspace) — chosen in A5 | — |
| Help centre (SF4) | US$0 | — |
| Chatbot | — | Phase 2: US$0. Phase 3, if approved: about US$33-66 per thousand conversations |
| WhatsApp support line | — | Revisited with I3 |

## 7. What gets built

- **E1:**
  - the tenant's tickets and the support inbox, with their door functions and audit entries (reference and category
    only);
  - "Contact support" and "Report a problem", with tier and version always recorded and the consent checkbox for the
    rest;
  - the server-side checks on the page and the error references;
  - the mailbox notice carrying only the reference;
  - the staff console's ticket view, reply (through A6's email), and "create a ticket from an email", with the
    exact-match sender door and the tenant's confirmation;
  - the fixed reply for clients, with the data-request and abuse categories excluded from it;
  - the help centre with MiniSearch, "did this help?", and the no-result count on the credential-free counting
    route.
- **E2:**
  - weekly triage in the console;
  - the redacted-issue form, with the server-side guard and its client-book door;
  - the hand-off to A4's maintenance task list;
  - SF6's measures in working hours;
  - deletion on SF7's schedule, every copy;
  - tickets in the tenant's export, and the erasure helper.
- **H6 (release 2):** the chatbot's phase 2; in-app threads.
- **Documents:**
  - the ADR recording this decision (brief §15);
  - `docs/THREAT-MODEL.md` rows for support data, the support inbox, the redaction guard and email-originated
    tickets;
  - the register rows for the mailbox and for the transactional email provider's support replies (A5, A6);
  - **the privacy notice** — what support keeps, the consent for technical details, the 24 months, and backups — for
    the attorney's review *(SR7)*;
  - T1's scope extended to file names (B6) *(SR11)*.

## 8. Tests, each proved with a planted defect

**Isolation and access**

- **Isolation:** a tenant sees only its own tickets, and another tenant's ticket is invisible by id (the cross-tenant
  leak suite). The support inbox is invisible to every tenant. Plant: the policy removed from either table.
- **Staff access:**
  - staff reach tickets only through the doors, with `answer_support`, and each read is in **both** the tenant's
    audit trail and the platform trail, carrying only the reference and category;
  - the capability opens no other tenant data.

  Plants: the capability check removed; `answer_support` reading a quote; the message copied into an audit entry.
- **Email tickets:**
  - a sender matching a verified address stays in the support inbox until the tenant confirms;
  - the confirmation goes to the account's verified address, not the reply-to;
  - a non-matching sender is never linked;
  - replies to an unconfirmed sender carry no account detail.

  Plants: linking on the From line alone; confirming by email instead of signed in.
- **Clients:** a client's data request and an abuse report do not get the fixed reply. Plant: the fixed reply for
  every client message.

**Diagnostics and the help centre**

- **Diagnostics:**
  - tier and version are on every ticket;
  - the page and error references only when the box is ticked;
  - a page not on the route list, or a non-UUID reference, is dropped.

  Plants: the box ticked by default; a free-text page accepted.
- **Search** *(SR2)*: typing in the help centre's search causes **no network request of any kind** — watched at the
  browser, not only at the API. Plant: a library that fetches index shards.
- **Counters** *(SR9)*: the "did this help?" and no-result counts carry no cookie, no referrer and no query text.
  Plant: the query in the beacon.
- **Phase 2 (H6)** *(SR1)*: typing in "Ask a question" causes no network request and records nothing. Plant: logging
  the question.

**The redaction guard**

- It refuses an issue holding an email address, a link, a token, a phone number in local and international form
  (876 and 658), a TRN, an amount, the user's name, a client's name or address from the tenant's client book, or six
  words copied from the message — each planted.
- It runs on the server: a request that skips the console's form is still refused.
- No TRN pattern or tax label appears in console code (the T1 guard).

**Retention and measures**

- **Retention:** tickets more than 24 months after closure are deleted with their messages, and open ones are not;
  unconfirmed inbox tickets go at 90 days; redacted issues are deletable. Plant: deletion counted from opening
  rather than closure.
- **Measures:**
  - first-response time is stamped by the first reply and not by a later one;
  - an emailed ticket's clock starts when the email arrived;
  - times are in working hours.

  Plants: stamping on every reply; starting the clock at creation.

## 9. What this does not do (Rule 21.4), and sources

- It does not choose the mailbox provider or error tracking (A5), or the transactional email provider (A6). It sets
  the retention requirement each must meet.
- It does not design the maintenance task list or its approval screen — A4 does. SF8 says what feeds it.
- It does not design account recovery — A8 does. SF3 says support never performs it on an email's word.
- It does not build any chatbot that sends what a person types to a model. Phase 3 is a future decision with a gate.
- It does not support tenants' clients, except for data requests and abuse reports. Clients are the contractor's
  customers, and we route them back, kindly.
- The redaction guard does not catch paraphrase, abbreviation, or names outside the client book (SF8, step 4).
- Prices are list prices on 2026-10-02, mostly from third-party summaries, and change. Each is checked on the
  vendor's own page before money is spent *(SR14)*.

**Sources for prices:**

- Zoho Desk: [dragapp](https://www.dragapp.com/blog/zoho-desk-pricing/),
  [desk365](https://www.desk365.io/blog/zoho-desk-pricing).
- Freshdesk: [ringly](https://www.ringly.io/blog/freshdesk-pricing),
  [helpdesk.com](https://www.helpdesk.com/blog/freshdesk-pricing/).
- Help Scout: [unthread](https://unthread.io/blog/help-scout-pricing/),
  [featurebase](https://featurebase.app/blog/helpscout-pricing).
- Google Workspace: [emailvendorselection](https://www.emailvendorselection.com/google-workspace-pricing/).
- Zoho Mail: [Zoho's price list](https://www.zoho.com/mail/images/mail-pricing-usd.pdf).
- WhatsApp Business Platform: [Meta's pricing page](https://developers.facebook.com/docs/whatsapp/pricing),
  [engagelab](https://www.engagelab.com/blog/whatsapp-pricing-2026-service-message-cost).
- Claude models: Anthropic's published API prices, as of 2026-09-25 ([pricing](https://docs.claude.com/en/docs/about-claude/pricing)),
  which the independent read checked against Anthropic's documentation.

## 10. The independent read, and where each finding is answered

Read by Opus from `docs/briefs/2026-10-02-support-design-read.md` at `4a4b93e`. The reader built a Pagefind index
over synthetic articles and confirmed that it fetches index shards chosen by the word typed.

- **Verdict:** "sound after the named changes (SR1-SR8)".
- **Findings:** 15 — 8 major and 7 minor. Each is answered above.
- **Its own view of each recommendation:**
  - agreed with SF1-SF4, SF6 and the phases of §4;
  - disagreed in part with SF5, SF7 and SF8's guard.

  Each disagreement is adopted.

| Finding | Severity | Answered in |
|---|---|---|
| SR1 · phase 3's trigger relies on what phase 2 must never record | major | §4, "When phase 3 comes back"; phase 2's row; §8 |
| SR2 · "nothing is sent" depends on the search library; the test watched only the API | major | SF4, MiniSearch and "no network request of any kind"; §8 |
| SR3 · the redaction guard unbuildable as written, gaps, and issues kept forever in git | major | SF8, the server-side guard table, step 4's limits, issues in A4's database, no triage notes, the reference kept beside; SF7's table |
| SR4 · email-created tickets as a side door; locked-out people | major | SF3, the support inbox, exact-match door, the tenant's confirmation; "People who are locked out" |
| SR5 · tier and version behind consent, against Rule 25.3 | major | SF5, recorded always |
| SR6 · the fixed client reply swallowing data requests and abuse reports | major | SF3, "Two kinds of message never get the fixed reply" |
| SR7 · copies outside the ticket; audit details; export and erasure; overclaims | major | SF7's table and "Two tenant rights"; SF3's audit rule; SF1 and SF2 corrected; §7's privacy-notice item |
| SR8 · staff access mechanics; tenantless tickets; which trail | major | SF3, "How staff reach tickets", the two tables |
| SR9 · the counters could identify the searcher | minor | SF4, the credential-free counting route; §8 |
| SR10 · consent wording; unvalidated diagnostics; error-tracking access | minor | SF5 |
| SR11 · the T1 guard and help-article file names; the TRN pattern in code | minor | SF4; SF8's table (the rule pack's patterns); §7 |
| SR12 · measures: email arrival time, working hours, active tenants | minor | SF6 |
| SR13 · phase 3's cost omits the conversation history; gate additions | minor | §4, the cost and gate item 4 |
| SR14 · prices from third-party summaries; the WhatsApp claim | minor | The header; §5; §9 |
| SR15 · reconciliation alerts in the mailbox | minor | SF2 |
