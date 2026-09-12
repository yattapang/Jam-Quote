# Review agents

Independent reviewers, one per section of the app plus two that cross
boundaries. They exist because this project's defects are almost never broken
logic — they are **wiring**, and wiring is invisible to a passing unit test.

## The defect taxonomy every agent hunts

Four shapes account for nearly every real defect found in this codebase. They
are listed in each agent's brief because pattern-matching on them has found far
more than reading code for correctness ever did:

1. **A state nothing can reach.** `Subscription.status` written once as its
   default; `QuoteStatus.VIEWED` referenced by three code paths and set by
   none; `InvoiceStatus.OVERDUE` in the transition table with no writer;
   "Applied (YTD)" counting a column nothing populated. Filters and stats over
   these read as fact and are permanently zero.
2. **A correct helper no screen calls.** `lineUnitLabel` was right and
   thoroughly tested while five screens did their own lookup and printed "30
   units" for a job sold by the metre. Same for `unitRef`, `formatTrn`, and the
   `csvText` superscript guard.
3. **An action reporting success while doing nothing.** The email path that
   returned ok from an unverified domain; the WhatsApp link that led to a login
   wall; a rule-pack "Approve & publish" button that set a flag and made no API
   call; a delete that recorded a reminder for mail that never left.
4. **Wired from one side and dropped on the other.** `unavailableReason`
   accepted as a prop and never read, leaving the invoice email button live.
   `Client.town` validated by the DTO and never written. Both printed an ESLint
   warning in every build and were read past.

## Four more shapes, learned after these briefs were written

The four above were the taxonomy when the section briefs were first written. A long
remediation campaign then found four more, and they now account for most of what is
left once the wiring is right. **Every reviewer hunts these too.**

5. **One of two twins.** A fix reaches the case the finding named and not its
   sibling. A statutory levy got two rate editors; the fix removed the duplicate
   for a levy the admin ADDED and left it for one that REPLACED a baseline entry.
6. **A comment asserting correctness over hand-listed cases**, where the defect is
   in the case not listed — six instances found. Also a comment that was true when
   written and the same commit made false, and a comment citing a test file that had
   never been written.
7. **A guard matching the TEXT of a defect rather than its shape.** Eight
   generations of source-scanning assertion in one file were each defeated by a
   rewrite that changed no behaviour — deleting the spaces around an arrow, wrapping
   a digit in braces, a const instead of a literal, a dead call left for the scanner
   to find.
8. **A guard whose parse proves nothing.** One assertion read an object literal with
   its braces still attached, so its key list came back empty and it was trivially
   true for any input — through three rewrites and two reviews that looked at it.

## Method (mandatory for every agent here)

These are not style preferences. Each one exists because its absence let a real
defect through, or produced a false finding that cost an author real time.

- **Execute the bypass; do not describe it.** A finding of the form "this could be
  evaded by X" must come with having written X into the real file and run the suite.
  Report what you observed. Then restore the file and confirm
  `git status --porcelain` is empty.
- **Verify your own detector before reporting a hit.** One review reported three
  routes as missing an actor because its grep looked for `req.user` and they used
  `req.adminContext`. The code was right; the pattern was wrong. Confirm your
  detector fires on a case you know is broken and stays quiet on one you know is fine.
- **Revert the fix and watch the test fail.** A test added beside a fix is worth
  nothing until you have seen it fail without the fix. Say so plainly when a claimed
  fix has no such test — that has happened while the commit message claimed otherwise.
- **Check that claimed coverage exists.** When something cites a test as its
  replacement, `ls` it. One commit deleted an assertion citing a render test that had
  never been written, with typecheck, lint and 1612 tests green over the claim.
- **A test asserting "defined" asserts almost nothing.** `Object.hasOwn` and
  `not.toBeUndefined()` on four fields left a blank tax label silently saving as the
  string "TAX" — renaming the tax on every quote and invoice — with 534 tests green.
  Check whether value tests pin the VALUE or only its existence.
- **Trace blast radius for anything shared.** A change in `packages/core` needs its
  callers and the consumers of its output grepped across `apps/api`, `apps/web`,
  `apps/mobile`, PDFs and reports. A tenant-facing figure that silently changed value
  is worse than the screen bug being fixed. State explicitly whether any did.
- **Run the real gates.** `npm run typecheck`, `npm run lint`, `npm test` from the
  root. CI deliberately omits `build`, so run `npx next build` in `apps/web` when the
  change touches imports or types crossing module boundaries.
- **The working tree is not private.** Another session may be committing while you
  work. Restore what you touch, and report it if the tree changes under you rather
  than assuming it was yours.
- **Distinguish CONFIRMED from PLAUSIBLE**, and say explicitly where you found
  nothing. A review listing only hits leaves the reader unable to tell "clean" from
  "not looked at".

## Building a guard — the doctrine eleven defeated generations taught

A guard is a test that asserts something about the CODE rather than about behaviour.
This repo has lost eleven generations of them to rewrites that changed no behaviour, and
the survivors share every property below. Anyone writing or reviewing a guard follows it.

1. **Prefer, in this order:** a TYPE the defect cannot satisfy; a behavioural test over
   the real code path; a parse of the AST; and never a text regex. Reach for the next
   rung only when the one above cannot hold the fact — and say in the guard's comment
   why it could not.
2. **One parser, shared and tested.** In `apps/web` that is `lib/test/source-ast.ts`.
   Every defeated guard had written its own matcher, and the matcher was where the
   defect lived; one returned an empty list for every input and asserted nothing for
   three rewrites. Do not write a second parser. If the shared one cannot answer the
   question, extend it and add the case to its own tests.
3. **Detect the class, not the spelling.** Before writing a guard, list every way the
   defect could be spelled — and then execute each one against the finished guard. A
   guard that recognises the spelling its author tried is not a guard.
4. **Prove the parse found something.** Every guard asserts it located its subjects —
   a count of files, calls or routes — so a rename or a move fails loudly instead of
   emptying it silently.
5. **Inject the defect and watch it fail.** A guard that has only ever been seen to pass
   has not been seen to work. Restore the file afterwards and leave the tree clean.
6. **Discovery over lists.** A hand-maintained list of routes, files or shapes rots the
   day someone adds one. Derive the set from the filesystem or the AST; where an
   allow-list is unavoidable, key it precisely (file and line, or exact name) and assert
   every entry still exists.
7. **Say what it does not prove.** A guard's comment states its limit. "A deliberate
   cast defeats it" is honest; "an inline literal is a compile error", when four
   constructs compile, is an overclaim a reviewer will find.

## Provenance, which was wrong once

`REVIEW-FINDINGS.md` opens with the incident: two of the nine agents never returned
a result, and the register nevertheless carried findings attributed to their sections,
written from expectation and described as hand-verified. All of them happened to be
real, which that file calls "luck, not method".

So: **a finding carries where it came from, or it does not go in the register.** If
you were not run, nothing may be filed in your name.

## The odd one out: `commit-reviewer`

The nine others are SECTION reviewers — point them at an area and they audit it.
`commit-reviewer` reviews one COMMIT that claims to fix something, and it exists
because of a run of nine consecutive reviews in which every single one found a
real defect, and **three of four consecutive fix commits introduced a new defect
while closing an old one**.

Its brief carries the method those reviews taught, which the section briefs do
not: execute every bypass rather than describing it; verify your own detector
before reporting a hit; `ls` any test file a commit claims as a replacement;
revert each fix and watch its test fail; run `next build` as well as the CI
gates; and trace the blast radius of anything changed in `packages/core`.

Use it after any remediation commit, and especially after one written in response
to a previous review — that is where the introduced defects have clustered.

## How to run one

    Agent(subagent_type: "quote-flow-reviewer", prompt: "Review against your brief")

Agents are read-only by default. They report; they do not fix. That separation
is deliberate — a reviewer that edits stops being able to tell you what it
found.

## What nine rounds on one file taught, in four lines

Kept here rather than in one agent's brief, because it applies to reviewing and
to building:

- **Fix the model, not the screen.** When two places can hold one fact, the model
  has to say which wins. No arrangement of inputs substitutes, and two attempts
  to do it on screen made things worse.
- **Validate what you will SEND, not what is on screen.** Splitting those apart
  produced a save refused over a value the payload had already decided to skip.
- **Prefer the compiler, then a tested function, then a source scan.** Eight
  source scanners were defeated; a nominal type was not. Reach for a scan only
  when neither of the first two can hold the fact.
- **A claim about coverage is a claim about a file.** It either exists or it does
  not, and no tool will tell you which.

## Model choice

Reviewers are set to `opus` because the work is judgement, not enumeration.
`form-input-auditor` is `sonnet`: its job is exhaustive breadth over every
input in the app, which is mechanical. Change the frontmatter if the balance of
cost and depth needs to shift.
