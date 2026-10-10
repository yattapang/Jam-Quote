# Asset and service register

**What this is.** Every external service, piece of infrastructure and third party this product
depends on: what it does, **why it was chosen**, what data it holds, what it costs, and what we
would do if it disappeared or got too expensive.

In professional practice this is an **asset register** (ITIL keeps a formal version as a CMDB
of configuration items). It absorbs two related artefacts rather than letting them rot in
separate files:

- a **vendor / sub-processor register** — column *Holds personal data*, which is the list a
  Jamaican or Trinidadian tenant is entitled to ask for, and the basis of a Record of
  Processing Activities if one is ever required;
- a pointer to the **SBOM** (Software Bill of Materials) for code dependencies, which is a
  generated artefact and not a hand-maintained list.

**Why it exists.** Rule 10 requires portable technology and a written trigger for moving off
free tiers; Rule 17 requires our weaknesses stated plainly. Neither is answerable without
knowing what we actually run on. Added 2026-09-23 at the owner's request, and now Rule 18.

**How it stays true.** It is updated in the same change that adds, removes or repoints a
service — the same discipline as the module register. A service in production and absent here
is a defect, not a paperwork oversight.

**What it must never contain:** a credential, a connection string, a token or a key. It says
*where* a secret lives, never the secret (Rule 5).

---

**Rewritten 2026-10-09 for the rebuilt application** (design A5, `docs/design/third-party-register.md` RG8, approved
by the owner). §0 is what the rebuilt application will run on; §1 and §2 keep the old application's rows until K1
retires `original-app/`. A row marked *chosen, not yet in use* changes to *in use* in the build step that turns it on.

## 0. The rebuilt application — every service, and the sub-processor list

Why each was chosen, and what was rejected, is in the design named in the "Decided in" column; this table does not
restate it. Costs and the trigger for leaving each free plan are in `docs/design/environments-and-operations.md` OP10
and `docs/design/third-party-register.md` §10.

| Service | What it does | Holds personal data | Where | Status | Decided in | If it went away |
|---|---|---|---|---|---|---|
| **DigitalOcean** — App Platform, managed PostgreSQL, Spaces | The API and its job worker; the database; the files (logos, rendered PDFs, receipts) | **Yes — everything** | Toronto, Canada | Chosen, not yet in use (B1, B5); subject to OP2's Toronto check | OP2-OP3; RG2 | Standard containers, PostgreSQL and the S3 API: restore the backups at another provider (OP6's yearly rebuild drill proves it) |
| **Vercel** (Pro) | The site and the web app, as static files | In transit only; nothing stored (OP2) | Global edge | The site is in use, on Hobby until OA27 | OP2-OP3 | Any static host |
| **AWS** — S3 and GuardDuty, three accounts under one organisation | The backup store (ciphertext only); the upload quarantine and its malware scan | Backups: encrypted, unreadable to AWS. Quarantine: **yes, plain uploads for at most one day** | Canada (Central) | Chosen, not yet in use (B3, B5) | OP6; RG3; RG7 | Backups: any store with a write-once lock. Scanning: ClamAV in our own hosting (RG3 option A) |
| **Sentry** (Developer plan) | Error tracking, from the API only | **No, by design** (AP9; RG4) — a scrubbing mistake is the residual | EU (Frankfurt) | Chosen, not yet in use (B3) | RG4 | Another error tracker; the redacted shape is ours |
| **Better Stack** (free plan) | Uptime checks and heartbeats | No — URLs and check names | — | Chosen, not yet in use (B3) | RG5 | Another monitor; the checks are plain HTTP |
| **Microsoft 365** (Business Basic), held by the Canadian company | The mailbox: `info@`, `support@`, `privacy@` | **Yes — whatever people write to us** | Canada | Chosen, not yet in use (OA12) | RG6; SF2 | Any mail provider: change the domain's MX record, export the mailbox |
| **The transactional email provider** | Codes, quotes, invoices and replies sent by the product | **Yes** — addresses and documents sent | Chosen in A6 | Not chosen | A6 | Behind the one messaging service (Rule 11), so a swap is one adapter |
| **Stripe**, through the Canadian company | Tenants' subscriptions by card | **Yes** — the tenant's billing details; card numbers never touch us | Canada and the United States | Test mode only (OA21) | ADR 0033; A10 | WiPay, the fallback (ADR 0033; OA8) |
| **GitHub** (Team, the business's organisation) | Code, CI, Claude's pull requests | No — code and synthetic data only | United States | In use on a personal account until OA25 | OP8 | Any git host; CI rewritten |
| **GoDaddy** | The domain's registrar | The registrant's contact details | — | In use | — | Transfer to another registrar |
| **Anthropic** (Claude) | Claude-assisted maintenance | **Never** — redacted or synthetic only (Rule 15) | United States | In use | Rule 15 | Human development continues |
| **WiPay** — release 2 | Our merchant account if Stripe does not work out (OA8, held); each tenant's own account for card links (R1.29, H7) | Payer details, held by WiPay | Jamaica and the Caribbean | Not in use | ADR 0033; ADR 0034 | Bank transfer, recorded by hand |

**Tenants' WiPay credentials (release 2).** When H7 builds card links, each tenant's WiPay keys are stored encrypted in
the database, sealed with a key held in configuration and never in the database (§5; the threat model's WiPay row).

**The sub-processor list** — what a contractor is given and what the privacy notice says (ADR 0035 decisions 1 and 2;
the Act's s. 16(2)(g)). Only services that hold personal data appear:

| Sub-processor | What it does for Pryvis | Where the data is |
|---|---|---|
| DigitalOcean | Hosting, database and file storage | Canada |
| Amazon Web Services | Encrypted backups; checking uploaded files for malware | Canada |
| Microsoft | Our email inbox | Canada |
| The transactional email provider | Sending email | Chosen in A6 |
| Stripe | Subscription payments | Canada and the United States |
| Sentry | Error reports, built to contain no personal data | European Union |

All of them are United States companies: data held in Canada can still be reached by US legal process (OP2's
caveat), and the privacy notice says so.

## 1. The old application — infrastructure and hosting (until K1)

| Service | What it does | Why this one | Tier and cost | Holds personal data | If it went away |
|---|---|---|---|---|---|
| **Vercel** | Hosts the Next.js web app **and, from 2026-09-24, the public site at pryvis.com** (ADR 0018) | First-class Next.js support, zero-config preview deploys, free tier sufficient for pre-launch. Root Directory points at `original-app/apps/web` (ADR 0010) | Free (Hobby) | In transit only; nothing stored | Any Node host or container runs Next.js. Migration cost is CI configuration, not code (Rule 10) |
| **Render** | Hosts the NestJS API (`jamquote-api`), configured by `render.yaml` (`rootDir: original-app`) | Blueprint-as-code in the repository, free tier, straightforward Docker/Node runtime | Free — **spins down after ~15 min idle**, so a cold start is ~40–90s | In transit; logs must contain none (Rule 5) | Any container host. The Dockerfile and blueprint are portable by design |
| **Neon Postgres** (provisioned through Vercel's Postgres integration) | The database | Standard Postgres, so nothing is provider-proprietary; branching is useful; free tier adequate pre-launch. **It is Neon underneath the Vercel dashboard** — which matters when you go looking for it | Free | **Yes — all tenant and customer data** | It is plain Postgres. `pg_dump`/restore to any provider. This is the single most important portability property we have, and it was a deliberate choice |
| **GitHub** | Source of truth for code; Actions runs the verify gate and the keep-warm ping | Already in use; Actions is free for this volume | Free | No | Any git host; CI would be rewritten |
| **GoDaddy** | Registrar for **pryvis.com** | The owner already holds the domain | Annual registration | Registrant contact details | Transferable to any registrar |

**Free-tier reality, stated honestly.** The Render free tier sleeping is not a nuisance to be
worked around, it is a launch blocker: a contractor tapping a share link and waiting 40 seconds
concludes the product is broken. The keep-warm workflow is a prototype-phase patch, and GitHub
disables scheduled workflows after 60 days of repository inactivity, so it is not a control we
can rely on. **The paid-tier trigger is decided: ADR 0026** — a paid, always-on API is a launch
requirement, and until then the share page wakes the API when it opens (§4a). *Corrected 2026-10-02
(finding B24): this said the trigger was the first paying tenant and owed its own ADR.*

**The public site adds no service.** It is static pages in our own application on the same Vercel
project: no site builder, no CMS, no form service, no analytics, no font host (Rule 20). The only
asset is the owner's logo, committed to the repository as SVG in two variants (light and a
dark-mode version with the letterforms lightened and the leaf untouched). That is the point of ADR 0018 — the row
above is the entire infrastructure cost of having a front door.

## 2. Third-party services in the product

*(2026-10-09: the rebuilt application's rows are in §0. The rows below describe the old application, and the services
§0 does not repeat — WhatsApp, Expo, the app stores, fonts and the npm registry — which still apply.)*

| Service | What it does | Why this one | Cost model | Holds personal data | If it went away |
|---|---|---|---|---|---|
| **Resend** | Transactional email: password reset, quote and invoice delivery, overdue reminders, subscription notices | Simple API, good deliverability, generous free tier | Free tier, then per-message | **Yes — tenant and customer email addresses, and document contents** | Behind the one messaging service after the rebuild (ADR 0012), so a swap is one adapter. Today each caller sends its own mail, so a swap touches several files — a real finding from the Phase 0 audit |
| **WiPay** | Card payment links for Jamaican and Caribbean contractors | One of the few gateways that actually serves JM/TT merchants; local settlement | Per-transaction | Payer name and email; **no card data ever touches us** | No like-for-like local substitute. This is a genuine single point of dependence and is recorded as such |
| **WhatsApp (click-to-chat)** | `wa.me` links the contractor taps to share a quote from their own phone | Costs nothing, needs no verification, and is how Jamaican contractors already work | Free | No — it opens the contractor's own WhatsApp; nothing passes through us | Nothing to replace; it is a URL |
| **Meta WhatsApp Business API** | *Not yet in use.* Server-sent templated quotes and receipts (Business tier) | The only sanctioned way to send WhatsApp programmatically | Per-conversation | Would hold customer phone numbers and message content | **Start the Meta verification early** — the lead time, not the code, is the long pole |
| **Expo / EAS** | Builds and ships the React Native app for **Android and iOS** — the mobile app that follows the web launch (ADR 0027 D2, ADR 0028) | Already in use; removes the Android and iOS toolchains from every developer's machine | Free tier, then per-build | No | Bare React Native builds locally; slower, not blocked |
| **Google Play developer account** | Distributes the Android app. *Not yet held — needed for the mobile launch, not the web launch* (PRD §9 item 9) | The only official Android store | One-time registration fee | The business's registration details | Side-loading only, which this market will not do |
| **Apple Developer Program** | Distributes the iOS app. *Not yet held — needed for the mobile launch* (PRD §9 item 9) | The only way onto an iPhone | Annual fee | The business's registration details | No iOS app |
| **Each tenant's own WiPay merchant account** — *release 2 (ADR 0034)* | Takes the tenant's clients' card payments (PRD R1.29, ADR 0027 D3, ADR 0028). *Not ours: we hold the tenant's credentials to create links and confirm transactions* | The owner's decision: Pryvis never holds client money | The tenant's own WiPay terms | Payer name and email, held by WiPay for the tenant | The tenant's clients pay by other means, recorded by hand (grade 1) |
| **Anthropic Claude API** | Claude-assisted maintenance: proposes pull requests, never touches production (Rule 15) | Already the development method | Pay-as-you-go, with budgets and caps | **Never** — redacted or synthetic data only, which is a hard rule, not a preference | Human development continues; nothing in the product depends on it at runtime |
| **Google Fonts** | Fetched by `next/font` at build time **in `original-app` only** | Next.js default there | Free | No | `new-app` uses none: the system font stack, no font host (Rule 20). That is why CI **can** build the new site while it still cannot build the old one — the fetch cannot complete on every network. Self-hosting the font files would fix `original-app`, but it is frozen, so this stays as a recorded reason rather than a task |
| **npm registry** | Every dependency | Standard | Free | No | A registry mirror or vendored dependencies |

## 3. Development and test only

| Thing | What it does | Why it is not in production |
|---|---|---|
| **PGlite** (`@electric-sql/pglite`) | Real Postgres compiled to WebAssembly, in process, so migrations, policies, roles and `current_setting` behave as they do in production | It is the test harness. A mock cannot disagree with a row-level-security policy, which is the whole reason the isolation tests are trustworthy |
| **Turborepo, Vitest, TypeScript, Prisma, ESLint, Prettier** | Build, test, typecheck, migrate, lint, format | Standard toolchain |
| **Docker Compose** (`new-app/infra/`) | Local Postgres for development, so RLS is exercised outside CI | RLS that is only enabled in production is a rule nobody tests |
| **gitleaks** (the pinned binary, v8.24.3, in CI only) | Scans **every commit** for committed credentials on each push and pull request | The official action was tried first and **understated its coverage**: it runs `--log-opts=-1`, the most recent commit only, while reporting a clean scan. The binary with `gitleaks git .` scans the history, is pinned so the scope cannot change underneath us, and runs `--redact` so a finding is not echoed into a public build log. Holds no data of ours. If it disappeared: any equivalent scanner, or the same binary from a mirror |
| **`npm audit`** (built in, no new dependency) | Known vulnerabilities in what both workspace roots install | Chosen over a third-party scanner precisely because it adds nothing to install and nothing to the register. It only knows what the npm advisory database knows, which is the argument for the SBOM below rather than against the check |

## 3a. Two services release 1 requires and we had not chosen (added 2026-09-25, F11)

**Resolved 2026-10-09 by design A5:** malware scanning is AWS GuardDuty on a quarantine bucket in Canada (RG3), and
object storage is DigitalOcean Spaces in Toronto (RG2); both are rows in §0. The table below is kept as the record of
the gap.

Rule 18: *"A service running in production and missing from the register is a defect, not a paperwork
oversight."* The review of the PRD found two required by numbered requirements and absent from every row
here. They are listed as **undecided on purpose** — naming the gap is the register's job; inventing a
vendor to fill a table is not.

| Needed for | What it must do | What choosing it costs |
|---|---|---|
| **Malware scanning** (PRD R1.36, Rule 5) | Scan every uploaded deposit receipt and logo before it is stored or served | A **sub-processor holding tenant financial documents**, so it needs a register row, a privacy-policy mention and a data-residency answer. A self-hosted scanner avoids the sub-processor but adds an always-on service to a free tier that sleeps |
| **Private object storage** (PRD R1.13, R1.36, `document_render.storage_key`, Rule 10) | Hold receipts, logos and rendered PDFs privately, tenant-scoped, out of the database | Cost scales with documents rather than tenants. The residency question is the same one the privacy policy already answers for the database |

**Until both are chosen, R1.36 cannot be met**, and any upload path built before then is building against
a decision that has not been made. Both are on the owner's dependency list in `PRD.md` §9.

## 3b. Inbound message handling — owed, deferred until after growth (2026-09-26)

Grade 4 on the acceptance ladder is **the client's own reply**, witnessed by Google or Meta rather than by
us or the tenant — the best evidence available short of money
(`docs/design/acceptance-evidence.md`). The owner has deferred buying it until after growth, and release 1
prepares for it rather than building it.

| Needed for | What it must do | What choosing it costs |
|---|---|---|
| **Inbound email** | Receive a reply to a per-issue address, attribute it to the issue, store the message id and sender as the provider reports them | An address we host, an endpoint that parses mail, and a **new sub-processor holding client replies** — which is client personal data, so a privacy-policy mention and a residency answer |
| **Inbound WhatsApp** | The same, for the channel most Jamaican clients prefer | The **Business API**: Meta verification, per-message cost, and release 3 in the plan. Release 1's click-to-chat sends the reply to the contractor's own phone, so we cannot see it at all |

**Until either is bought, a tenant-uploaded screenshot of a reply is graded 1, not 4.** It is evidence the
tenant holds and can fabricate, and the ladder refuses to grade it higher.

## 4. Software Bill of Materials

Code dependencies are **not listed here by hand** — a hand-maintained dependency list is wrong
within a week. They belong in a generated **SBOM** (CycloneDX or SPDX) produced from the
lockfile in CI and attached to each build, which is also what makes a vulnerability advisory
answerable: "are we affected?" becomes a query rather than an investigation.

**This still does not exist.** Two of the three landed on 2026-09-24 — the `scan` job in
`.github/workflows/verify.yml` runs `gitleaks` over the full history and `npm audit` over both
workspace roots — and the SBOM is now the **only** one of the three outstanding. It should land
next, because an advisory is only answerable against a bill of materials: without one, "are we
affected?" is an investigation rather than a query.

The first full-history scan (427 commits) found **three matches, all false positives** — the
RFC 6238 test-vector seed twice, and an empty `WIPAY_API_KEY=""` placeholder in a template. Each
was verified by reading the line, and each is exempted by name in `.gitleaks.toml` with its
reason. Nothing was deleted to quiet the scanner and no rule was weakened; the `.env.example`
exemption is pinned to the one historical commit rather than to the path, because an example file
is exactly where somebody eventually pastes a real key to show the format.

Two honest limits of what did land, so the register does not overstate it:

- `npm audit` is **non-blocking** for now (`continue-on-error: true`), so an advisory annotates
  the run without failing it. A gate that is red for reasons nobody can act on is one people
  learn to ignore. **Turn it blocking once the first pass is clean, and record the date here.**
- `gitleaks` **is** blocking from the first run. A committed credential is valid until it is
  rotated, so it is not a backlog item.

## 4a. The API sleeps, and nothing currently prevents that

Recorded because a workflow spent months implying otherwise. Render's free tier spins the API
down after ~15 minutes idle; the first request afterwards waits **40-70 seconds** (measured
2026-09-24: 52s cold, 0.37s warm).

The `Keep API warm` workflow did not prevent it and **reported success while not preventing it**.
GitHub fires a `*/10` schedule on a free runner roughly every three to five hours, and every run
paid a full cold start — the proof that the instance was asleep each time the job arrived. The ping
ended in `|| true`, so even a 90-second timeout recorded green. It is now an honest liveness check
(`API liveness`) that fails loudly on anything but 200 and states in its own header that it does
not keep anything warm.

**Decided 2026-10-01 (ADR 0026, finding H17):** at launch the API is a **paid instance that does not
sleep** — a launch requirement. Until then the share page wakes the API in the background when a client
opens it, so the accept path usually finds it awake; the external pinger below is not adopted. The two
options as they stood:

| Option | Cost | Note |
|---|---|---|
| Paid Render instance | A monthly fee | No spin-down. The eventual answer once anybody is paying us (Rule 10's trigger for leaving a free tier) |
| External uptime pinger (e.g. UptimeRobot) | Free tier, 5-minute interval | Would work, unlike ours. It is a **new third-party service** that must be recorded here, and it can reach a production endpoint — so it gets its own decision, not a quiet addition |

Until launch, the honest statement is still: **the prototype API sleeps, and the first visitor after an
idle period waits about a minute** — softened for the share page by waking the API when it opens. That is acceptable for a prototype and unacceptable at
launch, and it is written here so it is a decision rather than a surprise.

## 5. Where the secrets live

Named here so nobody hunts, and empty of values on purpose.

**The rebuilt application** (2026-10-09): every secret is listed, with who holds it and who never does, in
`docs/design/environments-and-operations.md` OP4, which A5 extends with the Spaces key (the API only), the quarantine
keys (the API's put-only key; the scan job's tag-gated read key), the Sentry key per environment, and the backup job's
keys. Each lives in its own environment's host settings, or the backup job's, except the owner's offline disaster key
(OP11). The table below is the **old application's**, until K1.

| Secret | Set in | Notes |
|---|---|---|
| `DATABASE_URL` | Render dashboard (`sync: false` in `render.yaml`) | The pooled Neon URL |
| `DIRECT_URL` | Render dashboard | The **unpooled** Neon host. Required: through the pooler, Prisma's migration advisory lock is recycled onto another connection and never released, which stranded a lock on every boot until the service stopped starting at all |
| `JWT_SECRET` | Render dashboard | The API refuses to boot in production without it, deliberately |
| `RESEND_API_KEY` | Render dashboard | |
| `WIPAY_API_KEY` | Render dashboard | Without it the callback hash is publicly computable, so the API rejects callbacks rather than trusting them |
| Each tenant's WiPay credentials (owed with W7) | **The database, encrypted** with a key held in configuration, never in the database — as `MFA_TOTP_KEYS` seals TOTP secrets | Per-tenant secrets, not ours (PRD R1.29). Because the tenant holds its own key, a callback alone is never trusted: our server confirms each transaction with WiPay (ADR 0029 E2) |
| `MFA_TOTP_KEYS` | Render dashboard | `<id>:<base64-32-bytes>` entries, newest **first**; the first is the key new secrets are sealed with, the rest stay so existing rows still open. The API refuses to start without it rather than storing second-factor secrets in plaintext (ADR 0021). A rotation is: prepend a new entry, let verifications re-seal, retire the old entry once no row names it |
| `WEB_ORIGIN` | Render dashboard | The Vercel URL |
| Vercel project settings | Vercel dashboard | Including **Root Directory**, which is a dashboard setting and therefore cannot be versioned — the one deploy-critical value not in this repository |

There is **no key-management service**. Every secret above lives in a dashboard, which means an
attacker holding both the database and the environment holds the second-factor secrets too. That is
a meaningfully harder bar than one database dump and it is not the same as a KMS; it is written here
rather than described as "encrypted at rest" and left to sound complete (ADR 0021).

No secret is ever committed, logged, put in a migration, or placed in a fixture (Rule 5). Local
development uses `.env` files, which are git-ignored, from the checked-in `.env.example`.

## 6. What this register says about our exposure

**For the rebuilt application** (2026-10-09, design A5), stated plainly:

1. **Every provider holding personal data is a United States company**, even where the data rests in Canada; US legal
   process can reach it (OP2). Error reports rest in the EU, and hold no personal data only as long as our redactor and
   Sentry's scrubbing both work (RG4).
2. **AWS sees uploads in plain form** for the minutes they wait to be scanned (RG3). A choice made for a store-enforced
   "never read unscanned", recorded rather than hidden.
3. **PDF receipts are not disarmed in release 1** — a residual the owner accepted on 2026-10-09 (RG3).
4. **No restore has been run yet.** The first drill is rehearsed on staging at B3 and run in production at F3 (OP6).
5. **Several provider capabilities are unconfirmed** from public pages and are checked before the build relies on them
   (`docs/design/third-party-register.md` §11).

**For the old application**, as written before the rebuild, stated plainly per Rule 17:

1. **WiPay has no local substitute.** If it withdrew, Jamaican card payments would stop until
   another gateway was integrated. Every other dependency here has a same-week replacement.
2. **Neon holds all tenant and customer data**, and **no restore has ever been tested**. A
   backup nobody has restored is a belief, not a backup (Rule 5).
3. **Two providers can break a deploy from their own dashboards**, outside version control —
   Vercel's Root Directory and every environment variable above.
4. **Free tiers are load-bearing until launch.** The API sleeps; the share page wakes it when opened,
   and at launch the API is paid and always on (ADR 0026). The scheduled workflow does not keep it warm
   (*corrected 2026-10-02, finding B24*).
5. **Personal data leaves Jamaica.** Neon, Resend and Vercel all process tenant and customer
   data outside the country. Whether the Data Protection Act, 2020 permits that, and on what basis, is
   read now from the Act's public text and **settled by the attorney before launch** (PRD §9 item 6; ADR
   0027 D14). It is a fact tenants may ask about, and this table is the answer. (*"That is normal and
   lawful" removed 2026-10-02, finding B8: a legal conclusion nobody had reached.*)
