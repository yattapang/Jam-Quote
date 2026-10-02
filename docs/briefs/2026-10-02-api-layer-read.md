# Brief: independent read of the API layer design (build plan A2)

**Agent:** commit-reviewer, **Opus** (Rule 16.5: security architecture — sessions, CSRF, tenant isolation in jobs and
storage, and the idempotency of money-creating requests are judgement-class; this is adversarial reading of a
design, not a mechanical check).
**Under review:** `docs/design/api-layer.md`, approved by the owner on 2026-10-02 (AP1-AP11), against ADRs 0011,
0012, 0013, 0016, 0026 and 0030, `docs/design/api-bootstrap.md`, `docs/design/privilege-model.md`,
`docs/design/tax-and-documents.md` (its lock order and numbering), `new-app/CLAUDE.md` ("Financial writes"),
`docs/THREAT-MODEL.md`, the PRD (R1.19, R1.21a, R1.22g, R1.39) and the code in `new-app/api/src` and
`new-app/packages/contract`.

**Why this read is different.** The owner approved every recommendation and said they are not an API expert and
rely on our judgement. So, besides finding gaps, **give a second expert opinion on each of AP1-AP11**: would you
recommend the same, and if not, what and why. Say "agree" plainly where you do.

## What to attack

1. **Sessions and CSRF (AP1, AP2).** Is `__Host-` + `SameSite=Strict` + an HMAC token + an exact `Origin` check sound
   for a web app at pryvis.com calling `api.pryvis.com`? Find the request that gets through: a sibling subdomain,
   a missing or `null` Origin, a `GET` with side effects, the share page (served by the API) and the web app
   sharing a site, sign-in itself (no session yet — login CSRF), sign-out, the bearer-and-cookie rule.
2. **The contract (AP3, AP4).** Can a route reach production without validation, without a response schema, or
   undocumented? Does stripping unknown response keys in production hide a defect the strict test mode misses?
   Is replacing the `@wire` generator a regression of anything ADR 0012 or its F4/F5 fixes guarantee?
3. **Errors (AP5).** Find a path where a database error, a constraint name or a typed value reaches a response,
   including the database refusals that the money design (`tax-and-documents.md`) adds.
4. **Idempotency (AP6).** Work through: a duplicate arriving while the first holds the quote lock (with AP8's lock
   timeout); the first committing but its response lost; a key reused across users or tenants; a request whose
   work is partly outside the transaction (sending an email, calling the payment provider); a replayed response
   that is now stale; the fingerprint's canonical form. Does the in-transaction record interact badly with the
   lock order quote → client → series?
5. **Start-up and time limits (AP8).** Is 5 s / 10 s right given the race suite and the lock order? What does a
   lock timeout do to a transaction that already allocated a gapless number? Is `trust proxy` stated precisely
   enough for the rate limiter?
6. **Logs (AP9), jobs (AP10), storage (AP11).** Find the tenant leak: a job claimed by a worker under the wrong
   tenant, a platform job that touches tenant rows, a job payload with personal data, a signed URL that outlives
   a revocation or a tenant's suspension, a log line that carries a credential.
7. **Consistency and gaps.** Every place this design disagrees with the ADRs, the PRD, the threat model or the
   code as built; and anything a builder of B2 would have to make up.

## How to work

- Read; do not edit anything, commit, stash, `git checkout --` or `git restore`. Write your findings only in your
  reply. Synthetic data only.

## What to report

Findings numbered **AL1, AL2, …**, each with severity (blocker / major / minor), where, the evidence, and a
recommendation. Then a table AP1-AP11: **agree** / **disagree** (with your alternative, one line). Then one line:
**the design is sound to build from**, or **sound after the named changes**, or **not yet**. Then
`git status --short`, which must be empty.

## Expectations

```check
$ grep -c "^### AP[0-9]* ·" docs/design/api-layer.md
11
```

```check
$ grep -c "APPROVED by the owner, 2026-10-02 — every recommendation, AP1-AP11" docs/design/api-layer.md
1
```

```check
$ for t in check_rules check_dispositions check_citations check_schema_citations check_build_plan; do python3 tools/$t.py 2>&1 | tail -1; done
All citations resolve, and no rule has changed unreviewed.
Every Closed disposition cites every document its finding named.
Every cited filename and symbol resolves. (Paths are checked by tools/check_schema_citations.py, not here.)
Every citation in the forms this tool checks resolves (its docstring lists them, and what it does not check).
Every ticked step carries its evidence.
```
