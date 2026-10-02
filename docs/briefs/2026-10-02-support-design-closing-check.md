# Brief: closing check of the support and feedback design after its read (SR1-SR15)

**Agent:** general-purpose, **Sonnet** (Rule 16.9: mechanical — every item names the text to read, and the
expectations below are executed; the adversarial work was the Opus read, whose report is reproduced at the end of
this brief). **Under check:** `docs/design/support-and-feedback.md` as amended, with the pointers in `docs/PRD.md`
R1.43 and R1.44, at the commit that adds this brief.

## What to do

1. From the repository root, run `python3 tools/run_brief.py docs/briefs/2026-10-02-support-design-closing-check.md`
   and report its full output. Every check must PASS, and the tree must be clean afterwards.
2. For each of SR1-SR15 (in the report reproduced below), read the finding's recommendation, then the design's §10
   row for it and the section that row names. Report **answered** or **not answered**, quoting the sentence that
   answers it. A finding is answered when the design states a rule a builder can follow for every part of the
   recommendation, or states plainly why a part is not taken. Check in particular:
   - SR1: phase 2 records no question text, and phase 3's trigger names only data we already hold;
   - SR2: a search library is named, and the test asserts no network request of any kind, watched at the browser;
   - SR3: the guard runs on the server, lists its sources (including a match-only door to the client book), states
     what it cannot catch, and issues live in a database rather than git;
   - SR4: an email ticket joins an account only after the tenant confirms, signed in, and support never changes
     sign-in details on an email's word;
   - SR5: tier and version are recorded on every ticket without consent;
   - SR7: work the phase 3 cost by hand (25,500 tokens read and 1,500 written, at US$1/US$5 and US$2/US$10 per
     million) and confirm about US$0.03 and US$0.07 per conversation; and confirm every copy in SF7's table has a rule;
   - SR8: staff reach tickets through door functions, recorded in both audit trails, with reference and category only.
   Also report, for the reader's SF1-SF8 and §4 opinion table: does the design adopt each "disagree" or "agree,
   with" line, and where?
3. Do not edit, commit, stash, `git checkout --` or `git restore` anything. This is a reading check: there is no
   code, so there are no plants.

## Report

The runner's output; SR1-SR15, each answered / not answered, with its quoted sentence; the adoption lines; and a
last line, **closable** or **not closable**, for SR1-SR15 as a set. Nothing else.

## Expectations

Fifteen findings in the design's answer table:

```check
$ grep -c "^| SR[0-9]* ·" docs/design/support-and-feedback.md
15
```

Every finding is cited in the body as well as the table:

```check
$ for n in $(seq 1 15); do c=$(grep -oE "\bSR$n\b" docs/design/support-and-feedback.md | wc -l); [ "$c" -ge 2 ] || echo "SR$n only $c"; done; echo checked
checked
```

The amendment is declared, the library is named, and the PRD carries both pointers:

```check
$ grep -c "Amended the same day" docs/design/support-and-feedback.md; grep -c "MiniSearch" docs/design/support-and-feedback.md; grep -c "finding SR7" docs/PRD.md
1
4
2
```

The repository's checkers are clean:

```check
$ for t in check_rules check_dispositions check_citations check_schema_citations check_build_plan; do python3 tools/$t.py 2>&1 | tail -1; done
All citations resolve, and no rule has changed unreviewed.
Every Closed disposition cites every document its finding named.
Every cited filename and symbol resolves. (Paths are checked by tools/check_schema_citations.py, not here.)
Every citation in the forms this tool checks resolves (its docstring lists them, and what it does not check).
Every ticked step carries its evidence.
```

```check
$ git status --short
```

## The read's report, as given

Reproduced from the read's reply (brief `docs/briefs/2026-10-02-support-design-read.md`), unedited except that its
headings are one level lower and one file name (pagefind.js) is unquoted, so the citation checker does not
read a third-party file as a claim about this repository. Every value in it is synthetic.

## Independent read: `docs/design/support-and-feedback.md` (SF1–SF8 and §4)

HEAD is 4a4b93e on branch claude/admiring-fermat-41btub. I ran `python3 tools/run_brief.py docs/briefs/2026-10-02-support-design-read.md`. Its last line:
> Brief docs/briefs/2026-10-02-support-design-read.md at HEAD 4a4b93e: 3 of 3 expectations hold.

I edited nothing in the repo. Scratch work (a Pagefind experiment on synthetic HTML) stayed in the session scratchpad. The tree did not change while I worked.

Status labels used below:
- **CONFIRMED** means I ran it and saw the result.
- **REASONED** means I worked it out from the documents. No support code exists yet, so every finding about the future build is REASONED.

### Findings

**SR1 · major · §4 Recommendation vs SF4 and §4 phase 2 (REASONED)**
- **Where:** §4 says phase 3 comes back to the owner "once phase 2's numbers show what people actually ask".
- **The problem:** phase 2 searches in the browser, and SF4 says "nothing typed is logged, nothing is sent". So phase 2 cannot produce numbers about what people ask.
- **Risk:** the stated trigger is either unmeasurable, or it invites the H6 builder to log the questions people type. Logging those would break SF4, Rule 25.2 ("keeps no unredacted logs") and Rule 15's intent. Those questions are free text that names clients.
- **Recommendation:** restate the trigger in terms of data we already have: ticket categories and triage outcomes, the per-article "did this help?" ratio and the no-result count. Say explicitly that phase 2 records no question text, and add an H6 test, with a planted defect, that the "Ask a question" box sends nothing.

**SR2 · major · SF4 "Search runs in the browser … nothing is sent", and §8's search test (CONFIRMED)**
- **The problem:** the claim depends on which library the builder picks, and the design does not choose one.
- **What I ran:** I built a Pagefind 1.x index (the usual static-site search) over 300 synthetic articles and ran its real pagefind.js with `fetch` logged, in a fresh process per term. After the page had loaded, typing fetched index shards chosen by the term:
  - `brown`, `browne`, `brownsville` and `campbell` each fetched `/pagefind/index/unknown_6db75b4.pf_index`;
  - `tamara` fetched `…db41605.pf_index`;
  - `hope` fetched `…73a37bd.pf_index`;
  - `hope road` fetched two shards;
  - a matching term also fetched result fragments.
- **What leaks:** the host's access log records which alphabetical range each typed word fell in, and for matches, which articles. That is coarse, but "nothing is sent" is false.
- **Other libraries (REASONED):** Algolia DocSearch sends every keystroke to a third party.
- **The test misses it:** §8's plant is "a search request to the API". A test that watches only the API passes with Pagefind or Algolia.
- **CSP (REASONED):** Pagefind also needs WebAssembly, which loosens the site's Content-Security-Policy.
- **Recommendation:** require a library whose whole index loads with the page and makes no requests while searching (MiniSearch, FlexSearch or Lunr; I did not run these). Name it in the design. The §8 test should assert that typing causes **no network request of any kind**.

**SR3 · major · SF8.3 — the redaction guard can't be built or planted as written, and what slips through stays forever (REASONED)**
- **Not buildable:** "a name or address present in the linked ticket" has no defined source. The ticket message is free text with no name field, and finding names in it needs NER. The planted "ticket's own client name" assumes a structured field that does not exist. The obvious real source is the tenant's client book, but SF3 says `answer_support` "covers tickets and nothing else". Whether the guard may check the client book (for example through a door function that only answers match / no match) is left to the builder.
- **Misses, measured against SF8.2's own "Never" list and the threat:**
  - amounts ("an amount tied to a real job" is in the Never list, not in the guard);
  - a verbatim copy of the person's message (no overlap check);
  - share-link URLs and tokens, which AP9 treats as credentials. "This link won't open: share.pryvis.com/s/…" would carry a live capability to Claude;
  - Jamaica's 658 area code (an overlay alongside 876, from my own knowledge, not checked in the repo);
  - names that are not in the linked ticket (known from the mailbox or memory), and paraphrase or abbreviation ("Mrs B., Hope Rd").
- **Where it runs:** "the console scans" does not say the check runs on the server.
- **Retention:** SF7 lets redacted issues and "triage notes" follow the repository's history, so anything that slips past the guard can never be deleted. "Triage notes" are defined nowhere and have no guard.
- **Overclaim:** SF8.4 says what Claude sees is "by construction" what passed the guard. That holds only if the task list is Claude's only input. The issue text also carries the ticket reference, which is a pseudonymous key.
- **Recommendation:** specify a server-side check against concrete sources:
  - the user's name and email address;
  - the tenant's client names and addresses, through a match/no-match door;
  - n-gram overlap with the ticket message;
  - amounts, and URLs or tokens;
  - the phone and TRN patterns, taken from the rule pack.

  Keep redacted issues in the A4 task list (a database), where they can be deleted, not in git. Define or drop "triage notes", and keep the ticket reference on our side rather than in the text Claude reads.

**SR4 · major · SF3 way 3 — an email-created ticket is a side door (REASONED)**
- **Linking:** "Linked to a tenant when the sender is one" rests on an email From address, which anyone can forge. Doing the lookup means reading `app_credential`, which is outside "`answer_support` covers tickets and nothing else". Each address maps to one tenant (ADR 0022), but one person may own several businesses, each with its own address.
- **The leak:** SF3 lets a tenant's users see all of their tenant's tickets. A ticket linked to the wrong tenant shows its full message, possibly holding another business's client data, to the wrong tenant.
- **Locked out:** SF2 names "locked out / lost second factor" as a primary audience. But no R1.46 capability and no step in this design says what staff may do for them, so identity checks will be improvised over email (social engineering).
- **Recommendation:**
  - link only through a door that matches the sender's address exactly to a verified credential;
  - tickets created from email stay staff-only until the tenant confirms them;
  - replies to unverified senders carry no account detail;
  - lockout either gets a written procedure or is explicitly out of scope.

**SR5 · major · SF1 vs SF5 vs Rule 25.3 (REASONED)**
- **The conflict:** SF1 C says tickets are "automatically linked to the tenant, tier, app version and page". SF5 attaches version, plan and page only when the box is ticked, and it is unticked by default. Rule 25.3 says "every piece of feedback is … linked to the app version and tier". ADR 0030 decision 4 makes those consent-gated.
- **Consequence:** with SF5 as written, most tickets will carry no version or tier. Rule 25.3 then fails, and SF6's per-tier measures have gaps.
- **Recommendation:** always record tier (the server knows it) and app version. Neither is personal data. Put only the page and the request ids behind consent, and reconcile ADR 0030 decision 4 and Rule 25.3 in the A3 ADR.

**SR6 · major · SF3 "Clients of a contractor" fixed reply vs R1.44 and the privacy notice (REASONED)**
- **The problem:** the one fixed reply ("Please contact the business…") would also answer:
  - a data-protection request from a client. R1.44 says such a request "can be carried out", and the notice (`new-app/web/content/legal.ts`, "Your choices") promises "Write to us and a person will answer";
  - an abuse report, for example a share page used for phishing, which only a client would send.
- **Recommendation:** exclude data-rights requests and abuse reports from the fixed reply, and route them to R1.44 handling and to `suspend_tenant` review.

**SR7 · major · SF7 retention misses copies held outside the ticket (REASONED)**
- **Copies the schedule doesn't cover:**
  - staff replies go out through A6 (Resend in the register), which holds message content. That copy is not in the schedule, and Resend's register row doesn't list support replies;
  - the mailbox's Sent folder and Trash;
  - the error-tracking events a ticket links to;
  - backups, and restore drills that could bring deleted tickets back.
- **Audit details:** audit entries keep for 7 years and survive tenant deletion (ADR 0020; legal.ts says so). The design never says ticket audit `details` must exclude the subject and message.
- **Erasure:** a client's erasure under R1.44 does not reach ticket free text ("the Browns at 12 Hope Road").
- **Export:** R1.43's export list does not include tickets, although SF7 promises them.
- **Two overclaims:**
  - "the mailbox never holds what the ticket holds" is false once someone replies, because email clients quote the earlier message;
  - SF1's "the one place it escapes" ignores the fact that the mailbox already holds email-originated content.
- **Missing from §7's document list:** the privacy-notice text for support messages, diagnostics and the 24-month period.
- **Recommendation:** list every copy with its retention, add the audit-details rule (ticket id and category only), add tickets to R1.43 and R1.44, and add the notice text to §7.

**SR8 · major · Staff access mechanics left to the builder (REASONED)**
- **No read path:** no deployed role may bypass row-level security (privilege model D4), yet weekly triage reads tickets across all tenants. No door function is specified.
- **Tenantless tickets:** they need a nullable `tenant_id`. Every tenant table in the migrations is `NOT NULL`, and `audit_entry.tenant_id` is `NOT NULL` too, so it is undecided where a tenantless ticket's audit entry goes.
- **Visibility conflict:** SF3 records staff views in the *platform* trail, but legal.ts promises the tenant can see "any action taken by Pryvis staff on your account".
- **Recommendation:** specify the doors, the tenantless-ticket storage, and which trail records views of a tenant's ticket (the tenant-visible one).

**SR9 · minor · SF4 "no record of what was typed" for the counters (REASONED)**
- The help centre is on pryvis.com, the same site as the app.
- A no-result or "did this help?" request to the API with the session cookie gets AP9's per-request line with tenant and user id. That is a per-user "searched and found nothing at time T" record.
- If the query ever sits in the page URL, the Referer header carries it.
- There is no test for any of this.
- **Recommendation:**
  - send the counters without credentials, with `Referrer-Policy: no-referrer`;
  - keep the query out of the URL;
  - count on submit only;
  - plant "the query in the beacon".

**SR10 · minor · SF5 consent and diagnostics (REASONED)**
- **Wording:** the consent text says "the reference of the last error". The design attaches the last three request ids.
- **Server-side checks:** the route template and request ids come from the browser. The server must check them against a closed list of templates and the UUID shape, or the diagnostics become an unguarded free-text channel.
- **Error tracking:** "By AP9 holds no personal data" rests on AP9's test, which searches log output, not the payload sent to error tracking. Staff opening an error event from a ticket also sit outside `answer_support` and the audit trail.

**SR11 · minor · Interaction with the T1 tax-name guard (REASONED)**
- **Filenames:** "Change your GCT rate" will become a slug or filename, and T1 scans file contents, not names.
- **Location:** T1 reads `.md` only inside `new-app/`, so the help articles' folder must be stated.
- **SF8 code:** SF8's "Jamaican TRN" pattern in console code collides with T1. Token matching flags `TRN_PATTERN`. The pattern is also Jamaica-only.
- **Recommendation:** the registration-number pattern belongs in the rule pack.

**SR12 · minor · SF6 measures (REASONED)**
- For an email-originated ticket, "opened" is when staff create it, so a three-day-old email answered on creation shows about zero response time. Record when the email was received.
- Clock time versus working hours, the holiday list, and what "active tenant" means are undefined.

**SR13 · minor · §4 phase 3 cost (CONFIRMED)**
- **Prices:** checked against docs.claude.com (Haiku 4.5 $1/$5; Sonnet 5.5 $2/$10) — they match.
- **Arithmetic as stated:** 12,000 tokens in and 1,500 out gives $0.0195 on Haiku and $0.039 on Sonnet, so "$0.02 / $0.04" and "$20–40 per 1,000" hold.
- **But:** a conversation that "understands" follow-ups must resend its history. On the same assumptions that is 25,500 tokens in: $0.033 and $0.066 per conversation, about **$33–66 per 1,000**.
- **Sources:** the Claude source has no URL, and it is dated 2026-09-25 against "list prices on 2026-10-02".
- **Phase 3 gate:** it also lacks a planted-defect test of the redactor (whose list misses addresses, amounts and non-client names), a kill switch, and per-tenant rate limits against abuse of the bot as a free model.

**SR14 · minor · §5 and SF1–SF2 prices (not verified)**
- The proxy blocked Meta, engagelab, Zoho, Google, Help Scout and Freshdesk, so I checked none of those prices.
- "WhatsApp service messages billable from 1 October 2026" comes from a third-party blog. My own knowledge as of mid-2026 is that customer-initiated service messages were free under the July 2025 model.
- The Help Scout per-user figure may be stale.
- The rejections don't depend on these numbers, but they should be checked against the vendors' own pages.

**SR15 · minor · R1.24e routes reconciliation alerts to "the support address"**
- SF2 and SF7 don't account for system alerts in the mailbox: whether they become tickets, or what they contain.

### SF1–SF8 and §4: my own view

| Item | Verdict | Alternative where I disagree |
|---|---|---|
| SF1 | Agree | — |
| SF2 | Agree | — (prefer whichever provider can enforce automatic deletion; SR7) |
| SF3 | Agree, with SR4 and SR6 fixed | Email tickets link only through a verified-credential door and stay staff-only until the tenant confirms; data-rights and abuse emails are excluded from the fixed reply |
| SF4 | Agree, with a constraint | Name a library whose whole index loads with the page, not Pagefind or Algolia, and test "no request of any kind" |
| SF5 | Disagree in part | Always record tier and version; consent covers only the page and request ids |
| SF6 | Agree | — (measure from when an email was received) |
| SF7 | Disagree in part | 24 months is right; redacted issues go in the A4 database, deletable, not git history; list every copy (SR7) |
| SF8 | Disagree on the guard | Server-side check against the user's details, the client book (match/no-match door), message overlap, amounts, URLs and tokens, and rule-pack patterns |
| §4 | Agree on the phases | Re-trigger phase 3 on ticket and triage data, not "what people ask", which phase 2 must never record |

**Verdict:** the design is sound after the named changes (SR1–SR8).

`git status --short` printed nothing (the tree is clean).
