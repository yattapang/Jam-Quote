# The wire contract

Zod schemas describing the **JSON that actually crosses the network** between
`apps/api` and `apps/web`. Seam 1 in `CONTRACTS.md`.

## The problem these solve

`apps/web/lib/api-client.ts` used to declare `ApiQuote`, `ApiInvoice`,
`ApiClientRow` and a dozen others by hand, against an API that returns Prisma
rows serialized to JSON. Nothing connected the two. Rename a field in the API
and the web still compiled, still passed its tests, and rendered `undefined` to
a contractor.

## Why the WIRE shape and not the service's return type

A Prisma `Decimal` and a `Date` do not survive `JSON.stringify`. `gctRate`
leaves the API as the string `"15"`; `issueDate` as
`"2026-08-03T00:00:00.000Z"`. The service's TypeScript type is therefore a lie
about what the browser receives — typing the web from it would move the drift
rather than remove it.

These schemas describe what arrives.

## What a wire schema is, and is not

**It is the set of fields the web RELIES ON** — not a mirror of every column.

That is a deliberate choice. A mirror would have to carry `businessId`,
`deletedAt`, `createdAt` and everything else the web never reads, and every
harmless new column would churn the schema and three files with it. Worse, it
would blur the useful question: *what does the browser actually depend on?*

So each schema is a floor, and the two sides are held to it from opposite
directions:

| Side | What it guarantees | How |
|---|---|---|
| `apps/web` | Cannot read a field the contract does not promise | Its types are `z.infer<>` of the schema — there is no hand-written duplicate to drift |
| `apps/api` | Cannot stop providing a promised field | A test builds a value typed as the service's real return type and parses it through the schema |

The API-side test is the load-bearing half, and it is coupled twice on purpose:

- **TypeScript** checks the sample against the service's actual return type, so
  renaming a Prisma column breaks the sample at compile time.
- **Zod** checks the sample against the contract, so removing a field the web
  needs fails the parse.

One without the other proves little. Together, a rename cannot pass both.

## Consequences worth knowing

- **Adding** a field to an API response is free and invisible here, which is
  correct: the browser cannot be broken by data it does not read.
- **Removing or renaming** one fails the API test immediately, naming the field.
- **Changing a type** — an integer becoming a string, a required field becoming
  nullable — fails the parse, which is the case a hand-written interface was
  least likely to notice.

## The public views are different

`PublicQuoteView` and `PublicInvoiceView` are **allow-lists on the one
unauthenticated surface in the API**. For those, the schema is the
specification of what an anonymous holder of a share token may read, so it is
exhaustive rather than a floor, and adding a field to one is a disclosure
decision that should be obvious in a diff.
