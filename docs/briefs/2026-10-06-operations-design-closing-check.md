# Brief: closing check of the environments and operations design after its read (OR1-OR20)

**Agent:** general-purpose, **Sonnet** (Rule 16.9: mechanical — every item names the text to read, and the
expectations below are executed; the adversarial work was the Opus read, whose report is reproduced at the end of this
brief). **Under check:** `docs/design/environments-and-operations.md` as amended, with `docs/BUILD-PLAN.md` (B4, B8),
`docs/OWNER-ACTIONS.md` (OA1, OA2, OA25-OA28) and the pointers in `docs/design/api-layer.md`,
`docs/DATA-PROTECTION-READING.md`, `docs/THREAT-MODEL.md` and `docs/SERVICE-REGISTER.md`, at the commit that adds this
brief.

## What to do

1. From the repository root, run `python3 tools/run_brief.py docs/briefs/2026-10-06-operations-design-closing-check.md`
   and report its full output. Every check must PASS, and the tree must be clean afterwards.
2. For each of OR1-OR20 (in the report reproduced below), read the finding's recommendation, then the design's §15 row
   for it and the section that row names. Report **answered** or **not answered**, quoting the sentence that answers
   it. A finding is answered when the design states a rule a builder can follow for every part of the recommendation,
   or states plainly why a part is not taken. Check in particular:
   - OR1: Claude has its own account with write access only, no bypass, and the start approval is required for every
     author not on an allow-list;
   - OR2: the repository plan is decided, and **no GitHub workflow can deploy production** — the deploy gate is the
     console's Deploy page;
   - OR3: the start status comes from our own app, outside the pull request, bound to one branch, single use and
     expiring;
   - OR5: production deploys a digest that passed staging; production is in its own provider team; no
     repository-level secret is real;
   - OR6 and OR7: two encryption recipients, signed dumps, a store at a different company with a lock, the drill in a
     throwaway cluster;
   - OR9: the task text never enters git or a pull request;
   - OR15: the cost figures in OP2's table, OP3 and OP10 agree (add them up).
   Also report, for the reader's OP1-OP12 opinion table: is each "disagree" or "agree, with" line adopted, and where?
3. Do not edit, commit, stash, `git checkout --` or `git restore` anything. This is a reading check: there is no code,
   so there are no plants.

## Report

The runner's output; OR1-OR20, each answered / not answered, with its quoted sentence; the adoption lines; and a last
line, **closable** or **not closable**, for OR1-OR20 as a set. Nothing else.

## Expectations

Twenty findings in the design's answer table, each cited in the body too:

```check
$ grep -c "^| OR[0-9]* ·" docs/design/environments-and-operations.md
20
```

```check
$ for n in $(seq 1 20); do c=$(grep -oE "\bOR$n\b" docs/design/environments-and-operations.md | wc -l); [ "$c" -ge 2 ] || echo "OR$n only $c"; done; echo checked
checked
```

The amendment is declared, B8 exists, and the four new owner actions are present:

```check
$ grep -c "Amended the same day" docs/design/environments-and-operations.md; grep -c "^- \[ \] B8 ·" docs/BUILD-PLAN.md; grep -cE "^\| OA2[5-8] \|" docs/OWNER-ACTIONS.md
1
1
4
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

Reproduced from the read's reply (brief `docs/briefs/2026-10-06-operations-design-read.md`), unedited except that its
headings are one level lower and three GitHub documentation file names are unquoted, so the citation checker does not
read them as files of this repository. Every value in it is synthetic.

Independent read of `docs/design/environments-and-operations.md` at HEAD 67906dc

I ran `python3 tools/run_brief.py docs/briefs/2026-10-06-operations-design-read.md`. Its last line: **"Brief docs/briefs/2026-10-06-operations-design-read.md at HEAD 67906dc: 3 of 3 expectations hold."**

**What I could and could not check:**
- The design is not built yet, so most findings come from reading the design against the repository, the GitHub API and GitHub's own documentation. Those are marked **PLAUSIBLE**. Anything I observed directly is marked **CONFIRMED**.
- The read was read-only: I wrote no files and made no GitHub writes. I did not try a bypass that would need a push, merge or change to settings.
- The web was blocked by the egress proxy (403) for digitalocean.com, vercel.com, render.com and docs.github.com. Only GitHub-hosted sources were reachable, and I read GitHub's documentation source from raw.githubusercontent.com/github/docs.
- So every DigitalOcean and Vercel capability claim below is **UNVERIFIED (web blocked)**, as are the design's own price and region claims.
- The tree did not change under me.

---

### Findings

#### OR1 — BLOCKER — Claude's work already reaches `main` under the administrator's own identity, so the merge gate and the start gate do not hold

**Where:** §9 (OP8) lines 383-387 ("The owner's own pull requests are not Claude's work, and do not need a signature"), lines 399-405 ("Claude's GitHub app can push branches … nothing more"; "The administrator's own pull requests … merge through the administrator's bypass"), and §12 line 485.

**Evidence (all CONFIRMED):**
- In this Claude session, `gh api user` returns `{"login":"yattapang","type":"User"}`. The repository reports `permissions: {"admin":true,…}`.
- So Claude acts as the owner, with admin rights. It is not acting as a separate, limited "Claude GitHub app".
- PR #1 and PR #2 were opened by `yattapang` with `author_association: OWNER`, and their commits are authored by `yattapang`. PR #1's body ends "Generated with Claude Code", and PR #2's body reads "I told the owner a patch … was wrong". Both are Claude's work and both look like the owner's.
- `origin/main` has 50 commits, and the `Co-Authored-By: Claude` trailer appears 52 times in its messages. Only 2 pull requests have ever existed, so Claude-assisted commits reached `main` by direct push under the owner's identity.
- The design's merge gate assumes two things this contradicts:
  - CI can tell Claude's pull requests apart from the owner's. It cannot, because both show the same login.
  - Claude holds a credential that can only push branches. It does not; it holds the admin's credential.

**The path:**
1. A Claude session (as `yattapang`) opens a pull request.
2. CI treats it as "the owner's own", so no signature is needed.
3. The administrator's bypass (lines 402-405) is available to that same identity. It allows a merge without review, or a direct push.

That reaches `main` with no start approval and no merge review. The ruleset does not exist yet, so the final push or merge under it is **PLAUSIBLE**. The identity facts are **CONFIRMED**, and today's direct pushes to `main` show the pattern.

The only thing standing in the way today is not part of the design. Anthropic's GitHub proxy refused some admin and Actions API paths (I saw 403 "not permitted through this proxy" on `/environments` and `/actions/permissions`). That proxy is not the owner's control and should not be relied on.

**Recommendation:**
- Claude may act only through a dedicated identity with **no admin role and no bypass**: a GitHub App installation or a machine user, write-only to non-`main` branches.
- CI recognises Claude's pull requests by that identity. The default flips: **every** pull request needs a valid start signature unless its author is on an explicit allow-list (the administrator, Dependabot).
- The administrator's bypass is limited to "pull requests only", and the administrator never signs in to a Claude session with their own GitHub account.
- This needs an owner action (see OR17).

#### OR2 — BLOCKER — The deploy gate disappears when the repository goes private, which is planned for exactly when production starts

**Where:** §9, the deploy gate (lines 409-415), and §11 line 469 (which assumes a private repository).

**Evidence (CONFIRMED from GitHub's documentation source):**
- deployments-and-environments.md: "If you are on a Free, Pro, or Team plan, required reviewers are only available for public repositories."
- manage-environments.md: on the Free plan, "If you convert a repository from public to private, any configured protection rules or environment secrets will be ignored". Environment secrets in private repositories need Pro or higher.
- Rulesets for an organisation's repositories need Team or Enterprise (about-rulesets.md).
- The same documentation says "By default, administrators can bypass the protection rules" on environments.
- `docs/BRIEF-STATUS.md` lines 100-109 record the owner's decision: go private "**before the first paying tenant**". OA24 also moves GitHub "into the business's name", which means an organisation.
- So at F3 the required reviewer on `production` stops existing on any plan below Enterprise. Environment secrets then go to any run on an allowed branch, so `deploy-production` runs without an approval.

**Recommendation:**
- Decide now, as an owner action: GitHub Enterprise, or keep the repository public, or take the deploy approval out of GitHub's environments.
- The last option could be a signed approval from the console that the deploy job checks, matching the start gate, with the deploy credential held where only that check releases it.
- Whichever is chosen, untick "Allow administrators to bypass".

#### OR3 — MAJOR — The start gate's signature check can be defeated from inside the pull request, and one approval can be replayed for any task

**Where:** §9, step 6 (lines 383-387): "the console's **public** key, which is committed in the repository". Also step 4 (line 379) and the tests in §14 (lines 552-556).

**Evidence:**
- A `pull_request` workflow runs the workflow file and the files from the pull request itself. CONFIRMED that Claude's credential can change `.github/workflows/*`: PR #1 changed `verify.yml`, and four Claude-trailered commits on `main` touch `.github/workflows/`.
- So a Claude pull request can do any of three things:
  - replace the committed public key with its own and sign its own "approval";
  - edit the check's job so it always passes;
  - rename the check.
- Each turns the CI part of "enforced, not just recorded" into a no-op. Only the administrator noticing during review would stop it.
- Ruleset "required workflows", which run from a pinned ref, are documented as an organisation feature ("you specify the source repository … in your organization settings"). They are not available to the personal-account repository this is today.
- **Replay:** the signature covers only (task number, text). There is no expiry, no single use, and no binding to a branch or pull request.
  - The repository is public, so every used signature becomes public once a pull request carries it.
  - Any later pull request can carry an old, valid (number, text, signature).
  - So the check proves "some task was once approved", not "this work was approved". Line 389 concedes the scope part but not the replay.
- **Classification:** the design never says how CI tells a "Claude pull request" from others. That includes Dependabot (§12 line 498).

All of this is **PLAUSIBLE** (not built). The two facts it rests on are CONFIRMED.

**Recommendation:**
- Keep the verifier's trust anchor where the pull request cannot change it. For example: a repository/environment variable editable only by the administrator, or a check run by the console or an App against the pull request (a GitHub status from an outside service that the ruleset requires by name and source).
- Bind the signature to the branch name or pull request number plus an expiry, and record its use in the console so a second use is refused.
- Add plants: a pull request that swaps the public key, and one that reuses an earlier approval.

#### OR4 — MAJOR — Vercel deploys `main` to production on every merge, so web changes skip the deploy gate; and the staging web address breaks the cookie rules

**Where:**
- §2 line 95 (staging is "a Vercel preview address") against line 99 ("staging pages call `api.staging.pryvis.com` from a staging web origin").
- §6, steps 4 and 7.
- §9 line 413 ("Only `main` may deploy to production").

**Evidence:**
- **Auto-deploy.** Vercel's Git integration makes the production branch (`main`) a production deployment on push by default (standard Vercel behaviour; UNVERIFIED today because the web was blocked). The design never turns this off and never moves the web deploy into `deploy-production`.
  - So any merged web change goes live on pryvis.com without the deploy approval. Rule 15 says "production changes only on the administrator's approval".
  - The web build can also reach production before an API change it depends on.
  - Every pushed branch, Claude's included, also gets a preview build.
- **Staging address and cookies.** AP2 (api-layer lines 73-90) sets the session cookie host-only on the API, with `SameSite=Strict`, and requires an exact `Origin`.
  - A page served from `*.vercel.app` is cross-site to `api.staging.pryvis.com`, so the cookie is never sent on its requests.
  - Also, Vercel's `main` is production, not a "staging" build of `main`.
  - So staging cannot use the cookie flow the design says it mirrors. A smoke check run outside a browser would pass anyway.

**Recommendation:**
- Turn off Vercel's Git auto-deploy for production, or use an ignore-build step. Deploy the web in `deploy-production` (`vercel deploy --prebuilt --prod`) from the same approved commit.
- Give staging a custom domain on pryvis.com, such as `staging.pryvis.com` (a Vercel custom environment or a branch domain). Add it to OA2's DNS records.
- Add a browser sign-in to the staging smoke checks.

#### OR5 — MAJOR — "Deploys the exact commit that passed staging" has no mechanism, and the production deploy path has ways around the GitHub gate

**Where:** §6 step 7 (lines 261-262), §9 lines 411-413, §2 line 89 ("A staging key that leaks opens nothing in production") and line 82.

**Evidence (PLAUSIBLE; DigitalOcean behaviour UNVERIFIED, web blocked):**
- **Builds from a branch.** App Platform's GitHub source builds from a *branch* head. So a deploy triggered after a later merge builds code that was never approved for deployment.
- **Auto-deploy on push.** The app specification's `deploy_on_push` is not required to be off for production.
- **Dashboard.** DigitalOcean's own dashboard can deploy or roll back outside GitHub, and nothing is recorded in the platform audit trail.
- **Team-wide tokens.** DigitalOcean API tokens are scoped to a *team*, and custom scopes are by resource *type*, not by app (UNVERIFIED).
  - A DigitalOcean "project" is a folder, not a security boundary.
  - So if staging's automatic deploy (§6 step 4) uses a token in the same team, that token can deploy or edit the production app with no approval.
- **Repository-level secrets.** A workflow on a pushed branch runs from the branch's own file. Claude can push one, as CONFIRMED in OR3.
  - Such a workflow receives every repository-level secret before any merge or approval.
  - The design restricts only *environment* secrets (line 559).

**Recommendation:**
- Build once into a registry, record the image digest when the staging smoke checks pass, and have `deploy-production` deploy that digest after checking it is an ancestor of `main`.
- Take no deploy commit from free-text `workflow_dispatch` input.
- Set `deploy_on_push: false` for production.
- Put production in a **separate DigitalOcean team**.
- Staging deploys through DigitalOcean's own integration, so there is no staging token in GitHub.
- No secrets at repository level except synthetic ones.
- Add an OA to record these settings.

#### OR6 — MAJOR — The monthly restore drill needs the "offline" private key inside a cloud job; and losing that key loses every backup

**Where:** §5 line 226 ("Never held by: Every service"), §7 step 1 of the drill (line 303: "decrypt it with the owner's key, in a short-lived job"), and §12 line 483.

**Evidence (from reading the design):**
- The two statements contradict each other. Either the private key goes into a production-region job every month, or the dump is decrypted on the owner's machine, which takes production data out of production (OP1).
- The design does not say which.

**If the key is lost:**
- Every nightly dump is unreadable.
- Point-in-time restore still covers "undo the last hours" inside the provider. But the protection against "losing the provider, the project, or anything older than the window" (§7 table) is gone until a new key pair has produced 35 days of backups.
- No one finds out until the next drill, which itself needs the key.
- If the owner is unavailable, no one can restore at all.
- Line 483 stores the recovery codes "with the backup decryption key", so one theft or fire takes both.
- "Offline and in a password manager" contradicts itself if the password manager syncs to the cloud.

**Recommendation:**
- Encrypt every dump to **two** recipients: the owner's offline disaster key, and a separate drill key. The drill key is released only to a drill job that runs under an approved, in-region workflow, and it is rotated.
- Escrow the disaster key (a sealed copy with the attorney or OA4's second person, or a split).
- Keep the recovery codes apart from the key.
- State in OP4 where decryption happens.

#### OR7 — MAJOR — Backups on the same provider do not survive "losing the provider"; "add but not delete or overwrite" is not specified; and unauthenticated dumps let the bucket credential plant SQL that the drill runs inside production

**Where:** §7, the table (line 282: protects against "Losing the provider, the project"), step 3 (line 289), and drill steps 1-2.

**Evidence:**
- **Same provider.** OP2 item 3 puts the backups in Toronto object storage, which most likely means DigitalOcean Spaces in the same team. Losing the account, or the account being compromised, takes the live database and the backups together.
- **No write-only mechanism.** On S3-style storage, an ordinary `PutObject` overwrites an existing key. "Add but not overwrite" needs Object Lock, or versioning plus a policy refusing version deletion. DigitalOcean Spaces key permissions may not express write-without-delete at all (UNVERIFIED).
- **Unsigned dumps.** Dumps are *encrypted* to a public key, which by definition anyone can use. They are not *signed*. So:
  1. Someone holding only the "harmless" write-only credential uploads a newer "latest" object, encrypted to the owner's public key.
  2. The drill takes "the latest nightly dump" (line 303) and restores it "inside the production project". A plain or custom dump is arbitrary SQL, for example `CREATE FUNCTION … SECURITY DEFINER`, `ALTER ROLE …`, or `GRANT`.
  3. Roles are cluster-wide, so a temporary database in the production cluster gives that SQL reach over production's roles.
  4. The manifest is unsigned too, so the counts can be made to match.
- This is **PLAUSIBLE**: a design-level path, not executed.

**Recommendation:**
- Put backups with a different company and account (a Canadian region), with Object Lock in compliance mode for 35 days.
- The backup job signs each dump and manifest with its own key. The drill verifies the signature before decrypting.
- Restore into a **separate, throwaway cluster**, never a database in the production cluster.

#### OR8 — MAJOR — "The nightly backup … does not run" cannot be detected as designed, and backups can expire to zero without an alert

**Where:** §8 (OP7) line 335, and §7 step 5.

**Evidence (from reading the design):**
- The watch is "the job table (AP10)". But the backup is "the host's scheduled job" (line 285) running with a **read-only** credential (line 298), so it never writes the job table.
- A job that never starts raises nothing.
- The bucket's 35-day expiry keeps deleting old copies, so 35 days of silent failure leaves no backups at all.

**Recommendation:**
- Add a heartbeat ("dead-man's switch") check in the uptime monitor that each successful run pings. Alert when the newest object in the bucket is more than 26 hours old.
- Plant: disable the schedule and see the alert fire.

#### OR9 — MAJOR — The start gate puts the task text into git and GitHub, which defeats SF8's deletability and repeats option B's own objection

**Where:** §9 step 6 (lines 383-386) and the option table (line 368: B "copies the task text into another system").

**Evidence (from reading the documents):**
- To check "task text matches the approved fingerprint", the text has to be in the pull request or a committed brief (Rule 16.7 commits briefs).
- SF8 (support-and-feedback.md lines 368-371) names **deletability** — "Issues live in a database, not in git history, so a miss can be removed" — as one of only two things behind a guard it admits misses paraphrases and names.
- Under OP8, a miss lands in public git history and PR bodies, where it cannot be removed.

**Recommendation:**
- The pull request carries the task number, the fingerprint and the signature, never the text. CI checks the fingerprint without the text.
- Claude receives the text only in the session.
- Or state the trade-off and amend SF8 through Rule 23.

#### OR10 — MAJOR — Staging on a DigitalOcean "development database" is not production's product, so the Toronto check can pass or fail on the wrong thing; and the check leaves out the backup role

**Where:** §4 line 187 ("a development database", about US$12), §3 lines 141-148 and 156-157 ("same provider and settings").

**Evidence:**
- App Platform development databases are a different, restricted product from a managed cluster (role powers UNVERIFIED, web blocked).
- OP2 item 1, the privilege model's migrations, is run "on staging". The privilege model's "Setting up a deployment" steps 1-4 need CREATEROLE, database ownership, and `WITH SET TRUE` grants.
- Item 1 never tests the one role OP6 needs: a **BYPASSRLS** backup role.
  - On PostgreSQL 16 a non-superuser can grant BYPASSRLS only if it holds it itself.
  - Without such a role, `pg_dump` under FORCE row-level security refuses the tables.
- The US$12 figure assumes the development-database product. The smallest managed cluster is about US$15 on its own (§4 line 182).

**Recommendation:**
- Staging uses the smallest **managed cluster** (about US$20-27 a month with the app).
- Add to OP2's check: create the backup role, run a full `pg_dump` with it, and restore that dump through the drill.

#### OR11 — MINOR — The claims about deletion and "no copies" are incomplete

**Where:** §7 lines 323-325 and §2 lines 74-75.

**Evidence (from reading the design):**
- "At most 35 days" holds for live data, provided the point-in-time window is no longer than 35 days (the window length is UNVERIFIED).
- But restoring a backup after an incident brings back records erased since that backup, and the deletion request is silently undone. Nothing replays the deletions.
- §2 says the drill is the only copy ever taken. That leaves out point-in-time restores (which create a new cluster), the yearly rebuild-drill project, and the provider's own daily backups.

**Recommendation:**
- Keep a ledger of erasures (identifiers only) that the restore runbook replays.
- List every kind of copy and its lifetime.

#### OR12 — MINOR — The proposed test does not prove "Vercel holds no personal data"

**Where:** §3 lines 132-139 and §14 lines 550-551.

**Evidence:**
- "No page fetches tenant data on the server" does not cover:
  - request paths and query strings in Vercel's logs. For example, an email link to the web app (AP2 line 81) carrying a reset or verification token, or an address;
  - `rewrites` that proxy through Vercel;
  - middleware that reads cookies;
  - analytics.
- How a test would recognise "tenant data" is left to the builder.

**Recommendation:**
- Use a static export (`output: 'export'`) and assert that the build contains no server functions.
- Email links carry tokens in the URL fragment, not the query string.
- Turn off Vercel Analytics, or list it.

#### OR13 — MINOR — Production smoke checks issue real documents, and two production credentials in GitHub are not defined

**Where:** §6 step 8 (line 263) and line 273.

**Evidence (from reading the design):**
- "A synthetic quote is priced and issued" in production creates numbered, immutable records on every deploy. It may send email, feeds the reconciliation and the platform's figures, and may hit Free-tier entitlement limits.
- The smoke tenant's login, and whatever credential lets the workflow "write a line to the platform audit trail", are production credentials held in GitHub. Neither is specified.

**Recommendation:**
- In production, smoke-check read-only paths plus a draft that is never issued.
- Record the deploy from the API at start-up (the version, plus approver metadata passed in by the deployment) rather than giving GitHub a database credential.

#### OR14 — MINOR — The secrets inventory and the rotation table are missing keys

**Where:** §5 table (lines 219-226) and §12 key table (lines 490-495).

**Missing from both:**
- the console's approval-signing key, which is the start gate's root of trust;
- the backup job's bucket credential;
- the DigitalOcean and Vercel deploy tokens;
- the smoke-test credential;
- the audit-trail credential;
- the drill key (OR6).

Also missing: whether staging's console has its own signing key, and whether CI trusts it. If CI trusts it, anyone with access to the staging console can sign approvals.

#### OR15 — MINOR — The cost figures do not add up

**Where:** §3 line 126 against §4 lines 181-182.

**Evidence (CONFIRMED by arithmetic):**
- §3 gives option C "about US$30-45 a month for the API and database (§4)".
- §4 gives API US$10-25 plus database US$15, which is **US$25-40**.
- §4's total of US$45-60 with Vercel matches 25-40 + 20, so §3 is the odd one out.
- With OR10's change, staging rises above US$12, which OA1 also quotes.

**Related (PLAUSIBLE, Vercel's terms UNVERIFIED):** Vercel's Hobby ban on commercial use is generally read to cover any site promoting a product for sale. So "Pro can wait until the site shows prices" (line 193) may already be wrong for the live pryvis.com marketing site.

#### OR16 — MINOR — Render, Neon and the US are still assumed elsewhere, and §14 does not schedule the updates

**Still assuming them:**
- api-layer.md line 46 ("the API is on Render") and line 53;
- DATA-PROTECTION-READING.md lines 210-211 (Neon and Render, United States);
- THREAT-MODEL.md line 41 (T8) and line 53 (DigitalOcean is absent);
- SERVICE-REGISTER.md lines 34-36 and 171-179 (Vercel on Hobby, Render and Neon variables).

**Also:** OP2 line 154's "free hosted database for … CI" contradicts `verify.yml`, which uses a `postgres:16` service container. That container is the right choice, because the race suite needs a superuser.

**Not stated for the region analysis:** DigitalOcean is a US company, so data in Toronto is still within reach of US legal process. This belongs in the s. 31 analysis for the Commissioner (OA22).

#### OR17 — MINOR — Owner actions are missing

OWNER-ACTIONS has only OA1, OA2 and OA24 from A4. Only the owner can take these, so each needs an OA:
- the GitHub plan and visibility decision (OR2);
- creating the Claude identity with no admin role (OR1);
- configuring the ruleset and the `production` environment, including unticking administrator bypass and turning off "allow Actions to approve pull requests";
- Vercel Pro;
- generating and holding the backup key pair, and its escrow;
- a separate DigitalOcean team for production (OR5);
- the staging web domain (OR4).

#### OR18 — MINOR — The build order leaves gaps a builder would have to fill

- B4's Maintenance page needs the staff console and staff MFA. The repository records these as not built, with staff MFA a launch blocker (B7, PRD W10), and B7 comes after B4.
- Nothing says how Claude's work is approved before B4 exists.
- B3's "first restore drill", and "every runbook rehearsed before F3", come before production exists (created at F3, line 194). So the production backup job, bucket and drill are never rehearsed before real data arrives.

#### OR19 — MINOR (PLAUSIBLE) — Drill and rollback tests that will not work as worded

- **The rollback test** ("the previous code run against the new schema"). The previous release's own suite includes the staleness check on `schema-objects.json`, which fails against *any* new migration. So the test needs a defined subset, and the builder has to invent it.
- **The drill's least-privilege check on a restored database.** Database-level permissions, including the `REVOKE TEMPORARY` on the database (privilege model step 4), are dumped only with `pg_dump --create`. Without it, the check reports TEMPORARY and the drill fails falsely, inviting a manual "fix".
- **"Migrations, then the latest dump"** for the yearly rebuild. Loading a full dump on top of a migrated schema collides with the objects already created. A data-only load fires the immutability and balance triggers. The real order is: login roles first, then a full restore.

#### OR20 — MINOR — Unstated GitHub hardening

The design never states:
- least-privilege `permissions:` for workflows (`verify.yml` has none; the repository default is UNVERIFIED because the proxy blocked `/actions/permissions`);
- "Allow GitHub Actions to create and approve pull requests" left off;
- no `pull_request_target` workflows and no self-hosted runners. Neither exists today; I checked `.github/workflows`.

It also says Claude's app "cannot approve" (line 400). With pull-request write access an app *can* submit an approving review. That review is harmless only because code-owner review is required, so the design should say that.

**Where I found nothing:**
- **Forked pull requests:** they get no secrets, and first-time contributors need approval.
- **The deployment branch rule "only `main`"** itself is sound, as long as it is set as a *branch* rule (so a tag named `main` does not match).
- **Spend caps and alerts:** I found nothing wrong.

---

### OP1-OP12: would I recommend the same?

| | Verdict | Alternative, where I disagree |
|---|---|---|
| OP1 | **Agree** | Keep the rule as written. Fix the copy list (OR11) and say where the drill decrypts (OR6). |
| OP2 | **Agree** | Toronto is right, conditional on the B1 check. Add the backup role to that check (OR10), and note DigitalOcean is a US company in the s. 31 analysis. |
| OP3 | **Disagree, in part** | Staging on the smallest *managed cluster* (about US$20-27 a month), not a development database. Correct §3's figures to US$25-40. |
| OP4 | **Agree** | Complete the secrets inventory (OR14). |
| OP5 | **Disagree** | Build once, then deploy the same image digest to staging and production. Vercel's production deploy happens only inside `deploy-production`. Production smoke checks are read-only. |
| OP6 | **Disagree** | Encrypt to two recipients (escrowed offline key plus a drill key). Sign every dump. Store on a different provider with Object Lock. Restore in a throwaway separate cluster. Add a heartbeat alert. |
| OP7 | **Agree** | Add the heartbeat for the backup and an alert on the newest backup's age (OR8). |
| OP8 | **Disagree** | Claude acts only as a non-admin identity with no bypass. The signature check's trust anchor lives outside the pull request, and approvals are bound to one branch and used once. Decide the GitHub plan or visibility, or move the deploy approval to a signed console approval (OR1-OR3, OR9). |
| OP9 | **Agree** | — |
| OP10 | **Agree** | Correct the development-database and CI rows (OR16). |
| OP11 | **Agree** | Add the missing keys (OR14). Keep the recovery codes apart from the backup key. |
| OP12 | **Agree** | — |

**Verdict: the design is sound after the named changes.** OR1 and OR2, which affect all three gates, must be resolved before B4 and before the repository goes private. OR3-OR10 must be resolved before B1-B3 build what they describe.

`git status --short` (run at HEAD 67906dc): empty — no output.
