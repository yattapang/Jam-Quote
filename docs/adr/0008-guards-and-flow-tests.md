# 0008 — Defect classes are held by parser-based guards and real-database flow tests

**Status:** Accepted (2026-09)

## Context
Fifteen rounds of review produced one pattern: a defect is fixed for one spelling, and the
next spelling reopens it. Text-matching tests were defeated by a rename, a cast, an alias or
a template literal. Separately, module tests with a mocked database passed while the seam
between two modules was broken.

## Decision
Two mechanisms, each with a job.
- **Guards** hold a defect CLASS. They parse with one shared parser (`packages/test-ast`),
  resolve names through the TypeScript binder rather than comparing text, and state in their
  header what they do not prove. A guard must fail when its defect is planted in real
  source.
- **Flow tests** (`apps/api/src/integration/`) drive the real services against a real
  Postgres, with only email and the card gateway stubbed, and assert the invariants that
  cross modules.

## Alternatives considered
- **Regex source scans.** Rejected by repeated failure: beaten by aliasing, bracket access,
  comments and line endings, and one silently counted zero on a Windows checkout.
- **More mocked unit tests** as the answer to seam defects. Rejected: a mock cannot disagree
  with the database.

## Consequences
- Guards are slower to write than a grep, and are only worth it for a class we have seen.
- The flow suite is CPU-hungry, so it runs as its own task (`npm run test:integration`) to
  keep the everyday gate honest rather than flaky.
- Every new guard needs its own proof: plant the defect, watch it fail, restore.
