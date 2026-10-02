# Design: support and feedback — channels, tickets, the help centre, the chatbot path, and the feedback loop

**Status: APPROVED by the owner, 2026-10-02 — every recommendation, SF1-SF8, and the chatbot route of §4** ("Approved").
Build plan step A3 (`docs/BUILD-PLAN.md`). Next: an
independent read, a closing check, then the owner's sign-off ticks A3, and an ADR records the support decision
(brief §15 asks for one). Nothing here is built until steps E1 and E2 begin (and H6 for the chatbot's second phase).

Date: 2026-10-02 · **This is the options paper brief §15 requires** — options with pros, cons, cost and a
recommendation, before anything is built (Rule 25.1) · **Implements the direction of** ADR 0030 decisions 3 (support
model) and 4 (feedback loop), within ADR 0029 E1 (no chatbot at the web launch) and PRD R1.38 (support in R1 is
email; in-app threads are R2) · **Under** Rule 15 (no tenant or client personal data reaches a model; three approval
gates for Claude maintenance) and Rule 25 (support and feedback) · **Delegation (Rule 16.5):** Opus — product
direction, and a privacy boundary.

**Prices are public list prices found on 2026-10-02, in US dollars, and are checked again when anything is bought**
(sources in §9). Our time to build is not priced; it is stated as the size of the work.

---

## 1. The problem, in one paragraph

The owner's requirement (brief §15) is that customer service is built into the product — "through emails,
messages, or bots" — and that customer feedback helps with maintenance. What is settled already: support at the web
launch is email, with no chatbot (ADR 0029 E1, R1.38), because a chatbot sends whatever a person types to a model,
and Rule 15 forbids sending tenant or client personal data to one. What is not settled: which tools carry the
email, whether a helpdesk is bought or a small one built, how a contractor reaches us from inside the app, what the
help centre is, what route leads to the chatbot the owner still wants, and how a complaint becomes a fix without
any personal data reaching Claude-assisted maintenance. This paper settles those.

## 2. Who writes in, and what they need

- **A contractor, signed in**, stuck on a screen or hitting an error. Needs a way to ask from where they are, with
  enough context attached that we do not have to ask "which screen?".
- **A contractor locked out** — cannot sign in, lost their second factor, card declined. Cannot use anything inside
  the app. Needs an address that works without an account.
- **A contractor's client** — confused by a quote link or a code. Not our customer; their contractor is. Needs to be
  pointed to the contractor, kindly, and never shown anything about the contractor's account.
- **Someone considering Pryvis** — a question before signing up.

Release 1 is the owner (and the second staff member, once named — OA4) answering a few messages a day. The design is
sized for that, and does not stop growth.

## 3. The decisions

Each has options and a recommendation, **(rec)**.

### SF1 · Where support conversations live — buy a helpdesk, or build a small one

| Option | For | Against | Cost |
|---|---|---|---|
| A. A shared mailbox only | Nothing to build | No link to the tenant, tier or version; nothing to measure response time with; feedback cannot be tagged or triaged except by hand; Rule 25.3 cannot be met | Mailbox only (SF2) |
| B. A hosted helpdesk — Zoho Desk, Freshdesk, Help Scout | Inbound email threading, canned replies, reports, a help-centre builder, all ready | **A new processor of tenant data**: support messages carry clients' names, addresses and amounts, and they would sit outside our row-level security, our audit trail and our least-privilege checks; a register row and a privacy-notice entry for each; linking a ticket to the tenant, tier and app version is manual or needs an integration; costs per agent rise as we grow | Zoho Desk: free for up to 3 agents, then US$7-14 per agent a month (annual). Freshdesk: free for 2 agents for 6 months only, then US$19 per agent a month. Help Scout: about US$21-25 per user a month |
| **C. (rec) A small ticket built into Pryvis, plus a mailbox** | Tickets are tenant-scoped rows under row-level security, audited like every other action (R1.39), automatically linked to the tenant, tier, app version and page; staff see them in the staff console we build anyway (D7), under a capability; no new processor; measures come from our own data | We build it: one table, a form, a console view, two reports — small, but ours to maintain. **No inbound email threading in R1**: a reply to a support email lands in the mailbox and is added to the ticket by hand (inbound handling is deferred, `docs/SERVICE-REGISTER.md` §3b) | No licence. The mailbox (SF2) |

**Why C:** the deciding issue is not price — Zoho Desk is free at our size — but **where tenants' clients' data goes**.
Support messages are full of it ("the Browns at 12 Hope Road say the deposit is wrong"). Brief §11 and Rule 4 hold it
to tenant isolation in the database; a hosted helpdesk would be the one place it escapes that. The cost of C is a
small build and hand-copying replies, which at a few messages a day is minutes. **Revisit when** support volume
passes what one person can copy by hand — a stated trigger: more than 20 new tickets a day for a month — when inbound
email handling (§3b of the register) is built, or a helpdesk is chosen with its processor terms in hand.

### SF2 · The mailbox

- **Two addresses, one mailbox:** `info@pryvis.com` (already the site's contact, PRD §9 item 1) and
  `support@pryvis.com` as an alias of it. One place to read; two addresses so a support reply never looks like
  marketing.
- **The provider is chosen in A5**, with the rest of the register. The candidates and their costs:

| Option | Cost | Note |
|---|---|---|
| Zoho Mail, free plan | US$0 for up to 5 users | Web and app access; a further processor (it holds what people email us) |
| Google Workspace, Business Starter | About US$7 per user a month (annual), US$8.40 monthly | The same processor question; more storage and tools |

  Whichever is chosen, mail sent **from the product** (codes, quotes, replies from the console) goes through the
  transactional email service of design A6, not the mailbox.
- **The mailbox is not the record.** Anything in it that needs action becomes a ticket (SF3), so it is tagged,
  measured and triaged like everything else. Mail that needs no action is deleted on a stated schedule (SF7).

### SF3 · The ticket, and how a person reaches us

**Three ways in, one record:**

1. **"Contact support" inside the app** (signed in): a form with a category (question, problem, billing, idea), a
   subject and a message. It creates a ticket for the caller's tenant and user, and emails the mailbox a notice that
   carries **only the ticket's reference and category** — never the message — so the mailbox never holds what the
   ticket holds. The person sees "We'll reply by email, usually within one working day" (SF6).
2. **"Report a problem"** — the same form, opened from an error message or the menu, with the category preset to
   "problem" and the diagnostic consent of SF5.
3. **Email to `support@`** — for people who cannot sign in, clients, and anyone outside the app. Staff turn a message
   that needs action into a ticket in the console, linked to a tenant when the sender is one, and to no tenant when
   not.

**What a ticket holds:** the tenant (or none), the user (or none), the category, the subject, the message, the
status (open, waiting on us, waiting on them, closed), when it was opened, when we first replied, when it was closed,
the triage outcome (SF5), and — only with consent — the diagnostic context of SF5. The message is free text and may
hold personal data; it stays in the ticket, under row-level security, and **never reaches a model** (Rule 15).

**How we reply:** from the ticket, in the staff console, through the product's email (design A6) with `support@` as
the reply-to. The reply is stored on the ticket and stamps the first-response time. When the person answers, their
email arrives in the mailbox and staff add it to the ticket. Replying by email rather than in the app is R1.38's
decision; in-app threads are release 2 (H6).

**Who can see a ticket:** the tenant's own users see their tenant's tickets (their own history). Staff see tickets
only through the `answer_support` capability (R1.46), and every view is recorded in the platform audit trail (W10, R1.48) —
the same rule as any staff access to tenant data. A staff member **never impersonates** a tenant to answer (there is no impersonation in R1, R1.47):
the ticket carries what they need, and anything more is asked of the person. A ticket is
what the person chose to send **to us**, so `answer_support` covers tickets and nothing else. If answering truly needs
a look at the tenant's own records, that is R1.47's time-limited, tenant-visible, audited access grant, asked for and
recorded separately — never a side door through the ticket.

**Clients of a contractor** who write in are answered with a fixed, kind reply naming no account details: "Please
contact the business that sent you the link — they can resend it or answer questions about the quote." They are
never told whether that business is a Pryvis customer.

### SF4 · The help centre

| Option | For | Against | Cost |
|---|---|---|---|
| **A. (rec) Articles in our own site**, at `pryvis.com/help`, written in Markdown in the repository and built into static pages | Reviewed like code; versioned with the product, so an article changes in the same pull request as the screen it describes; no new service; searchable in the browser; works on a cheap phone | We write it | US$0 (the site's existing host) |
| B. A helpdesk's knowledge base (SF1 B) | A builder with templates | Ties the help centre to a vendor we did not choose for tickets; articles drift from the product | Part of the helpdesk's price |
| C. A documentation SaaS | Polished | Another vendor for static text | Typically US$0-50 a month |

**How it works:**

- One article per task ("Send a quote by WhatsApp", "A client says the code didn't arrive", "Change your GCT
  rate" — the tax's name read from the rule pack, never typed into the page: the T1 guard of
  `docs/design/tax-and-documents.md` covers help pages).
- **Search runs in the browser**, over an index built with the site. What a person types into the search box never
  leaves their device: nothing is logged, nothing is sent, so nothing typed can carry a client's name anywhere.
- **What we learn instead:** each article has "Did this help? Yes / No", counted per article — no text box. A
  search that finds nothing is counted, with no record of what was typed. Recurring questions come from tickets
  (SF5), where they arrive with the person's consent.
- **Written at development time.** Claude may draft articles from the product's own screens and from **synthetic or
  redacted** questions (Rule 15); every article is reviewed and merged under Rule 15's gates.
- Each screen that has an article links to it ("How does this work?").

### SF5 · Report a problem — consent, diagnostics and error links

When a person reports a problem, they may attach technical details. **A checkbox, unticked by default** (consent is
an act, not a default — brief §15 says "with the user's consent"):

> **Attach technical details** — the app version, your plan, the page you were on, the time, and the reference of
> the last error you saw. No names, amounts or client details are included.

- **What is attached, exactly:** the web app's version; the tenant's tier; the route template of the current page
  (never its full address, which can hold an identifier); the time; the request ids (AP9 of
  `docs/design/api-layer.md`) of the last three failed requests, which the app keeps in memory for this purpose only.
  Nothing else — no form contents, no screenshots, no local storage.
- **The error link:** a request id attached to a ticket lets staff open the matching event in error tracking (chosen
  in A5), which by AP9 holds no personal data either. This is brief §15's "link error tracking to tickets".
- **The person's own words** are in the message, as they chose to write them. They are not sent anywhere but the
  ticket.

### SF6 · How fast we answer, and what we measure

- **The promise shown to people (rec):** "We reply by email, usually within one working day" — Monday to Friday,
  Jamaica time, excluding public holidays. A promise one person can keep. The owner sets it (SF6 is the owner's
  decision, recorded with the approval); a tighter one is a staffing decision.
- **Measured from the tickets themselves** (Rule 25.3; PRD R1.42's measures), shown in the staff console:
  - first-response time and resolution time — median and the slowest tenth, per week;
  - open tickets by age;
  - tickets by category and by triage outcome;
  - tickets per 100 active tenants (so growth does not hide a worsening product);
  - per help article, the "did this help?" ratio; and the count of searches that found nothing.
- **No measure needs personal data**, and none is sent to any analytics service.

### SF7 · Keeping, and deleting

- **Tickets** are kept for **24 months after they close**, then deleted with their messages and diagnostics (rec).
  Long enough to see a recurring problem across a year and to answer a dispute about what support said; short
  enough not to hoard. A ticket linked to a tenant is included in that tenant's data export and deleted with the
  tenant's data on request (A11). The attorney confirms the period under the Data Protection Act 2020 (OA10).
- **The mailbox:** a message turned into a ticket is deleted from the mailbox once the ticket exists; a message
  needing no action is deleted after 90 days. The mailbox is not an archive.
- **Triage notes and redacted issues** (SF8) hold no personal data, so they follow the code repository's history.

### SF8 · From feedback to maintenance — without personal data reaching Claude

This is the loop the owner asked for ("customer feedback should also help with maintenance") under Rule 15's rule
that no tenant or client personal data reaches a model, and Rule 15's start gate, which needs "a triaged, redacted
task list".

1. **Triage, weekly (rec: every Monday)**, in the staff console. Every ticket closed or still open from the week
   gets one outcome: *answered, no action* · *help article* (new or changed) · *usability fix* · *bug* · *feature
   idea* · *billing* (handled by staff, never a code task).
2. **A ticket whose outcome is a code or article task becomes a redacted issue** — written by staff **in their own
   words**: what goes wrong, on which screen, how often, which tier, with the ticket's reference. **Never** a
   person's name, a client's name, an address, a phone number, an email address, a registration number, an amount
   tied to a real job, or a copy of the person's message.
3. **A guard, not only a habit:** the console scans an issue's text before it can be saved, and refuses one that
   matches the patterns of an email address, a phone number, a Jamaican TRN, or a name or address present in the
   linked ticket. The refusal names what matched. It is proved by planted defects (an email address, a phone number
   in local and international form, a TRN, the ticket's own client name).
4. **The redacted issue joins the maintenance task list** that Rule 15's start gate approves from (designed in A4).
   Claude-assisted work starts only from that list, after the administrator's recorded approval — so what Claude
   sees is, by construction, what passed the guard.
5. **Recurring questions** (several tickets with the same answer) become a help article or a usability fix at
   triage — brief §15's "recurring questions drive documentation and UX fixes".

## 4. The chatbot — the route to the owner's goal, in three phases

The owner wants a chatbot (ADR 0027 D9) and accepted that it cannot be at the web launch (ADR 0029 E1). This is the
route, with each phase's gate.

| Phase | What the person sees | What reaches a model | When | Cost to run |
|---|---|---|---|---|
| **1 — the web launch** | The help centre with search (SF4), and "Contact support" | Nothing | Steps E1-E2 | US$0 |
| **2 — answers from our help content (rec)** | An "Ask a question" box that answers with the best-matching passages from our help articles, links to them, and always offers "Contact support" | **Nothing.** Search runs in the browser over our own articles, as SF4's does; no model at run time. Articles are written at development time with Claude, from synthetic or redacted questions | Release 2 (H6), or earlier if the owner moves it — it needs no rule change | US$0 |
| **3 — a live AI assistant** | A conversation that understands the question and answers from our help content | **What the person types.** That is why it needs the gate below | Only after the gate | Small: see below |

**Phase 3's gate — all of these, in this order, before anything is built:**

1. **Rule 15 amended by the owner** (Rule 23), naming exactly what may reach a model and from which feature. Today
   Rule 15 forbids it, and that is correct until this list is done.
2. **The attorney's review** (OA10's successor): consent wording shown before the person types, and the model
   provider as a processor under the Data Protection Act 2020, including the transfer outside Jamaica.
3. **The register and the privacy notice** name the model provider as a processor of support conversations, with
   its data-retention terms as they stand on the day (checked then, not assumed now).
4. **Defence in depth, built in:** what is typed passes a redactor that removes email addresses, phone numbers,
   registration numbers and the names of the tenant's own clients before it is sent; the assistant has **no tools
   and no access to tenant data** — it reads only our help articles, so it cannot show one tenant another's data
   (Rule 25.2) because it holds none; it never approves a payment or changes an account; it always offers a human;
   conversations are kept redacted, for a stated short period, or not at all.
5. **A spend limit** — the Claude spend cap (OA3) covers it, with its own share.

**Phase 3's running cost, estimated** — not a quote. Anthropic's list prices on 2026-10-02: Claude Haiku 4.5,
US$1 per million tokens read and US$5 per million written; Claude Sonnet 5.5, US$2 and US$10. A support
conversation of three exchanges, each sending about 4,000 tokens (the question with the matching help passages) and
receiving about 500, costs roughly **US$0.02 on Haiku 4.5** and **US$0.04 on Sonnet 5.5**. A thousand conversations
a month is therefore about **US$20-40**. The lighter model is the starting point (Rule 15: "a lighter model for
routine work").

**Recommendation:** build phase 1 for the web launch, phase 2 in release 2, and bring phase 3 back to the owner as its
own decision, with its gate, once phase 2's numbers show what people actually ask.

## 5. Options rejected for release 1, and why

- **A WhatsApp support line.** Jamaican contractors live on WhatsApp, which is the case for it. But the WhatsApp
  Business **app** puts every support conversation — clients' names and addresses included — on one staff member's
  phone, outside our tickets, audit trail and measures, and it cannot be handed over when a person leaves. The
  WhatsApp Business **Platform** (the proper route) makes service messages billable per message from 1 October 2026,
  and needs templates and an approved provider. **Revisit with WhatsApp sending in release 3 (I3)**, when the
  Platform is integrated anyway — a support line then costs little more.
- **In-app support threads** (replies inside the app): release 2, by R1.38 and finding B26; SF3's ticket is built so
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
| Chatbot | — | Phase 2: US$0. Phase 3, if approved: about US$20-40 per thousand conversations |
| WhatsApp support line | — | Revisited with I3 |

## 7. What gets built

- **E1:** the ticket table under row-level security and its audit entries; "Contact support" and "Report a problem"
  with the consent checkbox; the mailbox notice carrying only the reference; the staff console's ticket view,
  reply (through A6's email) and "create a ticket from an email"; the help centre with in-browser search, "did this
  help?" and the no-result count; the fixed reply for clients.
- **E2:** weekly triage in the console; the redacted-issue form with its guard; the hand-off to A4's maintenance
  task list; the measures of SF6; deletion on SF7's schedule.
- **H6 (release 2):** the chatbot's phase 2; in-app threads.
- **Documents:** the ADR recording this decision (brief §15); `docs/THREAT-MODEL.md` rows for support data and the
  redaction guard; the register's mailbox row (A5).

## 8. Tests, each proved with a planted defect

- A tenant sees only its own tickets; another tenant's ticket is invisible by id (the cross-tenant leak suite).
  Plant: the policy removed from the ticket table.
- Staff see a ticket only with `answer_support`, and each view is in the platform audit trail; the capability opens
  no other tenant data. Plants: the capability check removed; `answer_support` reading a quote.
- The mailbox notice carries the reference and category and **not** the message. Plant: the message added to it.
- Diagnostics are attached only when the box is ticked, and contain only the listed fields — no form contents, no
  full page address. Plants: the box ticked by default; the full address attached.
- The help centre's search sends no request when a person types. Plant: a search request to the API.
- The redaction guard refuses an issue holding an email address, a phone number in local and international form, a
  TRN, or the linked ticket's client name — each planted.
- Tickets past 24 months after closure are deleted with their messages; open ones are not. Plant: deletion counted
  from opening rather than closure.
- First-response time is stamped by the first reply and not by a later one. Plant: stamping on every reply.

## 9. What this does not do (Rule 21.4), and sources

- It does not choose the mailbox provider or error tracking — A5 does, from SF2's candidates.
- It does not design the maintenance task list or its approval screen — A4 does; SF8 says what feeds it.
- It does not build any chatbot that sends what a person types to a model. Phase 3 is a future decision with a gate.
- It does not support tenants' clients. They are the contractor's customers; we route them back, kindly.
- Prices are list prices on 2026-10-02 and change; each is checked again before money is spent.

**Sources for prices:** Zoho Desk ([dragapp](https://www.dragapp.com/blog/zoho-desk-pricing/),
[desk365](https://www.desk365.io/blog/zoho-desk-pricing)); Freshdesk ([ringly](https://www.ringly.io/blog/freshdesk-pricing),
[helpdesk.com](https://www.helpdesk.com/blog/freshdesk-pricing/)); Help Scout
([unthread](https://unthread.io/blog/help-scout-pricing/), [featurebase](https://featurebase.app/blog/helpscout-pricing));
Google Workspace ([emailvendorselection](https://www.emailvendorselection.com/google-workspace-pricing/)); Zoho Mail
([Zoho's price list](https://www.zoho.com/mail/images/mail-pricing-usd.pdf)); WhatsApp Business Platform
([Meta's pricing page](https://developers.facebook.com/docs/whatsapp/pricing),
[engagelab](https://www.engagelab.com/blog/whatsapp-pricing-2026-service-message-cost)); Claude models (Anthropic's
published API prices, as of 2026-09-25).
