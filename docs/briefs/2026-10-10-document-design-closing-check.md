# Brief: closing check of the document settings and PDF design after its read (DR1-DR16), and of Rule 24.7's tool

**Rule 0 first:** read `docs/RULES.md` and state which rules apply before starting. **You have no subagents; you do
this work yourself** (Rule 16.6).

**Agent:** general-purpose, **Sonnet** (Rule 16.9: mechanical — every item names the text to read, the expectations
below are executed, and the plants are listed; the adversarial work was the Opus read, whose findings are recorded in
the design's §12 and `docs/BRIEF-STATUS.md`).
**Brief step:** build plan A7 (`docs/BUILD-PLAN.md`), phase A.
**Under check:** `docs/design/document-settings-and-pdf.md` as amended; the twins changed with it — `docs/PRD.md`
(R1.16), `docs/design/domain-model.md` (the `document_settings` row, the Deliver row), `docs/design/third-party-register.md`
(RG2's serving and backup lines), `docs/design/api-layer.md` (AP11), `docs/TIERS.md`, `new-app/web/content/site.ts` and
`new-app/web/test/site-guards.test.ts`; `docs/design/outbound-messaging.md` §13's four cited rows; `docs/MISTAKES.md`
(M47); `docs/RULES.md` (Rule 24.7); and `tools/check_mechanical_claims.py` with its wiring in `CLAUDE.md` and
`.github/workflows/verify.yml` — at the commit that adds this brief.
**Do not touch:** anything in the working tree. Plants run only in a disposable worktree (below).

## What to do

1. From the repository root, run `python3 tools/run_brief.py docs/briefs/2026-10-10-document-design-closing-check.md`
   and report its full output. Every check must PASS, and the tree must be clean afterwards.
2. For each of DR1-DR16, read the design's §12 row and the sections it names. Report **answered** or **not answered**,
   quoting the sentence that answers it. A finding is answered when the design states a rule a builder of C4 can follow
   for every part of the read's recommendation, or states plainly why a part is not taken. The read's findings, in
   short:
   - DR1 (blocker): rendering in the API puts image decoders there, against RG3/RR1. Check: the renderer is in the files
     worker; the logo's hash is checked **before** decoding against a hash the API recorded; the worker gets no new key
     or database door; RG3's "no decoder in the API" test covers the renderer.
   - DR2: nothing stored the snapshot, and numbering can come after the seal. Check: settings versions are insert-only;
     every issue kind records the version, the palette resolved at seal, the rule pack's version, and (quotes) the
     client's address; a logo survives while any version an issue names records it.
   - DR3: two plants could not fail. Check: the first test seals, changes, **then** numbers; insert-only is a revocation
     with an error, and its plant is the revocation removed; the clock is injected.
   - DR4: one original per document held by the database; identical and differing re-renders each have a stated path
     that fits the existing unique (issue, SHA-256) key.
   - DR5: invoice and credit-note renders, with an exactly-one check.
   - DR6: renders streamed through the API, hashing the bytes sent; never a signed URL — and AP11 and RG2 say so.
   - DR7: the share page's HTML from the same issue and settings version; a requirement owed to A9.
   - DR8: the site line, `docs/TIERS.md` and DS4 agree, and none claims more than the PDF and its metadata.
   - DR9: the body text colour defined; band text pure black or white; the test uses a mid-tone.
   - DR10: presets Pro; the tier applied at seal, with a plant.
   - DR11: numbering commits before the render; retries; visible states; no delivery before a render.
   - DR12: an insert-only disposal record that serving, restore, the drill and the erasure ledger use.
   - DR13: §11's rows restated; DS8's copies table complete against RG2's own copies table.
   - DR14: `creator` and `producer` set; emoji and unprintable characters refused at input; PDF/A weighed; the font
     claim narrowed.
   - DR15: the citation of `docs/design/acceptance-evidence.md` replaced by the schema's key.
   - DR16: privacy-line bounds; render limits; the internal copy's reach stated truly; staff access; the brief edit
     **proposed, not made** (check `docs/DEVELOPMENT-BRIEF.md` is unchanged at this commit); the backup's hash check.
3. **Check the owner's three decisions are recorded as decided, not as recommendations** (the design's status lines,
   DS1, DS4, DS5 and §10's table), and that nothing else in the amendments changes what the owner approved without
   saying so.
4. **Check §11 against Rule 24.7 and M47**: no row says "Mechanical now"; each "Not mechanical" row names who catches it;
   each C4-test row points at a test in §10.
5. **Plants for `tools/check_mechanical_claims.py`** (a guard is not closed until a plant proves it fails). Work only in
   a disposable worktree: `git worktree add --detach <your scratch dir>/mc HEAD`, run everything there, then
   `git worktree remove --force` it and `git worktree prune`. Append each line to the end of
   `docs/design/api-layer.md` in the worktree, run the tool, and restore the file from a backup copy before the next
   (prove the restore with `diff -q`):
   - `| X | y | **Mechanical now** — trust me |` → fails, naming the line;
   - the same citing, in backticks, a path under docs/briefs/ that does not exist (2026-01-01-nope.md) → fails (not a
     tracked brief);
   - the same citing `` `docs/briefs/2026-10-09-messaging-design-closing-check.md` `` → fails (its checks name another
     design);
   - the same inside a closed ```` ``` ```` fence → passes; `| X | y | **Not mechanical now** |` → passes;
   - an unclosed fence → fails, naming the file.
   Then **try to defeat it** (Rule 21.2) and report each attempt and its result — for example a verdict in a non-table
   line, a citation in a different form, a brief that mentions the design only outside its check blocks. Say for each
   whether the tool's docstring states it.
6. Do not edit, commit, stash, `git checkout --` or `git restore` anything in the working tree.

## Report

The runner's output; DR1-DR16, each answered / not answered, with its quoted sentence; the decisions check; the §11
check; each plant and break attempt with its result; and a last line, **closable** or **not closable**, for DR1-DR16 and
the tool as a set. Then `git status --short` and `git worktree list`, which must show the tree clean and no extra
worktree.

## Expectations

Sixteen findings in the design's answer table, each cited in the body too:

```check
$ grep -c "^| DR[0-9]* ·" docs/design/document-settings-and-pdf.md
16
```

```check
$ for n in $(seq 1 16); do c=$(grep -oE "\bDR$n\b" docs/design/document-settings-and-pdf.md | wc -l); [ "$c" -ge 2 ] || echo "DR$n only $c"; done; echo checked
checked
```

The owner's decisions, the new site line in both places, M47 and Rule 24.7:

```check
$ grep -c "the owner decided all three on 2026-10-10 as recommended" docs/design/document-settings-and-pdf.md; grep -c "No Pryvis name or logo on your quotes and invoices — even on Free" new-app/web/content/site.ts new-app/web/test/site-guards.test.ts; grep -c "^### M47 ·" docs/MISTAKES.md; grep -c "^\*\*24.7 " docs/RULES.md
1
new-app/web/content/site.ts:1
new-app/web/test/site-guards.test.ts:1
1
1
```

No stale wording left outside the history files:

```check
$ git grep -n -F -e "Your name on your documents, never ours" -e "no Pryvis branding, even on Free" -e "the only place software is named" -e "so every client's name renders" -e "A colour too pale for either" -e "keeps pointing at the original row (\`docs/design/acceptance-evidence.md\`)" -e "its proposed checker awaits the owner" -- . ':!docs/briefs' ':!docs/MISTAKES.md' ':!docs/BRIEF-STATUS.md' ':!docs/DELEGATION-LOG.md' ':!original-app'
```

No "Mechanical now" verdict in A7's §11, and the new tool in the gate and CI:

```check
$ awk '/^## 11\./{f=1;next} /^## 12\./{f=0} f && /^\|/ && /Mechanical now/' docs/design/document-settings-and-pdf.md | wc -l; grep -c "check_mechanical_claims.py" CLAUDE.md .github/workflows/verify.yml
0
CLAUDE.md:1
.github/workflows/verify.yml:1
```

The brief edit is proposed, not made:

```check
$ grep -c "being available for offline PDF generation" docs/DEVELOPMENT-BRIEF.md
1
```

All seven checkers:

```check
$ for t in check_rules check_dispositions check_citations check_schema_citations check_build_plan check_deferrals check_mechanical_claims; do python3 tools/$t.py 2>&1 | tail -1; done
All citations resolve, and no rule has changed unreviewed.
Every Closed disposition cites every document its finding named.
Every cited filename and symbol resolves. (Paths are checked by tools/check_schema_citations.py, not here.)
Every citation in the forms this tool checks resolves (its docstring lists them, and what it does not check).
Every ticked step carries its evidence.
No deferral names a decided step, in the forms this tool checks (its docstring lists what it does not).
Every 'Mechanical now' row cites a brief whose check ran against its design (Rule 24.7; its docstring lists what that does not prove).
```

```check
$ git status --short
```
