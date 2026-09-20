# 0009 — The product is Pryvis (pryvis.com)

**Status:** Accepted (2026-09-20)

## Context
"JamQuote" was the working name and it is written into the repository: the npm scope
(`@jamquote/core`, `@jamquote/ui`, `@jamquote/test-ast`, `@jamquote/api`, `@jamquote/web`,
`@jamquote/mobile`), the repository folder and remote, documentation, user-facing copy,
email senders, and the PDF footer. The owner has registered **pryvis.com** and the product
is now **Pryvis**.

The name also carried a country: "Jam" reads as Jamaica, and the plan is to sell in Trinidad
& Tobago next (ADR 0005, ADR 0006). A country-specific brand becomes a liability the moment
the second market opens.

## Decision
Pryvis is the product name. The rename is treated as a first-class change with the same
discipline as any other, not a find-and-replace:

1. **User-visible first.** Page titles, emails, the PDF, the public quote and invoice pages,
   app metadata and store listings say Pryvis. This is what customers and clients see, and
   it is the part with revenue attached.
2. **Code namespace second, in one commit of its own.** The npm scope becomes `@pryvis/*`
   across every workspace, import and config, with the full gate green before and after. A
   rename mixed into a feature commit is unreviewable.
3. **Repository and remote third**, once the code namespace is stable.
4. **Database identifiers are not renamed.** Table and column names carry no brand, so
   there is nothing to migrate, and a rename would be a schema migration with no product
   value.
5. **History keeps the old name.** `REVIEW-FINDINGS.md`, older ADRs and commit messages are
   a record of what happened and are not rewritten; this ADR is the pointer that explains
   the change.

## Alternatives considered
- **Rename everything at once,** including the repository and the npm scope, in a single
  sweep. Rejected: it would touch every file in the tree at the same moment as the first
  feature work, and a reviewer could not separate the rename from the behaviour.
- **Leave the code namespace as `@jamquote/*` indefinitely** and rebrand only the UI.
  Rejected: a maintainer joining later would find two names for one product with no
  explanation, which is exactly the confusion the naming rule in `docs/BUILD-RULES.md`
  exists to prevent.

## Consequences
- Email senders, share links and any external identifiers that embed the old name must be
  changed deliberately, with the old ones kept working while links already in customers'
  hands still resolve.
- The design tokens and the PDF header carry the brand, so the brand assets (logo, wordmark)
  are needed before the user-visible step can finish.
- Search in the codebase will return both names until step 2 lands; the ADR index says which
  is current.
