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
