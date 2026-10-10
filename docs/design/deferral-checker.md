# Design: the deferral checker — a decided step is never still "to be decided" elsewhere

**Status: APPROVED by the owner, 2026-10-10** ("build the checker"), on the proposal in `docs/MISTAKES.md` M45.
**Built the same day**: `tools/check_deferrals.py`, in the gate and CI's `docs` job; its first run and plants are below. A small
tool, so a short design (Rule 1.1: "a paragraph for a small change"). **Delegation (Rule 16.5):** in-session — the work
is a guard whose proof is an ordered plant, restore and compare, which Rule 16.6 keeps in-session; an independent
Sonnet check follows (Rule 24.6).

## The problem

Designs defer to later steps: "the storage provider is chosen in A5", "priced in A5", "A5 confirms the choice". When the
later step is decided, every such sentence must be resolved — rewritten, or given a dated pointer to where it was
decided. Twice in two days one was not, and the document went on saying a decided thing was still open (M45; A6's
MR16 and MR24; A5's sweep). Nothing found them but a reviewer reading.

## What it does

`tools/check_deferrals.py`, run in the gate and in CI's `docs` job beside the other checkers:

1. Reads `docs/BUILD-PLAN.md` and collects the **ticked** step ids (`- [x] A5 · …`).
2. Scans every tracked Markdown file for a **deferral phrase**: a verb of deferral naming a step —
   `chosen | priced | decided | designed | confirmed | settled | named | picked` followed by `in` or `by`, optionally
   `design`, then a step id; or a step id followed by `chooses | confirms | prices | decides | will choose | will confirm
   | will decide`.
3. For each phrase that names a ticked step, it is **resolved** only if the same line also carries one of:
   - **a quotation** — the phrase sits inside double quotes, straight or curly (a document quoting old wording);
   - **a dated pointer** — the house form `Pointer YYYY-MM-DD` (any case);
   - **a citation of the deciding design** — a backticked `docs/design/….md` path later on the line.
4. Files whose purpose is to record history are skipped, each named in the tool with its reason and printed on every
   run: the mistakes ledger, the status log, the delegation log, the briefs, and the review registers. (The same rule as
   Rule 21.8: exemption by a document's purpose, never by a turn of phrase.)
5. **Fails** on any unresolved phrase, printing file, line, step and phrase, and the fix: rewrite it, or add a dated
   pointer to the design that decided it. Prints the counts every run: files scanned and skipped, phrases found, those
   naming ticked steps, those resolved by each excuse, and the failures (Rule 21.1: the banner states its coverage).

## What it does not do (Rule 21.4)

- **Other wordings** pass unseen: "(A6)" as a placeholder, "owed to A5", "waits for A6", "left to the register". The
  verb list is a deny-list of a kind Rule 21.8 warns about; it is kept short and stated rather than grown by patching
  (Rule 21.9: a second miss of the same class means replacing the shape, not adding a verb).
- **A deletion** that leaves another document relying on what was removed (A6's MR16) is invisible to it. Only the
  independent read and the closing check catch that.
- **A resolved line can still be wrong**: a dated pointer to the wrong design passes. It checks that a resolution is
  stated, not that it is true.
- Steps not yet ticked are not checked, by design: a deferral to an open step is correct.

## How it is proved (Rule 21.2)

Before it is reported, each with the file backed up first, restored from the backup, and shown identical with `diff -q`:
- **a stale deferral fires**: a line "Chosen in A5" added to a tracked design → the run fails, naming it;
- **an open step does not**: the same line naming A8 (unticked) → the run passes;
- **each excuse works and only on its own line**: the planted line quoted, then given a dated pointer → passes.

And its first real run is recorded: what it found, and what was fixed.

## The first run, and the plants (2026-10-10)

- **First run: 13 stale deferrals**, twelve to A5 and one to A6 — the twelve resolved with dated pointers, the one by citing the deciding design.
- **The tool's own first version** counted the build plan's fenced example ("- [x] B1 · …") as a tick and reported B1
  done; it now skips fences, as `tools/check_build_plan.py` does.
- **Seven plants** on `docs/design/api-layer.md`, restored from a backup and shown identical with `diff -q`: a stale
  deferral in each form fails (2); one to an open step passes; a quoted one passes; one with a dated pointer on its line
  passes; one whose pointer is on the next line fails; one whose design path comes before the phrase fails.

