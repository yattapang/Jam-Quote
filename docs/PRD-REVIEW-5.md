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

