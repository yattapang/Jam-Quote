# Brief: closing check of the third-party register design after its read (RR1-RR17)

**Rule 0 first:** read `docs/RULES.md` and state which rules apply before starting. **You have no subagents; you do
this work yourself** (Rule 16.6).

**Agent:** general-purpose, **Sonnet** (Rule 16.9: mechanical — every item names the text to read, and the expectations
below are executed; the adversarial work was the Opus read, whose report is reproduced at the end of this brief).
**Brief step:** build plan A5 (`docs/BUILD-PLAN.md`), phase A.
**Under check:** `docs/design/third-party-register.md` as amended, with `docs/SERVICE-REGISTER.md` (§0, §6),
`docs/OWNER-ACTIONS.md` (OA1, OA6, OA10, OA12), `docs/design/environments-and-operations.md` (OP1's pointer, OP4's
rows), `docs/DATA-PROTECTION-READING.md` (§2's pointer) and `docs/THREAT-MODEL.md` (the hostile-upload row), at the
commit that adds this brief.
**Do not touch:** anything. This is a reading check.

## What to do

1. From the repository root, run `python3 tools/run_brief.py docs/briefs/2026-10-09-register-design-closing-check.md`
   and report its full output. Every check must PASS, and the tree must be clean afterwards.
2. For each of RR1-RR17 (in the report reproduced below), read the finding's recommendation, then the design's §12 row
   for it and the sections that row names. Report **answered** or **not answered**, quoting the sentence that answers
   it. A finding is answered when the design states a rule a builder can follow for every part of the recommendation,
   or states plainly why a part is not taken. Check in particular:
   - RR1: image and PDF decoding happens in a separate files worker, and the design lists what that worker holds and
     states its residual;
   - RR2: the PDF residual is restated in full, and the owner's decision (rasterise) is recorded with its date;
   - RR3: both of AWS's bucket-policy statements are named, the organisation-level tag control is stated, the API's
     key is `PutObject` only, the worker's delete permission is declared, and a test plants a pre-tagged object;
   - RR4: every Spaces key is named in RG2 **and** in OP4's table, the drill has a file target, and every copy of a
     file is listed;
   - RR5: versioning is off, with the reason, and the swap fallback is withdrawn with the reason;
   - RR6: the uptime provider is decided by the owner with its date, and the commercial-use evidence quotes the
     vendors' own pages;
   - RR7: staff reach Sentry only through the console, the Team plan's trigger is the console link, and the
     "second staff member" trigger is withdrawn;
   - RR8: the sub-processor list includes the Canadian company and Vercel, locations say "at rest", and OA10 carries
     the question about the Canadian company;
   - RR12: the 76-day Permanently Delete tag, the 14-day recoverable window, the role restriction, and the tenant
     created in Canada are each stated, in RG6 **and** in OA12;
   - RR14: the rolling copy keeps both promises (every live file has a copy younger than 35 days; a deleted file's
     last copy expires within 35 days).
3. **Add up the costs** in RG9's "What this design adds" table, and check the totals against the sentence beneath it,
   against OA1 in `docs/OWNER-ACTIONS.md`, and against OP3's "about US$45-60" in
   `docs/design/environments-and-operations.md`. Report any figure that does not agree.
4. Report, for the read's RG1-RG9 opinion table: is each "disagree" or "agree in part" line adopted, and where?
5. Do not edit, commit, stash, `git checkout --` or `git restore` anything. This is a reading check: there is no code,
   so there are no plants.

## Report

The runner's output; RR1-RR17, each answered / not answered, with its quoted sentence; the cost check; the adoption
lines; and a last line, **closable** or **not closable**, for RR1-RR17 as a set. Nothing else.

## Expectations

Seventeen findings in the design's answer table, each cited in the body too:

```check
$ grep -c "^| RR[0-9]* ·" docs/design/third-party-register.md
17
```

```check
$ for n in $(seq 1 17); do c=$(grep -oE "\bRR$n\b" docs/design/third-party-register.md | wc -l); [ "$c" -ge 2 ] || echo "RR$n only $c"; done; echo checked
checked
```

The amendment and both owner decisions are recorded, and nothing still awaits the owner:

```check
$ grep -c "Amended the same day to answer its independent read" docs/design/third-party-register.md; grep -c "Decided by the owner, 2026-10-09: B" docs/design/third-party-register.md; grep -c "Decided by the owner, 2026-10-09: UptimeRobot" docs/design/third-party-register.md; grep -ci "awaiting the owner" docs/design/third-party-register.md
1
1
1
0
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

Reproduced from the read's reply (brief `docs/briefs/2026-10-09-register-design-read.md`, at `20d652c`), unedited
except that its harness indentation is removed.

> Independent read of docs/design/third-party-register.md (A5), brief docs/briefs/2026-10-09-register-design-read.md. I've finished the read: the design is sound to build from once the changes in RR1–RR8 are made, together with the minor ones below. Nothing in the repository was edited, committed, stashed or restored.
>
> BEFORE STARTING
> Runner output (run on a clean tree): "HEAD 20d652c … PASS 1-4 … Brief docs\briefs\2026-10-09-register-design-read.md at HEAD 20d652c: 4 of 4 expectations hold."
> Rules applied: 0, 1.10 (the plan is attacked before anything is built from it), 4 (signed URLs, staff access), 5 (uploads are hostile until proven; no personal data in logs; backups; routes declared), 10, 13, 15, 16.3, 18, 20 (public claims; the privacy notice names its processors), 21.4-21.6, 24.6. ADRs read: 0021, 0032, 0033, 0034, 0035.
> What "confirmed" means here: this is a read of a design, so there was no code to plant a defect in. CONFIRMED findings rest on the quoted repository line or on the vendor's own page, fetched 2026-10-09. PLAUSIBLE findings are reasoned and could not be executed, because I have no AWS, DigitalOcean, Sentry or Microsoft account.
> The working tree changed during the read: the coordinator relayed that the builder modified docs/BRIEF-STATUS.md, docs/MISTAKES.md, new-app/CLAUDE.md and tools/pg-local.sh. git status shows exactly those four, and HEAD is still 20d652c. I wrote nothing inside the repository; my scratch files are in the session scratchpad.
>
> FINDINGS
>
> RR1 · major · RG3 step 6 (lines 179, 209); OP3 line 220; OP4 lines 271-275 · CONFIRMED by reading.
> The image disarm step decodes hostile bytes inside the process that holds every production secret.
> - The scan job "disarms the file", and OP3 runs the API as "Nest with Prisma and a job worker in one process". That process holds the deploy tokens, the console's approval-signing key, the GitHub App key, the database login and the MFA sealing keys.
> - The design's only answer to "an image that exploits a decoder" (line 163) is the signature scan, and §11 line 513 concedes "the scanner knows only what it knows".
> - Failure: an image-decoder exploit the scanner does not know (the usual case for decoder bugs) runs code with production's deploy and approval keys. This residual is not stated anywhere.
> - Recommendation: run decoding in a separate worker that holds only a quarantine read key and a put key, or use a sandboxed decoder. State the residual.
>
> RR2 · major · lines 137-139, 216-220, 511-512 · the residual is understated (PLAUSIBLE as to client behaviour).
> The owner accepted a residual described as a PDF reaching "a staff member's browser". As designed, that is not what happens.
> - Receipts are served with Content-Disposition: attachment. That downloads the file, and it then opens in the operating system's default PDF handler (Acrobat, for example), not necessarily the browser's sandboxed viewer. "The staff console's instruction" to use the browser viewer is not enforced.
> - The residual also omits risks that need no exploit at all: PDF JavaScript in desktop readers, embedded files, launch actions, phishing links.
> - The staff member opening receipts is the owner, who holds every administrator account (production's team, AWS, the disaster key), which widens the blast radius.
> - Recommendation: restate the residual and put it back to the owner, or show receipts to staff through a sandboxed viewer, or rasterise them.
>
> RR3 · major (a guard weakness, not a user-visible defect) · lines 193, 203-208, 357, 475-476.
> The "store enforces never read unscanned" claim relies on only half of AWS's documented control.
> - AWS's tag-based access page (docs.aws.amazon.com/guardduty/latest/ug/tag-based-access-s3-malware-protection.html) gives two statements: NoReadUnlessClean, and OnlyGuardDutyCanTagScanStatus, which denies s3:PutObjectTagging on the GuardDutyMalwareScanStatus key to anyone except GuardDuty's role. It adds: "If you have an organization that was created by using AWS Organizations, you must enforce that no one can modify the tags added by GuardDuty." RG7 uses an AWS Organization.
> - The design names neither the second statement nor the organisation-level control.
> - The API's "put-only" key is safe only if it is literally s3:PutObject alone. AWS's PutObject API page says setting a tag at upload requires s3:PutObjectTagging.
> - The only test plants the removal of the read condition. Nothing tests that a pre-tagged NO_THREATS_FOUND object, written by the API key or the owner's role, is refused. Without that, the job's tag poll could release an object before GuardDuty has scanned it.
> - The scan job's key is described as "reads tags, and contents only when clean", but the job also deletes quarantine copies, so it needs s3:DeleteObject, which is not declared.
> - Recommendation: add the deny-tagging statement and the organisation-level control, add a planted test for a pre-tagged put, and declare the delete permission.
>
> RR4 · major · RG2 lines 133-134 and 144-153; OP4 line 274; OP1 lines 83-91.
> The files-bucket key and the files backup contradict each other.
> - RG2 and the new OP4 row say the files-bucket key is "The API service only / never: Staff, other jobs".
> - Yet the nightly backup job, which OP6 makes a separate scheduled job with its own settings, must read every object in that bucket. The restore drill must restore files and replay the erasure ledger against them somewhere.
> - Neither credential exists in OP4, and the drill's file target is unstated. DigitalOcean's limits page says Spaces keys come only as "Read" or "Read/Write/Delete" and "can only be created and managed through the DigitalOcean Control Panel", so an automated drill cannot mint a key for a throwaway bucket.
> - OP1's "complete list, so that 'no copies' is checkable" still lists database copies only. It omits the Spaces old versions, the plain quarantine copies, the nightly files archive and the drill's restored files.
> - Recommendation: declare a read-only backup key and a standing drill bucket with its own key (or another mechanism) in OP4, and extend OP1's list.
>
> RR5 · major · lines 119, 135-136, 125-127.
> The 35-day deletion promise for files rests on a lifecycle feature DigitalOcean does not list.
> - DigitalOcean's S3-compatibility page (docs.digitalocean.com/products/spaces/reference/s3-compatibility/, verified 22 June 2026) says: "Bucket Lifecycle: Supported for time-based expiration and removing incomplete multipart uploads." Expiring noncurrent (replaced or deleted) versions is not listed.
> - If it is unsupported, every deleted or replaced file survives indefinitely as an old version. That breaks ADR 0035 decision 7 ("Disposal is irreversible") and RG2's "deletion means the same thing everywhere".
> - Option A's "Against" column lists only Object Lock and encryption as unconfirmed. The B5 check covers this, but no fallback is stated.
> - The swap fallback ("the file backup moves to Spaces") needs Object Lock on Spaces to keep OP6's promise, and the same page does not list Object Lock.
> - Recommendation: state now that versioning stays off if noncurrent expiry fails at B5, since the backups cover recovery. Fix the swap paragraph.
>
> RR6 · major · RG5 lines 288-297; §10 line 441.
> RG1 test 4 (commercial use allowed on the plan) was applied backwards.
> - UptimeRobot was rejected on the strength of a third-party summary. UptimeRobot's own terms (uptimerobot.com/terms) say: "UptimeRobot is available for any use, including commercial and business use."
> - The recommended Better Stack's own pricing page (betterstack.com/pricing) labels its free plan "Free for personal projects".
> - If that label binds, production's cost rises by about US$29-34 a month from day one (the same page says paid plans start "at just $29", with a responder licence at $29-34). That also changes RG9's totals and OP7's phone alert.
> - Recommendation: read Better Stack's service terms now, not at account opening. If the label binds, use UptimeRobot's free plan for the four monitors (its free column lists no heartbeat) plus a paid heartbeat service, or buy Better Stack's paid plan from the start. Carry the cost into RG9.
>
> RR7 · major · RG4 lines 238, 265-266 against SF5 lines 273-277 (finding SR10).
> RG4 contradicts SF5 on how staff reach error events.
> - SF5 says staff open an error event "through the console, which checks answer_support and records the access".
> - Sentry's own plan table (sentry.io/pricing) shows "API" ticked for Team and Business, not Developer. So the console link cannot be built on the plan RG4 chose.
> - RG4's trigger buys Sentry seats when a second staff member "needs access". That gives direct access, bypassing the capability check and the access record that SR10 added.
> - No Sentry read token appears in OP4.
> - Recommendation: either buy Team when the console link is built and declare its token in OP4, or amend SF5. Drop the "seat for second staff member" trigger.
>
> RR8 · major · RG8 lines 396-409; register §0; DATA-PROTECTION-READING lines 104-112; OP2 lines 201-206.
> The sub-processor list is incomplete or imprecise in four places.
> 1. The Canadian company is missing. With the owner's RG6 choice it now contracts with Microsoft for support mail, including clients' data. DATA-PROTECTION-READING still says it is "the controller of billing only". OA10 and OA23 were not updated.
> 2. Vercel is missing, although OP2 lists it "for the registration and the privacy notice (s. 16(2)(g))".
> 3. Microsoft's "Canada" is narrower than it reads. The Product Terms (learn.microsoft.com/en-us/microsoft-365/enterprise/m365-dr-product-terms) commit to Canada only "at rest" for mailbox content, and only "if Customer provisions its tenant in Canada".
> 4. Sentry's "European Union" is narrower than it reads. Sentry's page (docs.sentry.io/organization/data-storage-location/) lists data "stored in the US regardless" (accounts, organisation settings, audit logs, DSN keys) and says Sentry "will continue to access and process your data in accordance with your agreement".
> - ADR 0035 decision 1 promises "the countries they operate in", not just where data rests.
> - Recommendation: add the Canadian company and Vercel, qualify the locations as "at rest", and send the mailbox structure to the attorney.
>
> RR9 · minor (PLAUSIBLE) · RG4 lines 257-259.
> The browser-error route, POST /v1/client-errors, is under-specified.
> - Its route kind is not declared (Rule 5), and the share page's users are unauthenticated.
> - It lacks SF5's rule that the server accepts the page only from a closed list. A page reported as its real path would send a share token to Frankfurt; AP9 itself calls a token in a path "a credential".
> - An unauthenticated caller can use up the Developer plan's 5,000 errors a month, which silently blinds OP7's "new error" alert.
> - Recommendation: declare the route kind, apply SF5's closed-list rule to both fields, and put a global cap on forwarding.
>
> RR10 · minor (guard weakness) · lines 493-494.
> The "no personal data" test checks the redactor function, not what actually goes to Sentry.
> - SF5 asked for the test on "the payload sent to error tracking".
> - The SDK's own breadcrumbs (outgoing URLs, which include signed-URL query strings), tracing spans and the exception text are outside the redactor's input unless the transport envelope itself is captured.
> - Turning tracing off is not stated.
> - Recommendation: assert against the captured transport envelope, and state that tracing and default integrations are off.
>
> RR11 · minor · line 193 ("at most a day"); register line 44 ("at most one day").
> "At most one day" in the quarantine overstates.
> - AWS rounds lifecycle expiry "up … to the next day at midnight UTC" (intro-lifecycle-rules page), and "there may be a delay between the expiration date and the date at which Amazon S3 removes an object" (lifecycle-expire-general-considerations page).
> - If the quarantine bucket is versioned (not specified), the job's delete leaves the plain copy behind as an old version.
> - Recommendation: say "about two days" and specify an unversioned quarantine bucket.
>
> RR12 · minor · RG6 lines 316 and 328-329; OA12.
> The 90-day mailbox deletion needs three settings the design does not state. Its central capability is confirmed: Microsoft's Exchange Online service description marks MRM "Yes" for Business Basic.
> - Recoverable Items: the Exchange Online limits page says items removed this way stay recoverable for "14 days" on Business Basic by default (up to 30). The tag must use "Permanently Delete", or deleted-item retention must be set to 0.
> - Never Delete override: the retention-tags page says "NeverDelete is a system tag … cannot be permanently removed", and "by default, users can opt-in for tags that are not included in the retention policy". It must be restricted through role permissions (RBAC).
> - Region choice: OA12 should say to choose Canada when the Microsoft tenant is created, as OA6 does for Sentry. Moving it later to the Jamaican company is a migration, not a setting.
> - The "checked by hand once" test can only pass 90 days after mail starts arriving.
>
> RR13 · minor · RG5 lines 278-282 against OP7 line 440 (OR8).
> OP7's second backup check, "the newest backup older than 26 hours" read from the store, has no home in RG5. It also needs an AWS list credential that is not in OP4.
>
> RR14 · minor · lines 147-148; §10 line 437.
> The trigger at 5 GB ("weekly full, nightly increments … every restore point within 35 days is complete") cannot keep the 35-day limit. The oldest restore point needs a full archive up to 41-42 days old, which breaks either the 35-day deletion promise or the completeness promise.
>
> RR15 · minor · lines 223-231.
> The duplicate check needs its limits stated.
> - "The same photo always gives the same hash" holds only for byte-identical files. Re-saving or forwarding (WhatsApp, for example) changes the bytes, so the hash catches only careless reuse. Say so (Rule 21.4).
> - Matching on bank reference without normalising it ("cash", "1") will flag constantly.
> - "Only to staff" cannot be enforced by the privilege model: there is one application role, and its §7 says it "does not cover the staff console's own privileges". Yet the check runs in the scan job, which runs as a tenant. Say where the flag is stored so a foreign payment id never reaches a row the tenant can read.
> - I agree with "flag, never block" under Rule 13, since approval already requires the bank statement (R1.34).
>
> RR16 · minor (PLAUSIBLE) · line 179.
> Receipt images are "re-encoded the same way", which reads as at most 1,024 pixels wide, and the original is deleted. Small print such as reference numbers may become illegible. Separately, bank-issued PDFs restricted by an owner password may come back as UNSUPPORTED ("password-protected file" in AWS's scan-status list) and be refused. Add both to the B5 checks.
>
> RR17 · minor · stale text and overclaims.
> - Register lines 70-71 say "the privacy notice says so" about US legal process. The deployed draft notice (new-app/web/content/legal.ts:58-62) names Neon, Render, Vercel, Resend and WiPay, and contains no such sentence. The site guard hand-lists the same five names (new-app/web/test/site-guards.test.ts:472), so a register-driven notice will need that guard changed too.
> - OA1 still says production costs "about US$45-60"; RG9 makes it about $57-75.
> - §1 says register §3a lists "five services"; §3a lists two.
>
> EXAMINED AND CLEAN
> - Polyglot files: a file whose first bytes say JPEG or PNG is decoded and re-encoded, so a JPEG/PDF polyglot is defused.
> - Re-upload under the same key: impossible, because the server makes the key.
> - The job against the lifecycle rule: a race fails closed through the 15-minute refusal.
> - Sentry: the EU region is confirmed (Frankfurt, error events at rest), and the Developer plan has Data Residency and Manage PII ticked.
> - GuardDuty: the free allowance applies to "all accounts in every Region where the feature is enabled" (aws.amazon.com/guardduty/pricing), and the regions page lists no exclusion for Canada.
> - Microsoft: the Product Terms confirm the Canadian residency commitment.
> - Spaces price: $5 including 250 GiB, then $0.02 a GiB, with 1,024 GiB of transfer (DigitalOcean's Spaces pricing doc), matching the design.
> - RG9 arithmetic: the added cost of $12-14 a month is right; $57-74 is stated as $57-75.
>
> RG1-RG9
> - RG1 · agree · apply test 4 from the vendor's own terms (RR6).
> - RG2 · agree · versioning off if noncurrent expiry fails; declare the backup and drill keys (RR4, RR5).
> - RG3 · agree in part · GuardDuty yes; run the disarm outside the API process (RR1); restate the PDF residual for re-acceptance (RR2); add the tag-write deny (RR3).
> - RG4 · agree in part · Sentry EU yes; Team plan when SF5's console link is built, not seats (RR7).
> - RG5 · disagree · confirm Better Stack's service terms; else UptimeRobot free monitors plus a paid heartbeat service, or Better Stack paid, costed in RG9 (RR6).
> - RG6 · agree · with Permanently Delete, Never Delete restricted, Canada chosen at tenant creation, and the structure sent to the attorney (RR8, RR12).
> - RG7 · agree · add the tag-write deny and the credential for OP7's backup-age check (RR3, RR13).
> - RG8 · disagree in part · add the Canadian company and Vercel; qualify locations as "at rest" (RR8, RR17).
> - RG9 · agree in part · re-total after RR6, and update OA1.
>
> NOT EXAMINED
> - Nothing was run against AWS, DigitalOcean, Sentry or Microsoft.
> - Better Stack's service terms: the only terms page I found is its website terms.
> - GuardDuty's per-GB price: the page renders prices by script.
> - Whether DigitalOcean encrypts Spaces at rest: I found no public statement.
> - How long Vercel keeps logs, and whether they hold IP addresses.
> - The Zoho and Google Workspace claims, and ClamAV's memory figures.
> - ADR 0021 beyond a skim; any code; original-app/.
>
> VERDICT
> The design is sound after the named changes (RR1-RR8, and the minor ones).
>
> git status --short
>  M docs/BRIEF-STATUS.md
>  M docs/MISTAKES.md
>  M new-app/CLAUDE.md
>  M tools/pg-local.sh
> These are the builder's four files, as the coordinator said. None are mine.
