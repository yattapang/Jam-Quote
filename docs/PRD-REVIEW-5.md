# PRD review 5 — adversarial review of `docs/PRD.md` before the owner approves it

**Reviewer:** independent review agent (Opus class), 2026-10-02, at HEAD `9501483` (branch
`claude/admiring-fermat-41btub`). **Did not write** any of the work under review. Brief:
`docs/briefs/2026-10-02-prd-review-5.md`; `python3 tools/run_brief.py docs/briefs/2026-10-02-prd-review-5.md`
printed, before this file existed: `Brief docs/briefs/2026-10-02-prd-review-5.md at HEAD 9501483: 3 of 3
expectations hold.`

Rules applied: Rule 0, 1.7, 1.9, 1.10, 3, 5, 10, 11, 12, 13, 14, 18, 19, 20, 21.4, 21.8, 21.10, 24.6.

**Findings are numbered B1, B2, … and appended as they are found** (Rule 1.10). The summary the brief asks
for — recommendation, ranked changes, owner decisions, what was not examined — is written at the top once
the findings are on disk.

## Disposition — updated as findings close (added 2026-10-02, by the author, not the reviewer)

**Only an independently re-checked fix reads Closed (Rule 24.6).** The owner's decisions are ADR 0027.

| # | Sev | Disposition |
|---|---|---|
| **B1** | major | **Fixed, re-review owed.** PRD N4 and N10 now say what exists: the contrast check and a release-1 cold-start instrument are owed; the ~50 s is a 2026-09-24 hand measurement of the old application. |
| **B2** | major | **Fixed, re-review owed.** R1.32a's "upgrading releases it" removed; ADR 0023 decision 1 amended with a dated note. |
| **B3** | minor | **Fixed, re-review owed.** Header cites ADR 0006; §12 cites ADR 0005/0006 and says the rule pack is owed in the rebuild. |
| **B4** | blocker | **Fixed, re-review owed.** Site copy corrected (features, home, about, pricing intro, "coming next"); export built into R1 as R1.43; a new guard in `new-app/web/test/site-guards.test.ts` walks every string in the site and legal copy (planted: caught); §7 rewritten as current state. |
| **B5** | blocker | **Fixed, re-review owed.** ADR 0027 D1 (seal-only offline) and D2 (React Native/Expo), then ADR 0028 (web first, online; offline with the mobile app): §4, R1.4, R1.12, R1.18a, R1.22f-g, §8, §12 amended; the domain model §8 table and THREAT-MODEL §4a amended after the re-read (C3, C5). |
| **B6** | major | **Fixed, re-review owed.** ADR 0027 D5: Pro has about three users, no roles; §7, `docs/TIERS.md` and R1.18c/e amended; the role clause applies from R3. |
| **B7** | blocker | **Fixed, re-review owed.** ADR 0027 D4: W9 gains R1.37a (card upgrade, if WiPay supports it for our account), R1.37b (term and renewal), R1.37c (lapse), R1.37d-e. |
| **B8** | major | **Fixed, re-review owed.** PRD R1.44 (data requests, redaction), R1.45 (breach response), §9 item 6 (attorney before launch, ADR 0027 D14); THREAT-MODEL §6 and the register's "normal and lawful" corrected. The legal readings themselves stay open until the attorney. |
| **B9** | blocker | **Fixed, re-review owed.** ADR 0027 D3: R1.29 pays into each tenant's own WiPay account; R1.26 records over-payments; §9 1b rewritten. WiPay's per-tenant offer is still to be confirmed (§9). |
| **B10** | blocker | **Open — decided, design owed.** ADR 0027 D7: tax-exclusive ceiling, GCT per invoice; R1.9 states what the GCT design must answer, and that it is owed before W3/W7 with an accountant's review before launch. |
| **B11** | major | **Fixed, re-review owed.** §10 and R1.42 amended: Pro-only invoice signal, "active" defined, 30-day conversion window, three new signals, the 100% row replaced, a minimum cohort. |
| **B12** | major | **Fixed, re-review owed.** `docs/ROADMAP.md`, `docs/MILESTONES.md`, `docs/PRICING.md`, `docs/ARCHITECTURE.md` marked superseded for the rebuild; the PRD header names them. |
| **B13** | major | **Fixed, re-review owed.** R1.21a: at launch the API serves the share page and checks expiry and revocation on every view; nothing is pre-rendered at the edge; R1.19 states the link lifetime; THREAT-MODEL §4a's share-page row rewritten after the re-read (C3). |
| **B14** | minor | **Fixed, re-review owed.** §3, §4 and §8 say recorded variations are R1 and signed change orders R2; an index of requirement numbers heads §5. |
| **B15** | major | **Fixed, re-review owed.** W10 added (R1.46-R1.49): capabilities, no impersonation in R1 (ADR 0027 D9), a platform audit trail, the console's screens. The console's own design is still owed. |
| **B16** | major | **Fixed, re-review owed.** ADR 0027 D10: nothing is sent at sync, the contractor taps send (R1.18, R1.21); R1.21b delivery outcomes and bounces; R1.21c opt-out and per-tier message caps. |
| **B17** | minor | **Fixed, re-review owed.** N11 added: WCAG 2.2 AA for the share page, text scaling and touch targets for the sealing path. |
| **B18** | major | **Fixed, re-review owed.** ADR 0027 D6: the default bar is channel-aware (R1.20); `docs/design/acceptance-evidence.md` decision 1 amended. |
| **B19** | major | **Fixed, re-review owed.** §11 re-ranked with a watcher and trigger on each; the numeric triggers approved by the owner 2026-10-02; risks 4 and 5 moved out. |
| **B20** | major | **Fixed, re-review owed.** ADR 0027 D11: migration `20260928010000_number_series_never_resets` accepts only 'never' (tested in `new-app/db/test/documents-core.test.ts`, "B20"; planted: caught); R1.14 amended and names the gaplessness test owed. |
| **B21** | major | **Fixed, re-review owed.** R1.20d: only a provider-confirmed payment is grade 6; a hand-recorded deposit is grade 1; §7 says grade 6 needs Pro; the acceptance designs amended. |
| **B22** | major | **Fixed, re-review owed.** §9 items 6-10 added: attorney, paid host, accountant, app-store accounts, the Claude budget. |
| **B23** | major | **Fixed, re-review owed.** ADR 0027 D12: R1.18f separates an ordinary revocation (sign in, push first) from "this device is lost"; R1.18d widened to any automatic process; the domain model §8 and THREAT-MODEL §4a amended after the re-read (C3). |
| **B24** | minor | **Fixed, re-review owed.** `docs/SERVICE-REGISTER.md` §1 and §6 item 4, `docs/BRIEF-STATUS.md`'s §19 row, ADR 0023's Consequences and the domain model's `client_payment` row corrected. |
| **B25** | minor | **Fixed, re-review owed.** Values stated: R1.18b 3 days, R1.18d no limit for unsynced seals, R1.19 link lifetime, R1.17 expiry and its effect (30-day default approved by the owner), R1.24e mechanism, R1.32 Jamaica's month, R1.37e grace period. |
| **B26** | minor | **Fixed, re-review owed.** ADR 0027 D13: R1.20c moved to R2; R1.25a retention billed net and "do not remind"; support is email plus a chatbot (R1.38, D9). |
| **B27** | minor | **Fixed, re-review owed.** PRD status block rewritten; `docs/BRIEF-STATUS.md` item 3 marked superseded; the domain model's header corrected. |
| **B28** | major | **Fixed, re-review owed.** R1.30b-c corrected and the equality guard made a precondition of sign-up; ADR 0022, ADR 0025 decision 5, the domain model's `user` row and THREAT-MODEL §4b corrected to match ADR 0015. |
| **C1** | major | **Fixed, re-review owed.** ADR 0029 E2: R1.20d and R1.29 trust a per-tenant WiPay payment only after our server confirms it with WiPay; otherwise grade 1. Tenant credentials encrypted with a key outside the database; THREAT-MODEL §4.6 row and register rows added; whether WiPay offers the query is in §9. |
| **C2** | major | **Fixed, re-review owed.** Tax-basis notes under R1.22b, R1.24, §4, the domain model §6.2a and `docs/design/scope-reduction.md`; R1.9's GCT list gains net/gross for variations and the invoiced figure, and the refund and client-credit records. |
| **C3** | major | **Fixed, re-review owed.** The domain model §8 (offline table, wipe, role re-check) and THREAT-MODEL §4a (sign-out row, share-page row) amended to ADR 0027 D1/D12, ADR 0028 and R1.21a. |
| **C4** | major | **Fixed, re-review owed.** ADR 0029 E1: no chatbot at the web launch; R1.38 is email; the chatbot goes to the support-model options paper (brief §15). TIERS and §9 item 10 amended; the register's Anthropic row stays "no runtime use". |
| **C5** | major | **Fixed, re-review owed.** §4's opening rewritten to ADR 0028; R1.4 marked [mobile]; R1.8 names the web launch's network; ADR 0029 E4: a fourth Free job is sealed and blocked on the web as on the phone, and a second member's seal is kept as a rejected seal (R1.18 marker, R1.32, R1.32a-c). |
| **C6** | major | **Fixed, re-review owed.** ADR 0029 E3: exactly 3 users (§7, R1.18c, `docs/TIERS.md`); R1.37c: every member keeps access on lapse and no seal is refused for the lapse itself. |
| **C7** | major | **Fixed, re-review owed.** `new-app/web/test/site-guards.test.ts`: a mobile marker only on listed mobile lines; tier `who` and `theLine` walked; offline phrases added; a marker exempts only its own sentence. The reviewer's four plants re-planted one at a time: all caught. R1.40b states what it does not catch. |
| **C8** | minor | **Fixed, re-review owed.** The B20 test refuses "quarterly" and the empty string too (the reviewer's NOT IN plant: caught); R1.14 says the count continues and the start cannot go below the last number. |
| **C9** | minor | **Fixed, re-review owed.** The features page says the code goes to the client's email, where they have one. |
| **C10** | minor | **Fixed, re-review owed.** `docs/SERVICE-REGISTER.md`: Expo/EAS for Android and iOS; Google Play and Apple developer rows; a row for each tenant's WiPay account; a secrets row for tenant WiPay credentials. |

## Summary for the owner (written after the findings below)

### 1. Recommendation: **do not approve yet**

The PRD is careful, and its money and acceptance layers have been hardened by four rounds, but five
blockers are about whether release 1 can **charge, tax, collect and keep** what it promises, and each needs
a decision only you can make. W9 has no card upgrade, billing term or lapse rule (B7). Card links don't say
whose merchant account the client's money lands in (B9). GCT is undesigned for invoices, and the built
`invoice` row carries no tax (B10). §4 says it keeps the sync engine out of release 1 while the requirements
build most of one, on an app platform that is still undecided (B5). And the public site still sells release-2
features and promises a data export that release 1 doesn't build (B4). Approving now would approve those as
unknowns. Once you have made the decisions in §3 below and the ranked changes are in, the rest is
approvable: most of the remaining findings are corrections, not redesign.

### 2. The changes this depends on, ranked

1. **Offline scope and app platform decided; §4, §8, §12, R1.18f rewritten to match** — B5 (with B22 item 4).
2. **WiPay money model decided; R1.29 and §9 1b rewritten; R1.26 records over-payments** — B9.
3. **W9 gains card upgrade (or an explicit manual-only decision), a billing term and a lapse rule** — B7.
4. **A GCT design, reviewed by your accountant, before W3/W7 are built** — B10.
5. **Site copy corrected, an R1 data-export requirement added, R1.40b's guard widened to every page** — B4.
6. **R1.18f no longer wipes unsynced seals on a password reset or expiry** — B23.
7. **Grade 6 only for provider-confirmed deposits; a hand-recorded deposit is grade 1** — B21.
8. **R1.30c and four documents corrected on which index enforces one-address-one-tenant; the equality guard made a precondition of sign-up** — B28.
9. **R1.32a's "upgrading releases it" deleted; ADR 0023 amended** — B2.
10. **§6's N4 and N10 rows say what exists** — B1.
11. **R1.21a: at launch the share page is served by the always-on API** — B13.
12. **Pro seat count decided; R1.18c/e/h written for R1's real users** — B6.
13. **Default acceptance bar for WhatsApp-only clients decided** — B18.
14. **§9 gains the attorney (data protection and e-signature), a paid host, an accountant, app distribution** — B8, B22.
15. **§10 measures and §11 risks repaired** — B11, B19.
16. **Staff operations, delivery behaviour, and numbering resets specified before W4/W9 are built** — B15, B16, B20.
17. Corrections, in one pass — B3, B12, B14, B17, B24, B25, B26, B27.

### 3. Decisions only you can make

| # | Decision | Options | My recommendation |
|---|---|---|---|
| D1 | Offline scope in R1 (B5) | (a) seal-only offline: cached reads, one-device drafts, sealing; offline creates, offline variations and draft merge move to R2 · (b) keep the scope and say R1 builds the sync engine | **(a)** — it is what §4 argued for |
| D2 | App platform (B5, B22) | React Native · PWA | Decide before approval; R1.18f as written needs native. If PWA, R1.18f is rewritten |
| D3 | Whose WiPay account takes a client's card payment (B9) | (a) each Pro tenant's own merchant account · (b) one platform account, with payouts | **(a)** — keeps Pryvis out of holding client money |
| D4 | Paying us (B7) | card upgrade in R1, or manual-only; monthly / yearly term; what a lapsed tenant keeps | Card in R1 if D3 allows; on lapse keep everything readable, let invoiced money be collected, stop reminders, export always |
| D5 | Pro seats (B6) | (a) about 3 users, no roles · (b) 1 user, persona and terms changed | **(a)** — matches the persona and makes the audit trail mean something |
| D6 | Default bar for a WhatsApp-only client (B18) | (a) channel-aware default (3 with email, 2 without) · (b) buy SMS · (c) accept and state it | **(a)** |
| D7 | Is the invoicing ceiling tax-inclusive (B10)? | inclusive (as built) · exclusive, tax per invoice | Ask your accountant; exclusive avoids the rate-change trap |
| D8 | Data export in R1 (B4, B8) | build it · remove the promise from the site and terms | **Build it** |
| D9 | Support and staff access (B15, B26) | in-app threads or email in R1; impersonation in R1 or not | **Email in R1; no impersonation in R1** |
| D10 | Is a sealed quote sent automatically when the phone reconnects (B16)? | automatic · contractor taps send | **Contractor taps send** |
| D11 | Number resets (B20) | `never` only in R1 · yearly/monthly with a schema change | **`never` only; year in the prefix** |
| D12 | What a revoked device does with unsynced seals (B23) | wipe on reconnect · re-authenticate and push first; wipe only on "lost device" | **Push first** |
| D13 | Scope moves (B26) | R1.20c signed-copy upload to R2; retention billing guidance in R1 | Move R1.20c; add the guidance |
| D14 | Legal (B8, B22) | one attorney visit covering terms, privacy, the Data Protection Act, the e-signature question, and payments | Do it before W5 and W9 are built |

### 4. Count of findings

**28: 5 blocker · 16 major · 7 minor · 0 question.** Four of them show an earlier **Closed**
finding does not hold as a whole: H12 (B2), H17 (B24), F4 (B24), H8 (B28). F6 is still open and still true
(B4).

### 5. What this review did not examine (Rule 21.4)

- **Jamaican law.** Statements about the Data Protection Act, 2020, GCT invoice requirements, electronic
  signatures and payment regulation are my understanding, labelled as such, and **not verified**. They are
  questions for your attorney and accountant.
- **No device was used.** What a PWA can or cannot do with the keystore and storage eviction (B5) is
  judgement.
- **The real-PostgreSQL race suite was not run** (`PRYVIS_PG_URL` unset; it printed its SKIPPED line). I ran
  `npm run typecheck` (5 of 5 tasks) and `npm test` in `new-app/`: core 9, db 245 passed and 22 skipped, api 191,
  web 11, contract 2. I did not run lint, `next build`, or the four checkers' plants. The checkers' last
  lines at this HEAD all reported clean.
- **Review 4's code-level closures (J1-J16 and the K-AA re-reviews) were not re-verified.** I read its
  disposition table and headings and executed only what bore on PRD claims (B20, B28). Reviews 1-3: I
  spot-checked the closures of F4, F5, F6, H8, H9, H12 and H17 against the current text, not all of them.
- **Read in full:** the PRD, the brief, `TIERS.md`, `PRICING.md`, `ROADMAP.md`, `MILESTONES.md`, ADRs 0006,
  0007, 0008, 0023, 0024 and 0026, `acceptance-evidence.md`, the domain model §6-§11, THREAT-MODEL §4a-§4c and §6,
  SERVICE-REGISTER, the site's `site.ts`, `legal.ts` and `site-guards.test.ts`. **Read in part or by search:**
  RULES, `new-app/CLAUDE.md`, BRIEF-STATUS, ADRs 0005, 0013, 0015, 0020, 0022, 0025, `acceptance-grade.md`,
  `acceptance-responses.md`, `staff-mfa.md`, `privilege-model.md`, the migrations. **Not read:** the other
  ADRs; the designs `api-bootstrap.md`, `audit-log.md`, `marketing-site.md`, `row-identity-and-versioning.md`
  and `scope-reduction.md`; `DEVELOPMENT-BRIEF.md` beyond §8; `MISTAKES.md`; `PHASE-0-AUDIT.md`; `SYNC.md`;
  `PRODUCT-OPPORTUNITIES.md`; `original-app/` beyond its WiPay service.
- **Rule 21.10 writer sets** (`issue_balance` and the rest) were not re-attacked. Review 4's rounds did that.

Executed evidence lives in the findings. The scratch scripts (B20, B28) ran from my scratch directory
against PGlite with every committed migration applied, and nothing was written to the repository. The
one plant (B4) was made in `new-app/web/content/site.ts` from a backup copy, and the file was restored
from it and shown identical with `diff -q`.

---

## Findings

---

## B1 · Two of §6's "named instruments" do not exist: N10's workflow records no cold-start figure and probes the frozen old app, and N4's contrast check is nowhere in the repository — severity: major

**Where:** `docs/PRD.md` (§6, N4 and N10), `.github/workflows/keep-api-warm.yml`, `render.yaml`,
`new-app/web/app/globals.css`, `new-app/web/test/site-guards.test.ts`

**The claims under attack.** §6 opens by saying review G15 found the "requirements with tests" claim
unearned, so "the instrument is now named beside each, and where there is none the row says so"
(`docs/PRD.md:519-522`). Then:

> N10 — "**Instrument:** the `API liveness` workflow records the cold-start figure on every run, so the
> number in this row is measured rather than remembered." (`docs/PRD.md:535`)

> N4 — "contrast ratios are asserted by an automated check on the design tokens." (`docs/PRD.md:529`)

**Why they do not hold.**

*N10.* The workflow named `API liveness` is `.github/workflows/keep-api-warm.yml`. Its only measurement is
the HTTP status: `code=$(curl -sS -m 150 -o /dev/null -w "%{http_code}" "$url")` then
`echo "health: HTTP ${code}"`. No timing is captured:

```
$ grep -n "time_total\|%{time" .github/workflows/*.yml
(no output)
```

So "the number in this row is measured rather than remembered" is false: the ~50 s in N10 is the
hand measurement of 2026-09-24 quoted in `docs/SERVICE-REGISTER.md` §4a, i.e. remembered. Worse, the URL it
probes is `https://jamquote-api.onrender.com/api/health`, and `render.yaml` deploys that service with
`rootDir: original-app` — the frozen old application. Even if the workflow timed the request, it would be
measuring a codebase the PRD says is never built on, not the release-1 API.

*N4.* There is no contrast check anywhere in the new application, its tools or CI:

```
$ git grep -n -i "contrast" -- new-app tools .github | grep -v "^new-app/web/app/globals.css"
(no output)
```

The only hits are comments in `globals.css` (lines 7, 19, 38) saying colours were *chosen* to pass. The
eleven tests in `new-app/web/test/site-guards.test.ts` (titles at lines 123-401) include none on colour.

This is exactly the pattern §6's own preamble says it fixed: a named instrument that is not there reads as
a test and is not one (Rule 21.1, Rule 21.8 — `check_citations.py` passes because the sentence names no
file).

**Recommendation.** Before approval, make both rows say what exists (Rule 21.1): N10 "the cold-start figure
is a hand measurement of the old app (2026-09-24); an instrument that times the release-1 API is owed", and
N4 "a contrast check on the design tokens is owed". Then, as build work, either add `%{time_total}` and the
new API's URL to the workflow, or delete the instrument claim. Recommended: state the gap now (cheap, true),
build the contrast check with the first app screen, since `globals.css` is the site's and the app's tokens do
not exist yet.

## B2 · R1.32a says upgrading releases a blocked seal; R1.32c, eleven lines later, says upgrading must not — H12's closure left the sentence it overturned in place — severity: major

**Where:** `docs/PRD.md` (R1.32a, R1.32c), `docs/adr/0023-release-1-metering-and-tier-boundaries.md`,
`docs/PRD-REVIEW-3.md` (H12's disposition)

**The claims under attack.**

> R1.32a — "The refused snapshot is **kept, never destroyed**, the message explains what happened rather
> than reporting a sync error, **and upgrading releases it.**" (`docs/PRD.md:481-483`)

> R1.32c — "upgrading lifts the limit **rather than releasing the seals** — because releasing them would be
> numbering on the tenant's behalf, which R1.32b just refused to do." (`docs/PRD.md:495-497`)

**Why it does not hold.** These are opposite behaviours for the same event, and a builder must pick one:
after a Free tenant upgrades, are the three blocked seals numbered (and so become documents with numbers a
client will see), or do they wait for the tenant? ADR 0023 decision 1 — the authority R1.32 cites — still
says the first: "The sealed snapshot is not destroyed; it waits, **and upgrading releases it**"
(`docs/adr/0023-release-1-metering-and-tier-boundaries.md:38`). The domain model (§8, "Nothing releases a
blocked seal automatically") agrees with R1.32c. So it is two documents against two.

H12 is recorded **Closed** ("Closed by removing the queue", `docs/PRD-REVIEW-3.md:17`). The closure added
R1.32b-c and did not touch R1.32a or the ADR, although review 3 quoted R1.32a's "upgrading releases it"
when it raised H12 (`docs/PRD-REVIEW-3.md:563`). The closed finding does not hold as a whole.

**Recommendation.** Delete "and upgrading releases it" from R1.32a and replace it with "upgrading lifts the
limit; the tenant numbers each blocked seal (R1.32b)". Amend ADR 0023 decision 1 with a dated note pointing
at R1.32b-c (Rule 1.9). The owner's choice was already made in R1.32b; this is a correction, not a decision.

## B3 · ADR 0008 is cited twice for Jamaica-first and the rule-pack foundation; ADR 0008 is about guards and flow tests — severity: minor

**Where:** `docs/PRD.md` (header line 14, §12 line 688), `docs/adr/0008-guards-and-flow-tests.md`,
`docs/adr/0005-regulatory-rules-as-data.md`, `docs/adr/0006-tenant-and-country-aware-model.md`

**The claims under attack.** "Country: **Jamaica first** (ADR 0008)" (`docs/PRD.md:14`) and "The rule-pack
foundation exists (ADR 0008)" (`docs/PRD.md:688`).

**Why it does not hold.** ADR 0008 is "Defect classes are held by parser-based guards and real-database flow
tests" (`docs/adr/0008-guards-and-flow-tests.md:1`). Country selection and Jamaica's day boundary are ADR
0006 ("`Business.countryCode` selects the rule pack … today Jamaica's"); rules as data is ADR 0005.
`tools/check_citations.py` passes because "ADR 0008" resolves to *a* file — it does not check that the file
says what the sentence needs.

The second sentence is also false at this HEAD in substance: "the rule-pack foundation exists" is true of
`original-app/`, but in the rebuild `packages/core` holds no rule pack — `new-app/CLAUDE.md`'s "Not built
yet" list ends with "the port of `packages/core`", and the schema has a single
`quote_issue.tax_rate_basis_points` with no rule-pack table (`new-app/db/schema-objects.json`).

**Recommendation.** Cite ADR 0006 (country) and ADR 0005 (rule packs), and say "exists in the old
application and is owed in the rebuild".

## B4 · The public site still sells release-2 features in the present tense on three pages, and promises an export release 1 does not build; the PRD's §7 account of the site is out of date in both directions — severity: blocker (Rule 20)

**Where:** `docs/PRD.md` (§7, R1.40a, R1.40b; §8), `new-app/web/content/site.ts`,
`new-app/web/content/legal.ts`, `new-app/web/test/site-guards.test.ts`, `docs/PRD-REVIEW.md` (F5, F6)

**The claims under attack.** §8: release 1 "deliberately excludes … project costing and job result ·
retention tracking · … accountant CSV export", "named so nothing is 'coming soon' by accident"
(`docs/PRD.md:592-596`). §7: R1.40b's guard means "the next scope change cannot silently make the site
untrue" (`docs/PRD.md:569-571`).

**Why it does not hold.** The site copy, at this HEAD:

- Features page: "Record payments as they arrive, **hold and release retention**, and see at a glance who is
  late" (`site.ts:146`); a whole item "Did the job make money? — Put purchases and labour against the job
  as they happen and compare them with what you quoted" (`site.ts:149-150`); the page description
  "…invoicing, payments, **retention and job profit**" (`site.ts:117`).
- Home page: "See whether the job actually made money once the receipts are in." (`site.ts:102`)
- Pricing intro: "You pay when Pryvis starts helping you get paid — invoicing, payment recording **and job
  costing**" (`site.ts:165`).
- Features page footer, rendered at `app/features/page.tsx:33`: "**Coming next**, in this order: staged
  deposit and progress invoicing, a signed record of the client's acceptance, change orders…"
  (`site.ts:157`) — the first two are release 1 (R1.23, R1.20), and the pricing page lists the first as
  included. This is F6's "inverted roadmap", recorded **Open** since review 1 (`docs/PRD-REVIEW.md`
  disposition line for F6) and still true.
- Pricing footnote: "If you stop paying, your quotes and invoices stay **readable and exportable**"
  (`site.ts:232`); terms: "Your data is yours. **You can export it**" (`legal.ts:125`) and "take your data
  with you … time to export everything" (`legal.ts:152`). Release 1 has no export requirement at all, and
  excludes the only export it names (§8).

The guard R1.40b asked for exists but reads only `site.pricing.tiers`. Executed:

```
# the site as committed (with the lines above)
$ npx vitest run test/site-guards.test.ts      → Tests 11 passed (11)
# control: remove "(coming in release 2)" from the Pro line "Retention tracking"
→ × sells nothing the current release does not deliver — expected [ 'Pro: Retention tracking' ] to deeply equal []
# restored from a backup copy; diff -q identical
```

So the guard fires on the pricing list and is blind to the same claim one page over. The guard's own header
admits it bounds "the page against THIS FILE" (`site-guards.test.ts:245-250`), but the PRD's sentence
promises the site, not the tier list.

Meanwhile §7's paragraph is stale the other way: "The built site's Pro tier sells retention tracking … The
Business tier is listed with nothing marking it unavailable" (`docs/PRD.md:557-561`) is no longer true of the
pricing page (`site.ts:203-207`, `site.ts:217`), and R1.40a's "the owner chooses which" was decided — the
site's own comment records "The owner chose to mark rather than remove" (`site.ts:190`). A reader of §7
cannot tell what is still wrong.

**Recommendation.** Before approval: (1) rewrite §7's paragraph as current state — pricing marked, the
owner chose marking, the features/home/about pages and the export promise still over-claim; (2) add an
R1 requirement for **tenant data export** (at minimum: quotes, invoices, payments and clients as CSV, on
every tier and after lapse), because the terms and the pricing page already promise it — or, if the owner
will not build it, the copy must lose the word. Recommended: build it; it is small, it is what the
lapse promise rests on (B7), and a DPA access request (B8) needs it anyway. Then extend R1.40b's guard to
every string in `site` and `legal`, not only the tier lists. Fixing the copy itself is a public-copy edit
the owner approves.

## B5 · §4's hard call says it keeps the sync engine out of release 1; the requirements put most of one in, on an app platform §12 says is still undecided and "achievable either way" — it is not — severity: blocker

**Where:** `docs/PRD.md` (§4, R1.4, R1.12, R1.18-R1.18j, R1.22f-g, §8, §12), `docs/design/domain-model.md`
§8, `docs/THREAT-MODEL.md` §4a, `docs/SERVICE-REGISTER.md` §2 (Expo/EAS row)

**The claims under attack.**

> "a full offline sync engine is the single highest-risk component in the old application … Building it
> first would put the riskiest thing in front of the thing that earns money." (`docs/PRD.md:68-70`)

> §8 excludes "offline issuing and **full sync**" (`docs/PRD.md:593`); R2's column adds "**full sync**"
> (`docs/PRD.md:107`).

> §12: "The native mobile app's shape (React Native vs web-first PWA). An ADR of its own, and R1's 'mobile
> web + offline caching' scope is **deliberately achievable either way**." (`docs/PRD.md:686-687`)

**Why it does not hold.**

*(a) What release 1 actually requires offline.* Reading the R1 requirements and the domain model's sync
table they rest on:

| Release-1 requirement | What it needs on the device and at the server |
|---|---|
| R1.4 — directory "available offline, read and create" | local store of the catalog, labour, equipment, recipes, clients; queued creates; domain model §8: "Server wins on fields" |
| R1.12 — a draft "is editable, versioned, and survives the app being closed with no signal" | offline full edit of `quote` + lines; domain model §8: "**Merge by line**, with a review step when both sides changed one line" |
| R1.18, R1.18a — durable, encrypted, generic outbox for "every offline create" | the outbox, its encryption, its pending view |
| R1.18c-j — one seal per (quote, revision), refused seals kept as `rejected_seal`, re-checks at sync | server-side conflict detection and a resolution UI |
| R1.18f — wipe on next connect after remote sign-out | revocation-aware sync |
| R1.22f-g — variations recorded offline with an idempotency key | queued financial creates and replay safety |
| domain model §8 — entitlements "cached with a **grace period**" | an offline entitlement cache (not mentioned in the PRD) |

That is a local database, an outbox, per-entity conflict rules including a three-way line merge with a
review step, idempotent replay of financial rows, and a revocation path. Rule 12 defines the sync engine as
exactly this list ("A local database and a sync engine with an outbox; client-generated UUIDs …; explicit
conflict rules per entity; encrypted local storage, remote sign-out and a retention limit; sync status
visible in the UI"). What R1 defers is offline **numbering**. Nothing in the PRD, the domain model or the
roadmap says what "full sync" adds in R2 beyond that, so R2's "full sync" names no work and R1 carries the
risk §4 says it avoids. Rule 1.10 calls this a scope boundary that hides work.

*(b) The platform is load-bearing and undecided.* R1's scope is "web + mobile web" (`docs/PRD.md:107`), i.e.
a browser app, but R1.18f and `THREAT-MODEL.md` §4a require "local encryption keyed to the **device's own
keystore**" and "the app **locking behind the device's own authentication**". In my judgement (not
executed — no device here) a browser app has no direct access to the Android keystore or the device lock,
and browser storage can be evicted by the browser under storage pressure, which collides with R1.18d's
"never destroyed". A React Native app (the old application's, per the Expo/EAS row in
`docs/SERVICE-REGISTER.md` §2) can meet R1.18f. So the requirements are achievable on one platform and
probably not the other, and §12's "achievable either way" is an unverified claim about the world (Rule
1.10's fourth class).

**Recommendation.** Before approval, choose one, recorded as the owner's decision:

1. **(Recommended) Keep §4's resolution and cut R1's offline scope to the seal.** Offline in R1 = read the
   cached directory, create and edit a draft *on one device*, seal, and queue the seal. Move offline
   directory creates, offline variations (R1.22f-g) and multi-device draft merge to R2 with leases, and
   state "one device edits a draft at a time in R1; the server refuses a stale draft push" instead of a
   merge. This keeps the promise on the site ("price and capture a job offline") and removes the three-way
   merge and offline financial creates from the money release.
2. Keep the scope and say so honestly: delete "full sync" from §8 and R2, rewrite §4's paragraph to "R1
   builds the sync engine; R2 adds leases", and move "the sync engine is late" to risk 1 in §11.

Either way, decide the platform (the ADR §12 defers) **before** approval, because R1.18f and R1.18d are not
buildable as written without it. If PWA is chosen, R1.18f must be rewritten to what a browser can do.

## B6 · Pro is sold to "a one-crew outfit" of three or four people with one login, so the audit trail R1.24d leans on cannot say who did anything, and four requirements are written for colleagues who cannot exist in release 1 — severity: major

**Where:** `docs/PRD.md` (§2, §7, R1.18c, R1.18e, R1.18h, R1.22d, R1.24d), `docs/TIERS.md` §2,
`new-app/web/content/site.ts`, `new-app/web/content/legal.ts`, `docs/design/domain-model.md` §8

**The claims under attack.**

> §2: Pro is for "Delroy plus two or three people, getting paid late, chasing deposits"
> (`docs/PRD.md:36`). §7: Users — Free **1**, Pro **1** (`docs/PRD.md:550`; `docs/TIERS.md:51`).

> R1.24d: R1.24 does not stop a contractor raising their own ceiling; "it is the client's own acceptance,
> plus **the audit trail naming who recorded the variation and when**, that answers the second"
> (`docs/PRD.md:385-390`; also R1.22d, `docs/PRD.md:371`).

**Why it does not hold.**

1. **The persona and the seat count disagree.** A one-crew outfit with one seat shares one credential among
   the three or four people the persona describes. The site's Pro card says "A working contractor or a
   one-crew outfit" (`site.ts:185`) and the terms already say "You are responsible for what **the people you
   invite** do in it" (`legal.ts:123`) — there is no invitation in release 1.
2. **The control R1.24d names becomes empty.** With one login per tenant, `variation.recorded_by_user_id`
   and every `audit_entry.actor_user_id` (columns in `new-app/db/schema-objects.json`) name the account,
   not the person. "Who recorded the extra $40,000" (domain model §6.2) has the answer "the business" — the
   party the client is in dispute with. R1.24d's honest-weakness argument rests on attribution release 1
   cannot provide for the persona it is sold to.
3. **Requirements written for a second person.** R1.18c ("told **a colleague** sealed this job"), R1.18h
   ("**Your colleague's** version got there first"), R1.18e ("still an active member **whose role still
   permits sealing**") and the domain model's "Delroy's phone and **his foreman's tablet**" (§8). In
   release 1 the only race is one person on two devices, and there are no roles (§8 puts roles in the
   Business tier, release 3). A builder reading R1.18e must implement a role check against a role model
   that does not exist yet, or skip it; either way the requirement as written is untestable in R1.

**Recommendation.** An owner decision, before approval:

1. **(Recommended) Pro gets a small fixed seat count in R1 — say 3 — with no roles** (every member may do
   everything; the owner is the only one who can manage members). This matches the persona, makes R1.24d's
   attribution real, and keeps roles and approvals as Business's line. Cost: invitations, membership and
   per-member sessions, which the schema's `app_user` already supports (several users per tenant, ADR
   0022).
2. Keep Pro at one seat and change the persona to "a solo contractor", R1.24d to say attribution is to the
   account, and the terms to drop "the people you invite".

Either way, rewrite R1.18c/e/h in device terms ("another of your devices") unless option 1 is chosen, and
make R1.18e's role clause conditional on roles existing.

## B7 · W9 cannot take a card payment, has no billing period, and never says what happens when a Pro tenant stops paying — the release whose goal is "we can charge for it" defines only the manual path — severity: blocker

**Where:** `docs/PRD.md` (§4 R1 goal, W9 R1.30-R1.37, §10), `docs/TIERS.md` §2a, `docs/RULES.md` Rule 14,
`docs/design/domain-model.md` §7 (`subscription`), `new-app/web/content/site.ts`,
`new-app/web/content/legal.ts`

**The claims under attack.** R1's goal: "A solo contractor can run a whole job through the product **and
we can charge for it**" (`docs/PRD.md:106`). §3 step 8: "Pay us, sometimes by bank deposit and an uploaded
receipt" — *sometimes*, so the usual path is something else (`docs/PRD.md:58`).

**Why it does not hold.** W9's requirements (`docs/PRD.md:435-508`) are sign-up, the entitlement resolver,
the free meter, and the manual bank-deposit flow with separation of duties. Nothing else:

```
$ grep -n -i "card\|renew\|lapse\|downgrad\|cancel\|billing" docs/PRD.md
433:- **R1.29** WiPay card payment links (Pro).          ← the tenant's CLIENTS paying the tenant
436:- **R1.30** Self-service sign-up on the website, free tier, no card (ADR 0015).
(other hits are "billing" in unrelated senses)
```

Missing, each one a decision a builder would have to make up:

1. **Upgrading by card.** Rule 14: "Upgrading is **self-service when paid by card**, and entitlements change
   when the payment succeeds"; `TIERS.md` §2a says the same. No R1 requirement builds it, so in R1 every
   upgrade is a bank deposit approved by two staff (R1.34) — the slowest path, for the one conversion §10
   measures ("Free → Pro conversion ≥ 10%").
2. **The billing period and renewal.** The domain model's `subscription` has "a period and a state"
   (§7); the terms promise "Paid tiers are billed **for the term you choose**" (`legal.ts:132`). The PRD
   never names a term (monthly? yearly?), what renews it, or what a manual-payment tenant does each period.
3. **Lapse and downgrade.** `TIERS.md:111-114`: what a lapsed tenant "may still do on Free — read their old
   invoices, export their data — is a product decision **owed with feature 1**". The terms and pricing page
   have already promised an answer ("paid features stop and your data stays intact and readable",
   `legal.ts:132`; "readable and exportable", `site.ts:232`). Unanswered: a lapsed tenant with twelve recipes
   (Free creates one — can they still *use* the other eleven?); issued invoices with balances (can they
   record a payment that arrives next week? R1.26 is a Pro feature); scheduled reminders (R1.28) and open
   WiPay links (R1.29) — do they keep firing on a tenant who no longer pays for them?; and the month's meter
   if they lapse mid-month.

**Recommendation.** Before approval, add to W9: (a) card upgrade through WiPay with entitlements changing
on a verified callback (Rule 14) — or an explicit owner decision that R1 is manual-only, with §10's
conversion target lowered to match; (b) the billing term(s) and a renewal rule for each payment path; (c) a
lapse requirement. Recommended for (c), as the owner's call: on lapse, **everything already created stays
readable and usable for collecting money already invoiced** (record payments, let open links be paid),
nothing new that is Pro can be created, reminders stop, and export always works. Collecting money a client
already owes is not a Pro feature worth withholding, and withholding it is the "locked out of their own
history" outcome `TIERS.md` §2a warns of.

## B8 · The PRD never mentions the Data Protection Act, 2020; the threat model defers the analysis to "before the second country", and the service register asserts the cross-border transfer is "lawful" with no analysis behind it — severity: major

**Where:** `docs/PRD.md` (whole; §9; R1.3; R1.18j; R1.20; N7), `docs/THREAT-MODEL.md` §6,
`docs/SERVICE-REGISTER.md` §6, `docs/DEVELOPMENT-BRIEF.md` §8, `new-app/web/content/legal.ts`,
`docs/adr/0020-audit-log-and-retention.md`

**The claim under attack.** §9: "R1 cannot launch without these, and none of them are engineering"
(`docs/PRD.md:628`) — a list that omits data protection entirely.

**Why it does not hold — the evidence in the repository.**

```
$ grep -n -i "data protection\|DPA\|commissioner\|erasure\|subject access\|breach" docs/PRD.md
(no output)
```

- `docs/THREAT-MODEL.md:316-318`: "Regulatory analysis. Jamaica's Data Protection Act … This model notes that
  data leaves the country; it is not legal advice, and **a compliance review is owed before the second
  country**." Jamaica is the *first* country; release 1 launches under its Act.
- `docs/SERVICE-REGISTER.md` §6 item 5: "Personal data leaves Jamaica. Neon, Resend and Vercel all process
  tenant and customer data outside the country. **That is normal and lawful**" — a legal conclusion with no
  source, which the threat model says nobody has reached.
- `docs/DEVELOPMENT-BRIEF.md:191`: "review applicable regimes **early** (… Jamaica's Data Protection Act …)
  … Confirm with a qualified legal adviser."
- The product already makes data-subject promises the PRD builds nothing for: the draft privacy notice says
  a person can "ask what we hold about you, ask for a copy, ask for a correction, or ask for deletion"
  (`legal.ts`, "Your choices") and "If data is exposed, we will tell the people affected".
- And the PRD makes several records permanent by design: a client "can never vanish" from the book (R1.3),
  a `rejected_seal` "cannot be deleted at all" (R1.18j), the audit trail is kept seven years and "cannot be
  edited or deleted" (ADR 0020 decision 5), and each acceptance stores the client's IP and user agent
  (R1.20; `acceptance.actor_ip`, `acceptance.user_agent` in `new-app/db/schema-objects.json`). Whether
  that is compatible with an erasure request from a tenant's client is a question nobody has asked.

**What the Act may require (my understanding, NOT verified here — the owner's attorney must confirm):**
registration of controllers with the Information Commissioner; notification of a security breach to the
Commissioner within a fixed short period; data-subject access, rectification and objection rights with
statutory response times; a standard on transfers outside Jamaica; and, for Pryvis as the **processor** of
the tenants' client data, written processing terms with each tenant (who is the controller). None of these
is in the PRD, and the terms draft has no processing clause.

**Recommendation.** Before approval: add to §9 an item "**Data Protection Act, 2020 review by the owner's
attorney** — controller/processor roles, registration, breach notification, cross-border transfer basis,
retention of the permanent records above" in the same conversation as items 3 and 4 (one attorney visit);
and add R1 requirements for (a) a data-subject request path that staff can execute — export (B4) and a
redaction of a client's personal fields that leaves the financial record intact; (b) a written breach
response with the Commissioner notification step (Rule 5 already requires the plan). Amend the threat
model's "before the second country" and strike "and lawful" from the register until the attorney has
answered.

## B9 · R1.29's card links do not say whose merchant account the client's money lands in; the only design on record routes every tenant's client payments into one platform account, with no payout, refund or over-payment rule — severity: blocker (for R1.29)

**Where:** `docs/PRD.md` (R1.20d, R1.26, R1.29, §9 item 1b), `docs/SERVICE-REGISTER.md` §2 (WiPay),
`docs/design/acceptance-evidence.md` §4.2 (grade 6), `original-app/apps/api/src/payments/wipay.service.ts`

**The claims under attack.**

> R1.29: "WiPay card payment links (Pro)." — the whole requirement (`docs/PRD.md:433`).

> §9 1b: "**An** approved WiPay merchant account. R1.29 depends on it … onboarding is KYC **on the owner's
> business**" (`docs/PRD.md:635-637`).

**Why it does not hold.** R1.29's links are for a tenant's *client* paying the *tenant's* invoice. §9 1b
makes that depend on one merchant account, KYC'd to the owner's business — so the client's money for a
contractor's fence is paid to Pryvis. The only built precedent does exactly that: the old application's
WiPay integration reads a single `WIPAY_ACCOUNT_NUMBER` from configuration
(`original-app/apps/api/src/payments/wipay.service.ts:38`) and creates every invoice's payment request
against it. The PRD then has no requirement for any of what holding other people's money entails: paying
it out to the contractor, when, net of which fees, refunds and chargebacks, or reconciliation against
WiPay's settlement. The alternative — each Pro tenant with its own WiPay merchant account — puts a KYC
onboarding with a lead time "we do not control" (§9's own words) in front of every Pro tenant, and needs
per-tenant WiPay credentials stored as secrets, which the register's secrets table (§5) does not
contemplate. Either way R1.29 cannot be built from one line. Whether collecting and remitting contractors'
client payments is a regulated activity in Jamaica is an attorney's question (not verified here).

**A concrete stuck state in the money rules, even with the account question answered.** R1.26 says a
recorded payment is "Never more than the balance". Sequence: invoice J$100,000 issued; payment link sent
for J$100,000; the contractor issues a J$20,000 credit note (R1.27); the client, who opened the link
yesterday, pays J$100,000 by card. WiPay has taken J$100,000; the product must refuse to record more than
J$80,000. There is no requirement for an over-payment, a credit balance or a refund, so the money that
arrived cannot be recorded as it happened — and a grade-6 deposit (R1.20d, the strongest evidence in R1)
arrives through this same path. The same happens with a client who simply over-pays by bank transfer.

**Recommendation.** An owner decision before W7 is built: (1) **(Recommended) per-tenant merchant
accounts** — the client pays the contractor directly; Pryvis only creates the link and verifies the
callback; R1.29 becomes "available once the tenant connects their own WiPay account", and §9 1b is
rewritten as a per-tenant dependency. This keeps Pryvis out of holding client funds. (2) A platform
account with payouts — then R1 needs payout, fee, refund and reconciliation requirements and an attorney's
view first. Separately, amend R1.26: a payment is recorded as it actually happened; an amount above the
balance is recorded and shown as an over-payment the tenant resolves (refund or credit), never refused.

## B10 · GCT is one line in the PRD (R1.9) and is undesigned for the document that actually carries tax liability — the invoice; the built `invoice` row has no tax at all — severity: blocker (for W7 and R1.9)

**Where:** `docs/PRD.md` (R1.9, R1.13, R1.23-R1.27), `docs/design/domain-model.md` §6.2a,
`new-app/db/migrations/20260925120000_documents_core/migration.sql`, `new-app/db/schema-objects.json`,
`new-app/web/content/site.ts`

**The claim under attack.**

> R1.9: "Per-line GCT treatment, markup and discount, **with the tenant's GCT registration respected**."
> (`docs/PRD.md:169`) — the PRD's entire statement of tax.

**Why it does not hold.**

- The domain model says tax is not designed: "**Tax is the step not held**: `tax_minor` against the rate and
  each line's treatment is **owed as its own item with the GCT rules**" (`docs/design/domain-model.md`
  §6.2a, "Where that total comes from"). No design for it exists in `docs/design/` (12 files listed by the
  brief's expectation; none is about tax).
- The schema has a tax rate and a tax total on the *quote issue* (`tax_rate_basis_points`, `tax_minor`,
  `migration.sql:181-197`) and a per-line treatment (`'standard','zero','exempt'`, `:219-224`). The
  `invoice` row — the document a GCT-registered contractor accounts for — is `amount_minor, currency,
  due_on, kind, issued_at, issue_id` with **no tax split** (`schema-objects.json`), and `invoice_line`
  (domain model §6.2) is not built. `credit_note` likewise has only `amount_minor`.
- `tenant` has no field for a GCT registration or TRN (`schema-objects.json`), so "registration respected"
  has nowhere to be read from.

What a builder cannot answer from the PRD:

1. **What a deposit or progress invoice says about GCT.** R1.23 bills a share of an accepted issue. Is
   the GCT on a 40% deposit 40% of the issue's `tax_minor`, or recomputed per invoice from line shares?
   With mixed standard/exempt lines and rounding at the cent, those differ, and the final invoice must
   absorb the remainder so the sum of invoices' tax equals the issue's.
2. **What "registration respected" means.** A tenant not registered for GCT must not charge it; does that
   force every line to `exempt`, hide the tax line, or refuse a `standard` line? What if registration
   changes between seal and invoice?
3. **What a tax invoice must carry.** My understanding (to be confirmed by the owner's accountant, not
   verified here) is that a GCT-registered supplier's invoice must show the supplier's TRN/GCT registration
   number and the GCT amount separately. Nothing in the PRD requires either.
4. **Rate changes.** The issue freezes its rate; the ceiling is the tax-*inclusive* `total_minor`
   (`total_minor = subtotal_minor + tax_minor`). If the statutory rate changes after acceptance and the
   invoice must use the rate in force when it is issued (accountant to confirm), a final invoice can exceed
   the frozen tax-inclusive ceiling and R1.24 will refuse it — with no remedy except a "variation" that is
   really a tax change.
5. **What a credit note does to GCT** (R1.27): does it reverse tax proportionally?

The public site already promises "GCT handled per line … a document records the rate it was issued under"
(`site.ts:133-134`).

**Recommendation.** Before W3/W7 are built (not necessarily before approval of the rest): an owner-approved
**GCT design** answering 1-5, reviewed by the owner's accountant for 3 and 4, and R1.9 rewritten to cite
it. Add the accountant's review to §9. Recommended answer for 4: decide whether the ceiling is
tax-exclusive (`subtotal + variations`) with tax computed per invoice — that removes the rate-change
trap — but it is a change to the most important invariant, so it is the owner's call with the accountant.

## B11 · §10's measures would not tell the owner the bet failed: one mixes tiers that cannot invoice into its denominator, two have no window or population, and the one question §4 says release 1 will answer has no signal at all — severity: major

**Where:** `docs/PRD.md` (§4, §10, R1.42, §11)

**The claims under attack.** §10: "Measured, not felt" (`docs/PRD.md:654`). §4: offline issuing is "worth
buying only if contractors actually hit the wall — **which R1 will tell us**" (`docs/PRD.md:98-100`).
R1.42 lists the six instrumented signals (`docs/PRD.md:575-578`).

**Why it does not hold.**

1. **"Accepted quotes that become an invoice ≥ 70%"** (`docs/PRD.md:661`). Invoicing is Pro only (§7,
   `docs/PRD.md:547`). A Free tenant's accepted quote *cannot* become an invoice, and the product's
   distribution model makes Free the majority. As written (R1.42: "accepted issues that become an
   invoice", no tier), the figure measures the tier mix, not "whether W7 is where they actually work". With
   Free tenants at, say, 80% of accepted quotes, the target is unreachable even if every Pro tenant
   invoices everything.
2. **"≥ 30% of active tenants by month two"** — "active" is undefined, and so is whether Pro tenants (who
   cannot hit the limit) are in the denominator. **"Free → Pro ≥ 10% of tenants who hit the free limit"** —
   no window (within a month? ever?), and in R1 the only way to convert is the two-person manual bank
   deposit (B7), so a low figure cannot be told apart from friction.
3. **Nothing measures offline use.** §4 defers offline numbering until "contractors actually hit the wall
   — which R1 will tell us", and the domain model §11 says leases are "unearned" if offline issuing proves
   rare. None of the six R1.42 signals counts seals made offline, time from seal to number, or deliveries
   delayed by "awaiting number". The R2 decision §4 promises to make from evidence has no evidence.
4. **No failure signal for the client-facing step.** H17 found the likely failure of the default bar is "an
   abandoned acceptance that looks to the contractor like the client ignoring the quote" (ADR 0026,
   Context). Nothing measures share-link opens against acceptances, or codes requested against codes
   entered.
5. **"Manual payments approved by a second person: 100%, or a recorded exception"** is guaranteed by
   construction (R1.34-R1.35 make the alternative impossible), so it can only ever read 100%. It is a
   control check, not a measure of whether the product worked.
6. **"First issued quote within 30 minutes … without support"** (`docs/PRD.md:658`) — §4 split issuing into seal, number and deliver, and this row does not say which one ends the clock; nor can a query over rows (R1.42) know whether the tenant had "support" (an email to `info@` leaves no row).
7. **No floor on numbers.** Percentages over a launch cohort of tens of tenants swing by a whole target
   with one tenant. A target with no minimum sample is not a test of the bet.

**Recommendation** (judgement). Before approval: restrict the invoice signal to Pro tenants; define
"active" (e.g. numbered at least one job in the month) and the conversion window (e.g. within 30 days of
first hitting the limit); add three R1.42 signals — offline use (seals made offline and their
seal-to-number delay), link-opened versus accepted, code-sent versus code-entered; replace the 100% row
with the count of single-operator exceptions (the thing that can actually move); and state a minimum
cohort below which §10 is read as qualitative.

## B12 · Three of the documents the PRD must agree with are the old application's plan, unmarked, and give different answers on the free quota, the prices, the build order and where prices come from — severity: major

**Where:** `docs/ROADMAP.md`, `docs/MILESTONES.md`, `docs/PRICING.md`, `docs/ARCHITECTURE.md`,
`docs/PRD.md` (§4, §7, R1.32, R1.41, §8)

**The claim under attack.** The PRD's status line: it is "part of the plan of record and is kept true"
(`docs/PRD.md:11-12`, Rule 19). The brief lists `ROADMAP.md` and `MILESTONES.md` among the documents it
must agree with.

**Why it does not hold.** Neither the PRD nor these files say they are superseded, and they disagree with
it:

| Question | `docs/PRD.md` | The other document |
|---|---|---|
| Free quota | "3 distinct jobs *numbered* per calendar month" (R1.32) | "subscription tiers (free = **5 quotes/mo**, Pro …)" (`ROADMAP.md:25`) |
| Are prices set? | "the **prices** are not set" (§7, `docs/PRD.md:552`) | "Pro **JMD 2,000/mo · 20,000/yr** with admin-editable pricing" (`ROADMAP.md:25`) |
| What is built next | the sync engine is deferred as the riskiest thing (§4) | "RESUME HERE → next locked item is **mobile M3 (offline-first)**" (`ROADMAP.md:13`); "LOCKED build order … 6. M3 — mobile offline-first (local replica + outbox + sync engine) ← NEXT" |
| Where material prices come from | tenants' own prices; the aggregate index is built from `price_observation` **with consent** (R1.41), and the index is excluded from R1 (§8) | "JamQuote maintains its own price index fed from … **web scrapers** … First target: H&L True Value" (`PRICING.md:1-11`) |
| Build sequence authority | the PRD and `BRIEF-STATUS.md` | `ARCHITECTURE.md:83`: "Build order: **`docs/MILESTONES.md`**", and `ARCHITECTURE.md:3`: "This is the contract every build agent follows" |

`ROADMAP.md` calls itself the "Single source of truth for picking work back up" (line 3). A builder
following Rule 0 who reads these first will build the wrong thing. This is Rule 1.9 ("never left stale")
and the brief's "two documents with two answers is a finding, whichever is right".

Two smaller observations from the same files, recorded because they bear on the owner's decisions:
`ROADMAP.md` records "Subscription billing: manual (admin flips to Pro) until Phase-2 WiPay" and lists the
WiPay merchant account as what "unblocks Phase-2 **automated subscription billing**" — which is the card
upgrade path B7 finds missing from W9, and a different use of the same account than §9 1b gives it (B9).
And `ROADMAP.md` names a real individual's email address as the sole administrator; not repeated here.

**Recommendation.** Before approval: mark `ROADMAP.md`, `MILESTONES.md`, `PRICING.md` and `ARCHITECTURE.md`
at the top as "describes `original-app/`, superseded for the rebuild by `docs/PRD.md` and
`docs/BRIEF-STATUS.md`" (or move them under a history folder), and have the PRD's header name the documents
it supersedes. Whether supplier-price scraping has any place in the plan is an owner decision; R1.41 and §8
currently imply it does not.

## B13 · R1.21a's statically served share page cannot also be the revocable, expiring, hashed-at-rest credential R1.19 requires without the API it is designed to avoid — and it makes Vercel hold client documents the register says it never stores — severity: major

**Where:** `docs/PRD.md` (R1.19, R1.21a, N9), `docs/THREAT-MODEL.md` §4a (pre-rendered share page row),
`docs/SERVICE-REGISTER.md` §1 (Vercel row), `new-app/web/content/legal.ts` (processors),
`docs/adr/0026-api-always-on-at-launch.md`

**The claims under attack.**

> R1.19: "A share link is a **credential**: high-entropy token, **hashed at rest**, scoped to one issue,
> **expiring, revocable**." (`docs/PRD.md:275-276`)

> R1.21a: "the page is **served statically or from cache with the document rendered ahead of time**, and
> only *accepting* touches the API" (`docs/PRD.md:337-339`).

**Why they do not hold together.** A static or cached page is found by its URL, and the URL carries the
token. So:

- **Hashed at rest** protects the database copy only; the host serving the pre-rendered page holds a
  document retrievable by the raw URL, which is the credential in usable form.
- **Expiring and revocable** must then be enforced by the host, which cannot ask the database (the
  premise is that the API may be asleep). Either every page view checks with the API — and it is not
  static — or expiry and revocation are a cache purge that some job must perform on time. The threat model
  already saw this ("revocation has to invalidate the cached copy, which is a requirement on whatever serves
  it", `THREAT-MODEL.md` §4a) but no R1 requirement says what does it or how fast, and a link's expiry is
  silently "whenever the purge runs".
- **Vercel becomes a holder of client documents.** The register's Vercel row says "Holds personal data: In
  transit only; **nothing stored**" (`SERVICE-REGISTER.md` §1), and the privacy notice says Vercel "serves
  this website and the app interface" (`legal.ts`). A pre-rendered quote — client name, address, prices —
  stored at the edge falsifies both (Rule 18).

And the reason for R1.21a has changed: ADR 0026 makes the API **paid and always on at launch**. Static
rendering now protects only the pre-launch prototype, at the cost of a second serving path for the one
client-facing document.

**Recommendation** (judgement). Before W5 is built: amend R1.21a so that **at launch** the share page is
served by the API (always on, ADR 0026) and checks expiry and revocation on every view; keep the
pre-launch "wake the API when the page opens" behaviour with a plain "connecting" state, and drop the
pre-rendered document. If the owner wants pre-rendering kept, R1.21a must add: where the rendered page is
stored, how revocation and expiry purge it and within what time, and a register row for the store.

## B14 · Three places still say variations are release 2 or excluded, while W6a puts recorded variations in release 1 — severity: minor

**Where:** `docs/PRD.md` (§3 table, §4 release table, §8, W6a)

**The claims under attack.** §3: "5 · The client wants a change … · **W6 Variations** · **R2**"
(`docs/PRD.md:55`). §4's table: R2 "In: **W6 variations** · …" and R1 "Out: Anything in R2/R3"
(`docs/PRD.md:107-108`). §8, "what release 1 deliberately excludes … **variations and change orders**",
introduced as "Named so nothing is 'coming soon' by accident" (`docs/PRD.md:592`).

**Why it does not hold.** W6a, "Variations, minimal — added by review (F3)", puts recorded, priced
variations in release 1 (R1.22a-g, `docs/PRD.md:344-372`), the schema has the `variation` table and its
ceiling trigger, and R1.24 depends on them. A reader of §3, §4 or §8 is told the opposite. F3 was closed by
adding W6a; these three sentences were not amended with it.

**Recommendation.** §3 row 5: "W6a recorded variations · R1; W6 client-signed change orders · R2". §4:
add W6a to R1's "In" and rename R2's item "W6 signed change orders". §8: "client-**signed** variations and
change orders". While there, the requirement order has drifted enough to mislead a reader scanning for a
number: R1.21a sits after R1.22; R1.18 runs a, c, g, h, i, j, d, e, b, f; R1.42 precedes R1.41; R1.40a-b
sit under §7. Renumbering would break citations (Rule 23.1 applies by analogy), so a one-line index of
R-numbers to sections at the top of §5 is the cheaper fix.

## B15 · Release 1 needs a staff console — payment approval, activation, support, suspension — and the PRD specifies none of it: no capability list, no impersonation decision, no screens' worth of requirements — severity: major

**Where:** `docs/PRD.md` (§2 staff row, R1.18e, R1.33-R1.38, R1.40, N6, §9 item 5), `docs/RULES.md` 5.1,
`docs/design/staff-mfa.md`, `docs/design/privilege-model.md`, `docs/adr/0007-subscription-tiers-and-entitlements.md`,
`docs/BRIEF-STATUS.md` (§19 open questions), `docs/TIERS.md` §2

**The claim under attack.** §2: Pryvis staff need "Support, manual payment approval, activation. … Least
privilege, MFA, and an audit trail that answers 'who did that to my account'" (`docs/PRD.md:39`).

**Why it does not hold.** Release 1 cannot run without staff acting through some interface:

- approving and activating manual payments with bank-statement verification and the single-operator
  exception (R1.33-R1.37);
- answering support threads with "capability-gated and audited" access (R1.38);
- suspending a tenant, which R1.18e re-checks at sync;
- the explicit, audited entitlement **grants** ADR 0007 decision 5 makes the grandfathering mechanism,
  "visible in the admin console";
- and, for any support case, reading a tenant's data — which Rule 5.1 makes "requested, time-limited,
  logged, and reviewed", with impersonation "exceptional, visible and bounded".

Every design that touches it defers the console: "**Out, and owed:** … the admin console and any UI"
(`docs/design/staff-mfa.md:179`); `platform_capability` is granted "(staff console, not built)"
(`docs/design/privilege-model.md:43`). The PRD has no requirement naming the capabilities, which of
them R1 needs, whether impersonation exists in R1 at all, how staff accounts relate to tenants under ADR
0022's one-tenant-per-user rule, or the platform audit trail for tenant-less staff actions (owed since ADR
0020, `docs/BRIEF-STATUS.md` item 5). `BRIEF-STATUS.md`'s open questions still read "Support model, buy or
build ❌" and "Payment approval staffing at launch ❌ … the actual headcount is unanswered", while R1.38
assumes "build" and `TIERS.md` §2 says support is "email" on Free and Pro.

**Recommendation.** Before approval, add a short W10 "Staff operations" with: the R1 capability list
(recommended minimum: `approve_payment`, `activate_subscription`, `answer_support`, `suspend_tenant`,
`grant_entitlement`, `grant_capability`); **no impersonation in R1** (recommended — support reads through
a time-limited, tenant-visible, audited grant instead, which Rule 5.1 already describes, and impersonation
waits for WebAuthn per `staff-mfa.md`); and the platform audit trail as an R1 requirement. The owner must
answer the two open questions: support by in-app thread (R1.38) or by email (TIERS) — recommended: email
in R1, threads later, which removes a whole feature from R1 — and who the second staff member is (§9 item
5).

## B16 · Delivery is under-specified for the two channels release 1 uses: "delivery happens at sync" cannot be true of WhatsApp click-to-chat, and nothing tells the contractor a quote or reminder email bounced — severity: major

**Where:** `docs/PRD.md` (§4 acts table, R1.18, R1.20b, R1.21, R1.28, §9 item 1a), `docs/RULES.md` Rule 11,
`docs/design/domain-model.md` §7 (`outbound_message`), `docs/SERVICE-REGISTER.md` §2 (Resend)

**The claims under attack.**

> R1.18: "**Numbering and delivery happen at sync.**" (`docs/PRD.md:224`); §4: Deliver = "Render the PDF,
> mint the share link, **send it**" (`docs/PRD.md:82`).

> §9 1a: "unauthenticated mail lands in spam and **fails silently**, which is worse than failing loudly"
> (`docs/PRD.md:632-634`).

**Why it does not hold.**

1. **Is a sealed quote sent automatically when the phone reconnects?** R1.18 reads as yes. For email that is
   a product decision with a cost (a quote sealed on Sunday arrives in the client's inbox whenever the
   phone next finds signal, after the contractor may have changed his mind — the same "commitment the
   product should not make on their behalf" that R1.32b uses to refuse automatic numbering). For WhatsApp
   it is impossible: click-to-chat (R1.21) is a link the contractor taps on his own phone; the server
   cannot send it. The PRD does not say which happens, per channel.
2. **No delivery outcome reaches the contractor.** Rule 11: "Delivery status is recorded; sends are
   idempotent and retried; **consent, opt-out** and per-country rules are respected; **message costs are
   modelled in entitlements**". The domain model's `outbound_message` has a status, but no R1 requirement
   says a bounced quote, a bounced verification code (R1.20b — the default bar's only channel) or a bounced
   reminder is shown to the tenant. §9 1a's "fails silently" is then true after the domain is verified
   too, for every mistyped address.
3. **Reminders to clients have no opt-out or consent rule** (R1.28), though Rule 11 requires one and the
   reminders go to the tenant's clients, who never agreed to anything with us.
4. **Message cost is unbounded per tier.** Free tenants send unlimited share emails and codes through
   Resend, whose row is "Free tier, then per-message" (`SERVICE-REGISTER.md` §2). R1.30d's "cost ceiling"
   argument covers numbered jobs, not messages.

**Recommendation.** Before W4/W5 are built: state per channel what "delivery at sync" does — recommended:
**nothing is sent automatically**; at sync the issue is numbered and becomes "ready to send", and the
contractor taps send (email) or share (WhatsApp); add an R1 requirement that the issue and the invoice
show the last delivery outcome, including bounces, and that a bounced verification code says so on the
client's page; add an opt-out link to client reminders; and put a per-tier daily message cap in the
entitlements (Rule 14 data, not code).

## B17 · Release 1 has no accessibility requirement for the app or the client's share page; the only one, N4's "legible in sunlight, one-handed", has no threshold — severity: minor

**Where:** `docs/PRD.md` (N4, R1.22, R1.21a), `docs/RULES.md` Rule 20, `new-app/web/app/layout.tsx`

**The claim under attack.** N4: "Works on a mid-range Android phone, on mobile data, legible in sunlight,
one-handed" (`docs/PRD.md:529`), and R1.22: "The shared page works on a cheap phone on mobile data".

**Why it does not hold.** No requirement names a standard (e.g. WCAG 2.2 AA), a minimum text size, touch
target size, support for the phone's font-size setting, or screen-reader labels — for the contractor's app
or for the client's share page, which is the one surface a member of the public must complete (a code,
a name, a consent tick) to accept. Rule 20 asks for "accessible" on the site and the site has a skip link
(`site.chrome.skipToContent`), but the PRD carries nothing into the product. N4's contrast instrument does
not exist (B1), "one-handed" has no definition a test could check, and "legible in sunlight" is by its own
admission a person's judgement. As written, N4 cannot fail.

**Recommendation.** Add an N-row: WCAG 2.2 AA for the share page and the accept flow, checked by an
automated accessibility scan in CI plus a manual pass per release; for the app, minimum touch target and
text-scale support as testable values. Recommended scope for R1: the share page fully, the app's sealing
path at least.

## B18 · The default acceptance bar (grade 3, an emailed code) is unreachable for a WhatsApp-only client in release 1, so for the client the product is designed around every acceptance will read "below your standard" — severity: major

**Where:** `docs/PRD.md` (R1.20, R1.20b, R1.20e, R1.21), `docs/design/acceptance-evidence.md` (§1, §3 goal 1,
§4.2 table, §9 decision 1), `docs/SERVICE-REGISTER.md` §2

**The claims under attack.** R1.20: "**The default bar is grade 3**: a one-time code to a stored or typed
channel" (`docs/PRD.md:279`). R1.20b: "Release 1 verifies by **email**" (`docs/PRD.md:315`). The design's
goal 1: "A client with **only** WhatsApp, or **only** email, can accept" (`acceptance-evidence.md` §3).

**Why it does not hold as a product.** The design's own table marks grade 3 "Available in R1? Yes, **by
email**" (§4.2). SMS is "absent from the register" (R1.20b) and WhatsApp Business sending is release 3. So a
client reachable only on WhatsApp — the owner's own premise is that clients "will have either or both
WhatsApp and email" (§1), and the register calls click-to-chat "how Jamaican contractors already work" —
can reach grade 2 (tapped a link) or grade 6 (paid a deposit), never the default bar. The bar does not
gate invoicing (R1.20f, J8), so nothing breaks; what happens instead is that the product marks these
acceptances as not meeting the tenant's standard (`acceptance_meets_bar()`), job after job, for the
commonest client, and teaches the contractor to ignore the indicator or lower the default to 2 — at which
point the e-signature work that moved into R1 (§8a item 4) buys nothing for those jobs. Goal 1 is met in
the letter (they *can* accept) and not in the sense §8a item 4 relied on.

ADR 0024 §6 saw the cost and did not carry it into the PRD: "SMS … is the channel **most Jamaican clients would prefer**", and "If a client has no email, the fallback is §3's signed copy" — which J5 has since graded 1.

No earlier finding covers this: H9 fixed the *existence* of a channel, not whether the default bar is
reachable through it.

**Recommendation.** An owner decision, with options: (1) **(Recommended)** make the bar default
*channel-aware*: grade 3 where the client has an email, grade 2 where they have only WhatsApp, with the
deposit suggestion (R1.20g) doing the work above the tenant's threshold — honest, and no new vendor;
(2) buy SMS for codes in R1 (a new paid sub-processor, a register row, a privacy-notice line); (3) accept
it and state in R1.20 that WhatsApp-only clients cannot meet the default bar in R1.

## B19 · §11's risks have no owner and no trigger, one is already decided, one is not a release-1 risk, and the risks most likely to stop the launch are absent — severity: major

**Where:** `docs/PRD.md` (§11, §9), `docs/adr/0024-acceptance-evidence.md`,
`docs/adr/0026-api-always-on-at-launch.md`, `docs/BRIEF-STATUS.md` (§19 open questions)

**The claim under attack.** "§11. Risks, ranked" (`docs/PRD.md:665-678`) — five items.

**Why it does not hold.**

- **No owner, no trigger** on any of the five. "Three jobs a month is a guess" (risk 2) has no date or
  figure at which it is revisited; "Nobody pays" (risk 3) has no threshold.
- **Risk 4 is decided.** "Rule 10's trigger for paid infrastructure **should** fire before the first paying
  tenant" (`docs/PRD.md:675-676`) — ADR 0026 decided it on 2026-10-01: paid and always on **at launch**.
  It is now a cost line, not a risk.
- **Risk 5 is release 2's.** "Number allocation under offline issuing. Deferred to R2" — by its own text it
  cannot occur in R1.
- **Missing, each with evidence it is live:**
  1. *The attorney's answer on e-signatures.* ADR 0024 and the acceptance design state the legal
     sufficiency is "the attorney's answer" and outstanding (`acceptance-evidence.md` §8). If the answer is
     "not sufficient", W5's design changes — ADR 0023 decision 4 itself says that is "a design change, not a
     copy change, so it is better known before W5 is built than after".
  2. *WiPay* — onboarding lead time is outside our control (§9 1b) and the money model is undecided (B9).
  3. *Data protection* — no analysis exists for the first country (B8).
  4. *Staffing* — R1.34 requires two staff for every manual activation, and `BRIEF-STATUS.md` records
     "Payment approval staffing at launch ❌ … the actual headcount is unanswered".
  5. *The sync engine* — §4's own highest-risk component, which R1 builds most of (B5).
  6. *Plan churn* — four review rounds found 19, 17, 20 and 16 findings, "and in each round most blockers
     were created by the amendments that closed the previous one" (the brief for this review). A plan that
     changes this much per round is itself a schedule risk, with a cost the owner should see.

**Recommendation.** Before approval: re-rank §11 with an owner and a trigger on each (recommended order:
attorney answer, WiPay model and onboarding, sync scope, data protection, staffing, free-tier limit,
nobody pays), delete risk 5 (or move it to R2's section) and turn risk 4 into a §9 cost dependency.

## B20 · R1.14 requires a reset rule and "a number is never reused"; the built schema accepts `reset_rule = 'yearly'` and then refuses the first reset — executed — severity: major

**Where:** `docs/PRD.md` (R1.14), `new-app/db/migrations/20260925120000_documents_core/migration.sql`
(lines 70-79, 244-258), `docs/RULES.md` Rule 6 ("Numbering is per-tenant, configurable (prefix, start,
reset rule)")

**The claim under attack.** R1.14: "Numbers come from a per-tenant, per-document-kind series with a prefix,
start and **reset rule**, allocated atomically into an insert-only `issue_number` row. Gapless per series in
R1 … and **a number is never reused**." (`docs/PRD.md:184-186`)

**Why it does not hold.** `number_series` has `reset_rule IN ('never','yearly','monthly')` (`migration.sql:70-76`)
but one series per tenant and document kind (`number_series_tenant_kind_key`, `:78-79`), and `issue_number`
is unique on `(series_id, number)` (`:258`) with no period column. A reset is therefore unrepresentable.
Executed on PGlite with every migration applied, as `pryvis_app` with the tenant set (script in my scratch
directory, synthetic data, not committed):

```
2026: issue A numbered 1 in the yearly series
2027 reset to 1 in the same series: REFUSED — duplicate key value violates unique constraint "issue_number_series_number_key"
a second quote series for 2027: REFUSED — duplicate key value violates unique constraint "number_series_tenant_kind_key"
```

So a tenant who chooses a yearly reset — the commonest accountant's request ("INV-2027-0001") — has a
setting the schema stores and then cannot honour on 1 January. R1.14 also never says what "never reused"
means under a reset: the integer is reused by design; only the formatted identifier is not. And "Gapless
per series" is untested: no allocation function exists yet (none in `schema-objects.json`'s function list),
so "server allocation makes that free" is a claim about code that has not been written.

**Recommendation.** Before W4 is built: decide whether R1 offers resets at all. Recommended: **R1 ships
`never` only** (drop `yearly`/`monthly` from the CHECK in a new migration, Rule 6) and puts the year in the
prefix if the tenant wants it; if resets are wanted, add a period key to `issue_number`'s uniqueness and
define "never reused" as the formatted identifier. Either way R1.14 should name the test that proves
gaplessness under concurrent allocation, as R1.24c does for the ceiling.

## B21 · Grade 6 says a deposit is "witnessed by the bank", but in release 1 no bank ever talks to us: a deposit the tenant records by hand is witnessed by nobody, and nothing says it is not graded 6 — J5's doctrine, one rung up — severity: major

**Where:** `docs/PRD.md` (R1.20d, R1.20i, R1.26, §7), `docs/design/acceptance-evidence.md` §4.2,
`docs/design/acceptance-grade.md` (D4), `new-app/db/migrations/20260927180000_acceptance_grade/migration.sql`,
`docs/TIERS.md` §3 item 3

**The claims under attack.**

> R1.20i: "**The grade measures who witnessed the acceptance, never how convincing the artefact looks.**"
> (`docs/PRD.md:326`)

> R1.20d: "A **paid deposit is recorded as corroboration** of acceptance" (`docs/PRD.md:329`); the design's
> ladder: grade 6, "Deposit paid", witnessed by "**the bank or WiPay**" (`acceptance-evidence.md` §4.2).

**Why it does not hold.** Release 1 has two ways a deposit becomes "paid": a WiPay callback (R1.29), which a
third party witnesses, and R1.26 — the tenant **records** a client payment, "amount, date, method,
reference, optional receipt file". Release 1 has no bank integration of any kind, so a bank transfer or
cash deposit is known to us only because the tenant typed it. By R1.20i's own test that is witnessed by
nobody — the same class as the tenant-uploaded signed copy J5 demoted to grade 1. The design anticipates
exactly this path being graded 6: D4 discusses "**bank references**" as the external ids of
`deposit_paid` evidence (`acceptance-grade.md`, D4), and the schema's only condition on a `deposit_paid`
row is a non-null `external_id` (`acceptance_grade/migration.sql:147-150`), which a typed bank reference
satisfies. The migration says so itself: "The application role can insert 'deposit_paid' … with an invented
external id … Until then a grade of 4 or 6 is only as good as the code that writes it" (`:42-45`). Nothing
in the PRD tells that code which payments qualify.

Two consequences for the product: (1) the "strongest release-1 grade" (`TIERS.md` §3 item 3) is forgeable
by the party it is meant to bind; (2) it is Pro-only — a deposit is an invoice (`acceptance-grade.md` fact
2) and invoices are Pro (§7) — so Free tenants' clients top out at grade 3, and R1.20g's deposit suggestion
is meaningless on Free. Neither is stated.

**Recommendation.** Before W5/W7 are built, amend R1.20d: **only a payment confirmed by a provider
callback (WiPay in R1) is `deposit_paid` (grade 6); a deposit the tenant records by hand is
`tenant_recorded` (grade 1)** and the UI says "recorded by you". State in §7 that grade 6 needs Pro.
This is a correction of a doctrine already decided (J5), not a new decision.

## B22 · §9's list of launch dependencies "that are not engineering" omits four the plan itself creates: the attorney's e-signature answer, a paid host for the rebuilt API, an accountant's GCT review, and a decision on app distribution — severity: major

**Where:** `docs/PRD.md` (§9, §12), `docs/adr/0024-acceptance-evidence.md` (§6, "What this does not
settle"), `docs/adr/0026-api-always-on-at-launch.md`, `render.yaml`, `docs/SERVICE-REGISTER.md` §1-2,
`new-app/CLAUDE.md`

**The claim under attack.** "R1 cannot launch without these, and none of them are engineering"
(`docs/PRD.md:628`), followed by items 1-5.

**Why it does not hold.** Each missing item is created by a document the PRD cites:

1. **The attorney's answer on the e-signature.** ADR 0024 §6: "whether ours clears the bar is the
   attorney's call … The narrow question for them is unchanged and cheap to ask". §9 item 3 sends the
   *terms* to legal review but not this question, and ADR 0023 decision 4 says a "not enough" answer is "a
   design change … better known before W5 is built than after".
2. **A paid, always-on host for the rebuilt API.** ADR 0026 decision 1: "If the paid instance is not in
   place, launch waits", and "The provider and plan are chosen when the deployment is set up". Today the
   only deployment description is `render.yaml`, which deploys `rootDir: original-app` on `plan: free`;
   `new-app` has no deployment at all (`new-app/CLAUDE.md`: "there is no bootstrap", "the HTTP layer" not
   built). A recurring cost the owner must approve is an owner dependency.
3. **An accountant's review of GCT treatment** on staged invoices and credit notes (B10).
4. **How the app reaches the phone.** §12 leaves "React Native vs web-first PWA" open; a native app needs
   a store developer account in the owner's business name with its own verification lead time, and the
   register's Expo/EAS row covers builds, not distribution. If PWA is chosen this item disappears — which
   is why the platform decision (B5) belongs before approval.

The data-protection review (B8) and the WiPay account model (B9) are also owner dependencies and are
covered in those findings.

**Recommendation.** Add items 6-9 to §9 as above, each with who acts and the lead time, and fold B8 and
B9's owner actions in beside them so the list is the one place the owner reads to know what launch waits
on.

## B23 · R1.18f wipes the phone's store when a revoked device reconnects, and a password change revokes every session — so the everyday act of resetting a password destroys any seal still waiting on the phone, which R1.18d and §4 promise can never happen — severity: major

**Where:** `docs/PRD.md` (§4 "No data is lost", R1.18, R1.18d, R1.18f), `docs/adr/0013-default-deny-auth-and-session-revocation.md`
(decision 5), `docs/THREAT-MODEL.md` §4a, `docs/design/domain-model.md` §8

**The claims under attack.**

> §4: "an immutable snapshot written on the device and held in a durable outbox until it syncs. **No data
> is lost** and nothing is re-entered." (`docs/PRD.md:86-87`)

> R1.18d: "**A sealed snapshot is never destroyed by a timer.** … A retention limit that can destroy the
> only copy of a financial document is data loss on a schedule" (`docs/PRD.md:255-257`).

> R1.18f: remote sign-out "revokes the session, so the device can no longer sync, and **the store is wiped
> when it next connects**" (`docs/PRD.md:270-271`).

**Why they do not hold together.** ADR 0013 decision 5: bumping `session_version` "— **on password
change**, sign-out-everywhere, or suspected compromise — invalidates every token already in the wild", and
sessions carry "a short `expires_at`". Sequence, with synthetic people: on Saturday a contractor seals two
jobs at gates with no signal; on Sunday, at home on a laptop, he forgets his password and resets it. Every
session, including the phone's, is revoked. On Monday the phone finds signal: per R1.18f it "can no longer
sync" and its store is wiped. The two seals never reached the server and were the only copies. Nothing in
the PRD distinguishes a revocation for a lost phone (where wiping is the point) from one for a password
reset or an ordinary expiry (where the user is the rightful owner and the outbox should push after they
sign in again). R1.18d guards only against a *timer*; the wipe is not a timer, so the guard does not
apply, and the threat model's own preferred mitigation — "a local store with a maximum age"
(`THREAT-MODEL.md` §4a) — is a second path to the same loss that R1.18d only half closes.

**Recommendation.** Before the offline path is built: amend R1.18f so that (a) an expired or
password-revoked session asks the user to sign in again on the device and **then pushes the outbox
before anything is cleared**; (b) only an explicit "this device is lost" sign-out wipes, and the
confirmation tells the person signing out how many unsynced seals the device holds, if the server knows
of any pending device (it may not — say so); (c) R1.18d's rule is widened from "never by a timer" to
"never by any automatic process while unsynced". The trade-off (a stolen phone whose thief knows the
password can push seals) is real and small next to silent loss of priced work, and the owner should see
it stated.

## B24 · Sentences that closed findings made false, still standing beside the closures: the register and status file say the paid trigger is "owed", ADR 0023 still requires the device bound Rule 14 removed, and the domain model still puts retention into R1's invoice status — severity: minor

**Where:** `docs/SERVICE-REGISTER.md` (§1 line 44, §6 item 4), `docs/BRIEF-STATUS.md` (§19 table),
`docs/adr/0023-release-1-metering-and-tier-boundaries.md` (Consequences), `docs/RULES.md` Rule 14,
`docs/design/domain-model.md` §6.2 (`client_payment` row), `docs/PRD.md` (N10, R1.25, R1.30d),
`docs/PRD-REVIEW-3.md` (H17), `docs/PRD-REVIEW.md` (F4)

Each item below is a twin of a closed finding: the closure fixed one sentence and left its sibling.

1. **H17 / ADR 0026.** PRD N10 and `SERVICE-REGISTER.md` §4a say the paid trigger is decided — always on at
   launch. The same register's §1 still says "**The paid-tier trigger is the first paying tenant**, and it
   is owed its own ADR (Rule 10)" (`SERVICE-REGISTER.md:44`), and §6 item 4 still says "the mitigation is a
   scheduled workflow that GitHub switches off after 60 idle days" (`:194`) — a workflow its own header now
   says "does not keep it warm". `BRIEF-STATUS.md:765`: "the ADR Rule 10 requires is owed". H17's
   closing check corrected §4a's "Until one is chosen" and stopped there.
2. **G11 / H14.** Rule 14 (amended through Rule 23): "**There is no bound per IP or device** … **No device
   fingerprinting**", and PRD R1.30d agrees. ADR 0023's Consequences still say "one free account per
   verified address **with a bound on addresses per device (R1.30c)** is what stops three-jobs-a-month from
   becoming unlimited" (`0023…md:88-90`) — the cited R1.30c no longer says that.
3. **F4.** PRD R1.25: "**Retention is not an input in R1**". The domain model's `client_payment` row:
   "invoice status is **computed** from its payments, **retention** and credits"
   (`domain-model.md:258`).

**Recommendation.** Correct all three in one pass with dated notes (Rule 1.9). They are small, but each is
a document a builder reads first giving the answer a closed finding overturned.

## B25 · Seven requirements promise a number they never state, so none can be tested as written — severity: minor

**Where:** `docs/PRD.md` (R1.17, R1.18b, R1.18d, R1.19, R1.24e, R1.32), `docs/design/domain-model.md` §8,
`docs/design/acceptance-responses.md`, `docs/adr/0007-subscription-tiers-and-entitlements.md`

Rule 1.10: "a requirement that cannot be demonstrated". Each of these leaves the value or the behaviour a
test would assert to the builder:

| Requirement | What is missing |
|---|---|
| R1.18b — warns "for more than **a stated number** of days" | No number is stated anywhere (domain model §8: "a warning after a few days") |
| R1.18d — the outbox's "retention limit" | No value |
| R1.19 — a share link is "expiring" | No lifetime; and B13 shows its enforcement point is undefined |
| R1.17 — "Quote expiry, evaluated on the jurisdiction's day boundary" | No default, and no **effect**: may a client accept an expired issue? `acceptance-responses.md:99-100` says "quote expiry is not yet built" and that "declined" is not final "until the quote expires" — so expiry is load-bearing and undefined |
| R1.24e — on a mismatch the job "**refuses further invoicing** against that issue until a person has looked" | No mechanism: `issue_balance` has no hold column and the application role can only read it (`new-app/CLAUDE.md`, privilege model); nothing says what records "a person has looked", or how "alerts us" is delivered (no alerting service in the register) |
| R1.32 — "per **calendar month**" | Whose calendar: ADR 0007 decision 4 says "the tenant's Jamaica month"; the PRD does not, and R1.17 shows it knows the difference matters |
| domain model §8 — entitlements "cached with a **grace period**" | Not in the PRD at all, and it decides whether a lapsed tenant can seal offline (B7) |

**Recommendation.** State each value in the PRD (or in the design it cites) before the workflow it
belongs to is built. Recommended defaults, as judgement: warn at 3 days; no outbox retention limit for
seals at all (B23); link lifetime = the quote's expiry plus 30 days; expiry blocks acceptance and the
tenant can extend it by a revision; month = Jamaica's (`America/Jamaica`); grace period 7 days.

## B26 · Scope: two release-1 items buy nothing release 1 needs, and one release-2 exclusion makes a release-1 feature misbehave — severity: minor

**Where:** `docs/PRD.md` (R1.20c, R1.36, R1.38, R1.23, R1.28, §8), `docs/TIERS.md` (§2, §3 item 2),
`docs/adr/0024-acceptance-evidence.md` (Consequences), `docs/SERVICE-REGISTER.md` §3a

The brief asks what could move out of R1 without breaking the job, and what R1 cannot honestly ship
without. Judgement, with the evidence each rests on:

1. **R1.20c, the signed-copy upload, can move to R2.** Since J5 it is graded 1 — the same grade as
   `tenant_recorded`, which needs no file. What it adds to R1 is a second hostile-upload path, which ADR
   0024's Consequences say makes the unchosen malware scanner and object storage "load-bearing for W5 as
   well as W9" (`SERVICE-REGISTER.md` §3a: "Until both are chosen, R1.36 cannot be met"). Moving it leaves
   W5 dependent on neither; the paper can still be kept by the contractor, and "the client signed paper"
   can be the reason text on a grade-1 record.
2. **R1.38, in-app support threads, can be email in R1** — `TIERS.md` §2 already says support is "email" on
   Free and Pro, and the staff side needs a console that is not specified (B15).
3. **Retention is excluded (§8), and R1.28 will chase it.** `TIERS.md` §3 item 2: "Construction is paid in
   stages: a deposit, progress claims against work done, **retention held and released**". If a contractor
   invoices a progress claim gross and the client withholds 10% as retention, R1.25 derives the invoice as
   part-paid, it goes overdue, and R1.28's reminders chase the client for money that is not yet due — on
   the contractor's letterhead. The workaround (invoice net, raise the retention as a separate invoice when
   it falls due) works within R1.24's ceiling but is nowhere stated. R1 does not need retention tracking;
   it does need to say how a contractor bills a retention job, and let a single invoice be excluded from
   reminders.

**Recommendation.** Move R1.20c to R2; make R1 support email-only; add to W7 "a retention job is billed net,
with the retention invoiced when due; any invoice can be marked 'do not remind'". Each is an owner's scope
call; none changes the bet.

## B27 · The PRD's status block and the status file's account of it are out of date, so the owner is asked to approve a document whose own header misdescribes the state it is in — severity: minor

**Where:** `docs/PRD.md` (lines 3-16), `docs/BRIEF-STATUS.md` (§ "Next three", item 3), `docs/design/domain-model.md`
(status line), `docs/adr/0025-five-invariants-move-from-prose-to-code.md`

1. **The gate table.** "Independent review — **Outstanding** — findings go to [`PRD-REVIEW.md`]"
   (`docs/PRD.md:9`). Four rounds have run, in four files, with 72 findings between them; this is the
   fifth. The table does not say which findings remain open, which is the thing the owner needs at
   approval. `Date: 2026-09-25` (`:14`) predates amendments dated as late as 2026-10-01 (R1.15c, R1.24a).
2. **"NOT a basis for building yet"** (`docs/PRD.md:3`) — while ADR 0025 (owner, 2026-09-25) moved five
   invariants into code, and 29 committed migrations from `20260925120000_documents_core` on now implement W4, W5 and W7's data layer. That was the owner's
   decision and is recorded there; the PRD's header does not mention it. Approving the PRD now also
   ratifies a built schema, including the parts B10 (no tax on invoices) and B20 (resets unrepresentable)
   find wanting. The owner should approve knowing that.
3. **`BRIEF-STATUS.md`'s summary of the PRD is the pre-review version.** Item 3: "R1 works offline for pricing
   and drafting, and **requires connectivity to *issue***" and "**Variations move to R2**"
   (`docs/BRIEF-STATUS.md:63-68`). Both were overturned in review 1 (F1, F3: seal offline; recorded
   variations in R1). `CLAUDE.md` tells every reader to read this file fourth, for "the owner's latest
   decisions".
4. **The domain model's header** still reads "independent review OUTSTANDING … runs alongside the PRD's
   (`../PRD-REVIEW.md`)".

**Recommendation.** Replace the gate table with: owner approval outstanding; reviews 1-5 run; open findings
by number with a link to each disposition table; and a sentence that the documents layer is built under
ADR 0025. Correct `BRIEF-STATUS.md` item 3 and the domain model's header in the same change.

## B28 · "One tenant per verified address … enforced by the unique index that already exists" — the index on `app_user.email` is per tenant; four documents say it is global, and the "first to verify wins" guarantee they build on it does not hold at the user row — executed — severity: major

**Where:** `docs/PRD.md` (R1.30b, R1.30c), `docs/adr/0022-one-tenant-per-user-and-no-client-logins.md`,
`docs/adr/0025-five-invariants-move-from-prose-to-code.md` (decision 5), `docs/adr/0015-credentials-and-self-service-signup.md`
(decision 2), `docs/design/domain-model.md` (§4 `user` row, §11a), `docs/THREAT-MODEL.md` §4b,
`new-app/db/migrations/20260924120000_row_identity_and_versioning/migration.sql`,
`new-app/db/migrations/20260923200000_credentials/migration.sql`, `new-app/CLAUDE.md`

**The claims under attack.**

> R1.30c: "**one tenant per verified address**. That part is exact and is **enforced by the unique index that
> already exists**." (`docs/PRD.md:447-449`); R1.30b: "Global email uniqueness is what enforces 'one business
> per address'".

> ADR 0025 decision 5: "The user row is inserted at verification … So **`app_user.email` keeps its global
> unique index** untouched, and '**first to verify wins' becomes a database guarantee** … the loser's insert
> violates the index" (`0025…md:194-198`). The same "`app_user.email` … globally unique" appears in ADR 0022
> (line 27), the domain model's `user` row ("Email unique globally") and THREAT-MODEL §4b ("The unique index
> is on `app_user.email`").

**Why it does not hold.** The only unique index on `app_user.email` is
`app_user_tenant_id_email_key ON app_user (tenant_id, email) WHERE deleted_at IS NULL`
(`20260924120000_row_identity_and_versioning/migration.sql:76-79`) — per tenant. The global one is on
`app_credential.email` (`20260923200000_credentials/migration.sql:48`), which ADR 0015 decision 2 states
correctly ("`app_user.email` keeps its per-tenant unique for display"). Executed on PGlite with all
migrations, two verifications of one address, each creating its own tenant and owner as ADR 0025 decision 5
describes (synthetic data, scratch script, nothing committed):

```
verifier 1: app_user insert ACCEPTED
verifier 2: app_user insert ACCEPTED
app_user rows with that address: 2
```

So the guarantee exists only if the registration transaction also inserts an `app_credential` row with the
**same** address — and nothing ties the two: no constraint makes `app_credential.email` equal its user's
`email`, and the guard that would is listed as owed (`new-app/CLAUDE.md`: "A guard asserting
`app_user.email` and `app_credential.email` stay equal"). Any user created without a credential (an invited
member before they set a password, if B6's option 1 is taken; any staff or seed path) escapes it. H8 (review 3) is recorded **Closed** on exactly this reasoning — "verification inserts the user, the existing global unique index decides" (`docs/PRD-REVIEW-3.md` disposition row) — so that closure does not hold as written. Sign-up
is not built, so nothing is broken *yet*; what is wrong is that the PRD and three other documents tell the
builder the protection is already in the schema.

**Recommendation.** Before sign-up is built: correct R1.30c to "enforced by `app_credential_email_key`, provided
registration inserts the user and its credential in one transaction with the same address", correct ADR 0022,
ADR 0025 decision 5, the domain model and THREAT-MODEL §4b to match ADR 0015, and make the owed equality
guard (or a composite foreign key from `app_credential (user_id, email)` to `app_user (id, email)`) a
precondition of the sign-up work.


---

## Re-read of the amended PRD

**Reviewer:** independent review agent (Opus class), 2026-10-02, at HEAD `9ac17c6` (branch
`claude/admiring-fermat-41btub`). **Did not write** any of the work under review. Brief:
`docs/briefs/2026-10-02-prd-review-5-reread.md`; before anything was changed,
`python3 tools/run_brief.py docs/briefs/2026-10-02-prd-review-5-reread.md` printed
`Brief docs/briefs/2026-10-02-prd-review-5-reread.md at HEAD 9ac17c6: 5 of 5 expectations hold.`
Under review: commits `c000c78`, `9c4d86c` and `34122ba`, and every document they changed.

Rules applied: Rule 0, 1.9, 1.10, 11, 13, 14, 15, 18, 20, 21.1, 21.2, 21.4, 24.6.

**Findings are numbered C1, C2, … and appended below as they were found** (Rule 1.10). The session was
interrupted once by a usage limit; the coordinator confirmed the tree clean and HEAD unchanged before work
resumed, and every plant before the interruption had already been restored and shown identical with
`diff -q`.

### Summary for the owner

**Approvability: approve after named changes.** The amendments reached most of B1-B28 in the PRD itself,
and nothing found here needs a new product decision from scratch. But one amendment created a new hole in
the money/evidence model (C1: once each tenant uses its own WiPay account, the tenant holds the secret that
"verifies" a WiPay callback, so grade 6 and "paid" can be forged by the party they bind). The tax-exclusive
ceiling (D7) also landed in R1.9 and nowhere else (C2). And four fixes reached the PRD and left their twins
standing in the approved domain model and the threat model, which the builder reads first (C3). C1-C6 should be
in before approval. C7-C10 can follow, but C7 has to be done before the site guard is cited as closing B4.

**Count:** 10 new findings — 0 blocker · 6 major · 4 minor. Of these, C1-C6 were created or exposed by
the amendments, and C7 and C8 are weaknesses in the two guards the amendments added. Each finding below says
whether it was executed (CONFIRMED) or reasoned (PLAUSIBLE).

### Per-finding verdicts, B1-B28

| # | Verdict | Why |
|---|---|---|
| B1 | **Closable** | N4 and N10 now state what exists and what is owed (`docs/PRD.md` §6). |
| B2 | **Closable** | R1.32a now agrees with R1.32b-c; ADR 0023 decision 1 has a dated note. |
| B3 | **Closable** | Header cites ADR 0006; §12 cites 0005/0006 and says the rule pack is owed in the rebuild. |
| B4 | **Closable with a stated limit** | The copy is corrected, and R1.43 builds the export. But R1.40b says the guard "checks every string", and it does not: four over-claims planted together all pass (C7). |
| B5 | **Not closable** | The PRD is amended. But the domain model §8 sync table, which B5 named, still has offline directory creates, a line merge and offline variations (C3). Web-first also left offline sentences unmarked (C5). |
| B6 | **Closable with a stated limit** | D5 landed. The seat count is "about 3" in one place and "up to three" in another. What happens to the extra members on a lapse is undefined (C6), and the domain model §8 still has a role check (C3). |
| B7 | **Closable with a stated limit** | R1.37a-f are present and hinge on WiPay, as stated. The lapse rule says nothing about seats (C6). |
| B8 | **Closable with a stated limit** | R1.44, R1.45 and §9 item 6 are present, and legal readings are labelled unverified by design. The chatbot added under D9 collides with Rule 15/N8 and the register (C4). |
| B9 | **Closable with a stated limit** | R1.29 is per-tenant and R1.26 records over-payments. But the "credit kept on the client" and "refund recorded" that R1.26 relies on are entities nobody has designed (C2), and per-tenant keys create C1. |
| B10 | **Open, consistently, with one gap** | The header, R1.9, §9 item 8 and §12 all say the GCT design is owed. But R1.24, R1.22b, R1.24b, the domain model §6.2a and ADR 0025 still describe the tax-inclusive ceiling with no pointer to D7, and R1.9's list of questions omits variations and the net/gross comparison (C2). |
| B11 | **Closable** | §10 and R1.42 are repaired. The web-launch walkthrough's instrument is C5. |
| B12 | **Closable** | All four files carry a "Superseded for the rebuild" banner, and the PRD header names them. |
| B13 | **Not closable** | R1.19 and R1.21a are right. But `docs/THREAT-MODEL.md` §4a, which B13 named, still has the row "The pre-rendered share page (R1.21a) is served without the API answering" (line 155) (C3). |
| B14 | **Closable** | §3, §4 and §8 corrected; the index heads §5. |
| B15 | **Closable with a stated limit** | W10 is present; the console's design is owed, as stated. |
| B16 | **Closable with a stated limit** | R1.18, R1.21b and R1.21c are present. R1.21c's per-tier daily cap has no value, so it is not yet testable (the same class as B25). |
| B17 | **Closable** | N11 has thresholds and an instrument. |
| B18 | **Closable with a stated limit** | R1.20 and the design are amended. The features page still tells every prospect that the client "confirms with a code sent to them" (C9). |
| B19 | **Closable** | §11 has a watcher and trigger on each item; the owner approved the numbers (34122ba). |
| B20 | **Closable with a stated limit** | The migration holds, and planting the old CHECK makes 2 of the 3 tests fail. But the test names only the two words it replaced (C8). |
| B21 | **Closable with a stated limit** | R1.20d is right in principle. Under D3, a "verified WiPay callback" is verified with the tenant's own key (C1), so the rule needs a verification the tenant cannot forge before W7. |
| B22 | **Closable** | §9 items 6-10 are present. |
| B23 | **Not closable** | R1.18d and R1.18f are amended. But the domain model §8 (lines 506-511) and the threat model §4a (line 153) still say revocation wipes the store "when it next connects", and the threat model still prefers "a local store with a maximum age" (C3). |
| B24 | **Closable** | All three twins corrected with dated notes (register §1 and §6 item 4, ADR 0023 Consequences, domain model `client_payment` row, BRIEF-STATUS §19 row). |
| B25 | **Closable** | Values stated; the 30-day expiry was approved by the owner (34122ba). |
| B26 | **Closable** | R1.20c moved to R2; R1.25a and R1.38 present. |
| B27 | **Closable** | Status block rewritten; BRIEF-STATUS item 3 and the domain model header corrected. |
| B28 | **Closable** | R1.30b-c and the four documents now name `app_credential.email` and make the equality guard a precondition. |

### Findings

## C1 · With each tenant on its own WiPay account (D3), the secret that "verifies" a WiPay callback belongs to the tenant, so the tenant can forge the grade-6 deposit and the "paid" state that R1.20d says only a provider can produce — severity: major

**Where:** `docs/PRD.md` (R1.20d, R1.29, R1.20i), `docs/adr/0027-prd-review-5-decisions.md` (D3),
`docs/adr/0028-web-first-then-mobile.md` (decision 3), `docs/design/acceptance-evidence.md` §4.2 (grade 6 row),
`original-app/apps/api/src/payments/wipay.service.ts`, `docs/THREAT-MODEL.md`

**The claims under attack.** R1.20d: "Only a payment a provider confirms — in R1, a verified WiPay callback
(R1.29) — is `deposit_paid`, grade 6". R1.29: "we create the link with the tenant's credentials and verify
WiPay's callback, which is what makes a deposit grade 6". R1.20i: "The grade measures who witnessed the
acceptance".

**Why it does not hold.** The only WiPay integration on record verifies a callback as
`md5(transaction_id + total + API key)`, and its own comment says "The API key is the ONLY secret in that
recipe" (`wipay.service.ts:126-153`). Under D3 the API key is the **tenant's**: they hold it, and they
paste it into their Pryvis settings (ADR 0028 decision 3). So the party that grade 6 is meant to bind can
compute a valid callback for its own invoice. Executed against that recipe, from a scratch script with a
synthetic key (nothing committed):

```
$ node forge.mjs      # verify() is verifyCallback's logic; the key is the one the tenant holds
forged callback verifies: true
```

**CONFIRMED** for the recipe on record. **PLAUSIBLE** for WiPay's live API: the old code says the recipe
"must be confirmed against the current WiPay JM API docs", and I could not reach WiPay. The consequence is
J5's doctrine (B21) one rung up again: a tenant-made artefact is graded 6, and an invoice can read "paid" with
no money moved. Before D3 the key was ours, so this was not possible; the amendment created it. Neither the
threat model nor R1.29 has a row for the case where the tenant holds the verification key. R1.29 says only
that the credentials are "a secret held as one".

**Recommendation.** Before W7 is built, R1.20d should require a confirmation the tenant cannot produce. For
example, a server-to-server transaction-status query to WiPay made by us, with the result recorded as the
evidence, never the callback body alone. If WiPay offers no such query, grade 6 must not be awarded from a
per-tenant account, and R1.20d should say so. Add a threat-model row for tenant-held payment credentials:
storage, the forgery above, and what a database compromise yields. This is a question for WiPay, not a new
owner decision.

## C2 · The tax-exclusive ceiling (D7) is written into R1.9 alone; R1.24, R1.22b, R1.24b, the domain model and ADR 0025 still define the ceiling as the tax-inclusive accepted total, and R1.9's list of questions for the GCT design omits the two that decide the arithmetic — severity: major

**Where:** `docs/PRD.md` (R1.9, R1.22a, R1.22b, R1.24, R1.24b, R1.26, §4 line 139),
`docs/design/domain-model.md` §6.2a and its `invoice` row, `docs/design/scope-reduction.md:55`,
`docs/adr/0027-prd-review-5-decisions.md` (D7),
`new-app/db/migrations/20260925120000_documents_core/migration.sql:607` and
`20260927130000_balance_open_takes_lock/migration.sql:47`

**The claims under attack.** R1.9: "the invoicing ceiling is **tax-exclusive** — accepted subtotal plus
recorded variations". R1.24, "the most important arithmetic invariant": the invoiced figure may never exceed
its "**accepted total** plus recorded variations". R1.22b: "the ceiling is `accepted_total +
variations_total`". R1.24b: "`accepted_total_minor` is a copy of the accepted issue's frozen **total**".

**Why it does not hold.** These are two definitions of one invariant, and the built code follows the
second: `issue_balance_open()` copies `q."total_minor"`, and `quote_issue` has a CHECK that `total_minor =
subtotal_minor + tax_minor`. R1.9 admits the code is tax-inclusive. R1.24, R1.22b and R1.24b carry no forward
note, though the domain model §6.2a and `scope-reduction.md:55` both restate "the accepted total". Repeating
the ceiling in prose in two places is the defect G1 and H1 found twice before. A builder of W7 reading R1.24
alone builds the old ceiling.

More substantive: R1.9 lists what the GCT design must answer (a deposit's tax, registration, tax-invoice
content, credit notes). It does not ask the two questions D7 itself creates:

1. **Are variations net or gross?** R1.22a prices a variation's lines "the same way a quote is", and quote
   lines carry a tax treatment. Under a tax-exclusive ceiling a variation's total has to be net, or the
   ceiling mixes bases.
2. **Is the invoiced figure compared with the ceiling net or gross?** `issue_balance_apply()` sums
   `invoice.amount_minor`, which has no tax split. Under D7 that sum has to be the net part. Otherwise every
   GCT-registered tenant's final invoice is refused for the amount of its own tax.

Also unowned: R1.26 resolves an over-payment by "a refund recorded, or a credit kept on the client". Neither a
refund nor a client credit balance is an entity in the PRD or the domain model, and the PRD does not say
whether a kept credit can settle another invoice.

Pre-existing and stale beside it: §4 line 139 says a variation "re-derives the accepted total", while R1.22b
says no variation moves it.

**Recommendation.** Before approval, add one dated line under R1.24 and R1.22b ("tax-exclusive from the GCT
design, ADR 0027 D7; until that migration the built ceiling is tax-inclusive") and the same note in the domain
model §6.2a. Add questions (1) and (2) and the over-payment entities to R1.9's list, owed with the GCT
design. Correct line 139.

## C3 · Four fixes reached the PRD and left their twins in the approved domain model and the threat model — offline creates and line merge (B5), wipe on revocation (B23), the pre-rendered share page (B13), and the role re-check (B6) — severity: major

**Where:** `docs/design/domain-model.md` §8 (sync table, lines 484-495; lines 502-511; line 561-563),
`docs/THREAT-MODEL.md` §4a (lines 153 and 155), `docs/PRD.md` (R1.4, R1.12, R1.18f, R1.18e, R1.21a, R1.22f)

**The claims under attack.** The disposition rows for B5, B6, B13 and B23 read "Fixed". B5's and B23's
findings named the domain model §8 and THREAT-MODEL §4a in their **Where** lines, and B13's named
THREAT-MODEL §4a. The PRD header calls the domain model "Approved".

**Why it does not hold.** `git show --stat c000c78` touched `domain-model.md` in three places (header,
`user` row, `client_payment` row) and THREAT-MODEL only in §4b and §6. So:

- Domain model §8 table: Directory offline "**read, and create new**"; `quote` draft "**full edit** — **Merge
  by line**, with a review step"; `variation` offline "**create**". This contradicts R1.4, R1.12, R1.22f and
  ADR 0027 D1. It is the sync engine B5 says was taken out of release 1.
- Domain model lines 506-511 and THREAT-MODEL line 153: sign-out "revokes the session … and the local store
  is wiped **when it next connects**". THREAT-MODEL adds that the working mitigation is "a local store with a
  **maximum age**". R1.18f(a) now pushes before clearing, and R1.18d forbids any automatic destruction. This
  is the B23 data-loss path, still written as the design.
- THREAT-MODEL line 155: "**The pre-rendered share page** (R1.21a) is served without the API answering".
  R1.21a now says nothing is pre-rendered.
- Domain model lines 561-563: re-check that the user is "in a **role** that still permits sealing". R1.18e
  says R1 has no roles.

CONFIRMED by reading the files at HEAD (line numbers above).

**Recommendation.** Before approval, amend the four places with dated notes pointing at ADR 0027 D1, D5 and
D12 and at R1.21a (Rule 1.9). Then B5, B13 and B23 can be re-checked for Closed.

## C4 · The support chatbot (D9, R1.38) sends what a signed-in person types to the Claude API, so "none is ever sent to a model" cannot be met, and the register and privacy notice still say the product never uses Claude at runtime — severity: major

**Where:** `docs/PRD.md` (R1.38, N8), `docs/RULES.md` Rule 15, `docs/SERVICE-REGISTER.md` §2 (Anthropic row),
`docs/THREAT-MODEL.md` (line 54, line 142), `new-app/web/content/legal.ts` (processors, lines 55-62),
`docs/TIERS.md:59`, `docs/adr/0027-prd-review-5-decisions.md` (D9)

**The claims under attack.** R1.38: the chatbot "**sees no tenant or client data** — none is ever sent to a
model (Rule 15, N8)". The register's Anthropic row: "Holds personal data: **Never**"; "**nothing in the
product depends on it at runtime**". The privacy notice lists four processors: Neon, Vercel, Resend and
WiPay.

**Why it does not hold.** A chatbot's input is free text typed by a tenant. A contractor asking "why didn't
my quote to <client name> at <address> send?" has sent client personal data to the model, and the chatbot
cannot prevent that by construction. R1.38 names no redaction step, and no test could show "none is ever
sent". Rule 15 and N8 are absolute ("ever"). The THREAT-MODEL line 142 itself grades the existing control as
"**PROCESS** — a discipline, not yet a technical control", and that was written for developer use, not for a
public input box. Meanwhile three documents were left saying the product does not use Claude at runtime. The
register row is Rule 18's sub-processor record, and the privacy notice is the public list of processors. A
chatbot in production with neither updated is "a defect, not a paperwork oversight" (Rule 18).

CONFIRMED by reading the files at HEAD. That users will type personal data is judgement.

**Recommendation.** Before approval, choose and state one (a decision for the owner, with options below):
(a) the chatbot input is redacted before sending, and R1.38 names the redaction and its test, with Rule 15's
wording kept; (b) R1.38 says plainly that a person's own question is sent to Anthropic, Rule 15 and N8 are
amended through Rule 23 for that case, and the register, privacy notice and threat model gain the row; or
(c) the chatbot leaves R1. **Recommended (judgement): (c)** for the web launch. Email support is decided and
enough, and the chatbot's budget is not set anyway (§9 item 10).

## C5 · ADR 0028 (web app first, online) left release-1 sentences that assume offline at the first launch, and created an undefined case at the free limit — severity: major

**Where:** `docs/PRD.md` (§4 lines 69-71, R1.4, R1.8, R1.18 marker, R1.18c, R1.18g-j, R1.32, R1.32a-b),
`docs/adr/0028-web-first-then-mobile.md`, `new-app/web/content/site.ts`

**The claims under attack.** §4: "every requirement marked **[mobile]** below applies from its launch" (so
everything unmarked applies at web launch). The R1.18 marker: "on the web app a seal is made online and
**numbered at once**".

**Why it does not hold.** Six markers exist (`grep -c "\[mobile" docs/PRD.md` → 6). Unmarked and wrong at
web launch:

1. **R1.4**: "Everything in W1 is **readable offline**". It is unmarked. ADR 0028's rejected alternative is
   exactly an offline-capable web app, so R1.4 demands at web launch what the owner rejected.
2. **R1.8**: the requirement is now "online in the web app at web launch", but the instrument still names
   only "**the network — aeroplane mode**" and "app cold-started". A web-launch walkthrough in aeroplane mode
   fails by definition, and the web run has no named network or device state. This is G10's "naming three of
   four" again, which R1.8's own text calls "how a hope … survives its own fix".
3. **§4 lines 69-71**: "So release 1 cannot quietly be online-only — that would make the site an over-claim".
   It still quotes the site's Pro line as "**Offline use on your phone**", which the site has not said since F5
   (`grep "Offline use on your phone" new-app/web/content/site.ts` → no match). The first launch is now
   online-only, and that is the owner's decision.
4. **The free limit at web launch is undefined.** "Numbered at once" means a Free tenant's fourth job of
   the month is refused at numbering, online. R1.32 still justifies metering at numbering because "sealing
   happens offline". R1.32a-b describe the refused seal as a sync event that waits in a list. And R1.18d,
   which keeps such a seal from being destroyed, is now mobile-only. On the web it is not stated whether the
   fourth job is refused before sealing or sealed and blocked, or what survives. §10's demand signal is "a
   fourth job refused", so the measure that tests the bet has no defined event at web launch.
5. **R1.18c and R1.18g-j are mobile-only**, but Pro has about three members on the web. The schema already
   refuses a second seal of one revision (`quote_issue_quote_revision_key` on (tenant_id, quote_id,
   revision), `20260926180000_tenant_composite_keys/migration.sql:180`). The PRD no longer says what the
   second member sees, or whether their priced snapshot is kept as a `rejected_seal`.

CONFIRMED by reading and the greps shown.

**Recommendation.** Before approval: mark R1.4 [mobile] (the web app reads online); give R1.8 a web
variant with all four parameters; rewrite §4's opening paragraph to ADR 0028; and state the web-launch
behaviour at the free limit and on a second member's seal. Recommended (judgement): the seal is kept and
blocked exactly as on mobile, so one rule serves both.

## C6 · D5 gives Pro "about three" users and D4's lapse rule drops a tenant to Free's one, and nothing says what happens to the other members — the seat number itself is stated three ways — severity: major

**Where:** `docs/PRD.md` (§7 Users row, R1.18c, R1.18e, R1.37c-d), `docs/TIERS.md:52`,
`new-app/web/content/site.ts` (Pro "Up to 3 users"), `docs/adr/0027-prd-review-5-decisions.md` (D4, D5)

**The claims under attack.** R1.37c: "**everything already created stays readable**". §7: Users — Free 1,
Pro "**about 3**". R1.18c: "Pro has **up to three**". Site: "**Up to 3 users**".

**Why it does not hold.** A lapsed Pro tenant with three members is on Free, which has one user. R1.37c-d
cover data, reminders, links and the meter, but not members. Undefined: which member keeps access (the
owner?); whether the others can still sign in and read the history R1.37c promises; and, from the mobile
launch, what R1.18e's "the user is still an active member" re-check does to the unsynced seals on a
deactivated member's phone. Refusing them destroys nothing (R1.18d), but a refusal for membership is not one
of the refusal kinds R1.18e or the domain model define. And "about 3" cannot be held as entitlement data
(Rule 14 needs a number). The PRD's two sentences and the site disagree on whether it is approximate.

CONFIRMED by reading.

**Recommendation.** Before approval, decide the number (recommended: exactly 3, matching the site). Add to
R1.37c what lapse does to members beyond one. Recommended (judgement): every member keeps read access and
can record payments on invoiced money, nothing new is created, and no seal is refused for the lapse itself.

## C7 · R1.40b's site guard does not check "every string": four over-claims planted at once all pass, through four separate gaps — severity: major (guard weakness; no current over-claim found on the site)

**Where:** `new-app/web/test/site-guards.test.ts` (tests "sells nothing the current release does not
deliver" and "says nothing on any page that the current release does not deliver"),
`new-app/web/content/site.ts`, `docs/PRD.md` (R1.40b), this file's B4 disposition row

**The claims under attack.** R1.40b: "every string in the site's copy and its legal text is checked against
the phrases for undelivered features, so the next scope change cannot silently make **any page** untrue".
B4's row: the guard "walks every string in the site and legal copy (planted: caught)".

**Evidence, executed.** `site.ts` was copied to a backup outside the repository and four lines were planted
together:

1. Pro `includes`: `"Roles and approvals — who may send or discount (coming with the mobile app)"`. This is a
   release-3 feature, but the tier test `continue`s on the mobile marker **before** it checks the
   release number or the delivered set (`if (markedMobile.test(line)) continue;`, added in `9c4d86c`). So any
   line wearing that marker passes, whatever release it is from.
2. Pro `theLine`: `"Pro tracks retention and shows your job profit on every job."`. The site-wide walk
   returns at `path === "pricing.tiers"`, so every tier's `who` and `theLine` is skipped, and the tier test
   reads `theLine` only for a whole-tier marker.
3. `home.points`: `"Works with no signal: price and seal a job offline today."`. The `undelivered` list has
   no offline phrase, though ADR 0028 decision 2 makes the offline claim the one the site must hold back
   until the mobile app.
4. Features "Invoices" body: `"…hold and release retention today, and see at a glance who is late. Coming in
   release 2: change orders."`. Any "coming in release N" anywhere in a string exempts every phrase in that
   string.

```
$ npx vitest run test/site-guards.test.ts     # with all four planted
      Tests  12 passed (12)
# restored: cp backup → diff -q identical
```

Control, to show the detector works where it looks: with only `"Coming in release 2: "` removed from the home
point about job profit, the run gave `× nothing untrue > says nothing on any page that the current release does
not deliver`, `Tests 1 failed | 11 passed (12)`; restored and shown identical with `diff -q`.

**Severity.** This is a guard weakness. The current copy carries none of the four, as far as I read it. But
R1.40b and B4's row claim coverage the guard does not have (Rule 21.1).

**Recommendation.** Narrow R1.40b's claim to what the guard checks, or close the four gaps: check the mobile
marker only for lines in an explicit mobile-delivered set; walk `who` and `theLine`; add offline/no-signal
phrases; and require the marker to qualify the matched phrase rather than appear anywhere in the string. Then
re-plant all four.

## C8 · The B20 test pins the two words it replaced: a CHECK that admits any other reset value passes it; and "the year in the prefix" does not give the number B20 described — severity: minor

**Where:** `new-app/db/test/documents-core.test.ts` ("B20" block),
`new-app/db/migrations/20260928010000_number_series_never_resets/migration.sql`, `docs/PRD.md` (R1.14),
`new-app/db/migrations/20260927220000_privilege_model/migration.sql:73`

**The claim under attack.** R1.14: "the schema accepts only `never`", tested in the B20 block, "planted:
caught".

**Evidence, executed.** Restoring the old CHECK (`IN ('never','yearly','monthly')`) makes the block fail
(`Tests 2 failed | 1 passed | 137 skipped (140)`), so the plant claim holds. But planting
`CHECK ("reset_rule" NOT IN ('yearly', 'monthly'))`, which admits `'quarterly'` or any other string, gives
`Tests 3 passed | 137 skipped (140)`. Both plants were made from a backup outside the repository and restored,
and `diff -q` showed them identical. The test asserts the text of the defect, not its shape ("only `never`").

**PLAUSIBLE, not executed:** the workaround produces neither "INV-2027-0001" nor safety. There is one series
per kind (`number_series_tenant_kind_key`), so changing the prefix to "INV-2027-" continues the count
(INV-2027-0143). The application role holds UPDATE on every table by default
(`privilege_model/migration.sql:73`) and nothing freezes `next_number`, so a tenant who also sets the start
back to 1 to get "-0001" reproduces B20's refusal on the next allocation (`issue_number_series_number_key`).
R1.14 does not say whether the prefix and start are editable after the first number.

**Recommendation.** Add a case asserting an arbitrary value such as `'quarterly'` is refused. In R1.14, say
the year-in-prefix continues the count, and that the start cannot move below the last allocated number
(owed with the allocation code).

## C9 · The features page tells every prospect their client "confirms with a code sent to them"; under the channel-aware bar (D6) a WhatsApp-only client gets no code in release 1 — severity: minor

**Where:** `new-app/web/content/site.ts` (features, "Your client accepts on their phone"), `docs/PRD.md`
(R1.20, R1.20b), `docs/RULES.md` Rule 20

**The claim under attack.** "Send a link by WhatsApp or email. Your client sees a branded quote, **confirms
with a code sent to them**, and accepts or declines."

**Why it does not hold.** R1.20b: release 1 sends codes only by email, and D6 makes the default for a
WhatsApp-only client grade 2 (a tapped link, no code). The sentence pairs WhatsApp with a code that release 1
cannot send there. It is small, but it is public copy and Rule 20 applies to it. The guard cannot see it
(C7). CONFIRMED by reading.

**Recommendation.** "…confirms with a code sent to their email, where they have one, and accepts or
declines." This is a public-copy edit for the owner to approve.

## C10 · The service register was not updated for D2 and D9: Expo/EAS is recorded for Android only, no app-store accounts appear, and the Anthropic row denies runtime use — severity: minor

**Where:** `docs/SERVICE-REGISTER.md` §2 (Expo / EAS row, Anthropic row), `docs/PRD.md` (§4 table, §9 item
9, R1.38), `docs/adr/0027-prd-review-5-decisions.md` (D2, D9), `docs/RULES.md` Rule 18

**The claim under attack.** ADR 0027 "Affects: … `docs/SERVICE-REGISTER.md`"; D2: "React Native with Expo,
on **Android and iOS**".

**Why it does not hold.** The Expo row reads "Builds and ships the React Native **Android** app". There is
no row for the Apple or Google developer accounts that §9 item 9 makes a launch dependency. The Anthropic row
is covered in C4. The register's only changes in `c000c78` were §1, §6 item 4 and §6 item 5. CONFIRMED by
reading. The mobile app is not built, so this is a record to correct before the mobile launch, not a running
service missing from the register yet.

**Recommendation.** Amend the Expo row to Android and iOS and add the two store accounts, in the same change
as C4's decision.

### Decisions only the owner can make

| # | Decision | Options | Recommendation (judgement) |
|---|---|---|---|
| E1 | The support chatbot and Rule 15 (C4) | (a) redact input and keep Rule 15 · (b) amend Rule 15/N8, register Anthropic as a processor, update the privacy notice · (c) chatbot out of R1 | **(c)** for the web launch; email support is already decided |
| E2 | What grade 6 rests on under per-tenant WiPay (C1) | (a) a server-to-server status query we make, if WiPay offers one · (b) no grade 6 from per-tenant accounts in R1 | **(a)** if WiPay offers it, otherwise **(b)**; ask WiPay in the same conversation §9 item 1b already requires |
| E3 | Pro seats and lapse (C6) | exactly 3 · "about 3" with a stated hard cap; on lapse: members keep read and collect access · only the owner keeps access | **Exactly 3**; every member keeps read and collect access on lapse |
| E4 | The fourth Free job on the web (C5) | sealed and blocked, as on mobile · refused before sealing | **Sealed and blocked**, one rule for both |

### What this re-read did not examine (Rule 21.4)

- **WiPay's live API.** C1 rests on the recipe in the old application's code, which says it must be
  confirmed against WiPay's docs. I could not reach WiPay.
- **Jamaican law and GCT rules**: not verified, as before.
- **The full gate.** I ran only the two tests the brief names, each with plants: the B20 block in
  `new-app/db` (PGlite) and `site-guards.test.ts` in `new-app/web`. I did not run `npm run typecheck`, the
  full `npm test`, lint, `next build`, the four checkers, or the real-PostgreSQL race suite. The brief's
  runner ran all five expectations green at the start.
- **Documents read in full:** the PRD, ADR 0027, ADR 0028, the brief, `site.ts`, and both guards. **Read in
  part or by search:** this file's B-findings (all read), `TIERS.md`, ADRs 0022, 0023, 0025, the domain
  model §4, §6.2-§6.2a and §8, THREAT-MODEL §4a, §4b and §6, SERVICE-REGISTER §1, §2, §5 and §6, `legal.ts`,
  `RULES.md` 10-15 and 18-20, the B20 migration, the documents-core migration, and the privilege-model
  grants. **Not read:** ADRs 0024 and 0026 beyond searches; `acceptance-responses.md`, `staff-mfa.md`,
  `privilege-model.md`; `MISTAKES.md`; the diffs to `ARCHITECTURE.md`, `MILESTONES.md`, `PRICING.md` and
  `ROADMAP.md` beyond their banners.
- **R1.43-R1.49 and N11** were read for consistency, not attacked one by one for testability, except
  R1.21c's cap (noted under B16).

Every plant was made from a backup in my scratch directory, restored from it, and shown identical with
`diff -q`. The WiPay script ran from the scratch directory. Nothing else in the repository was written.
