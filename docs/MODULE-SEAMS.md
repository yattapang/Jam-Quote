# Modules, their seams, and who has signed off

This is the register for rule 9 of [`BUILD-RULES.md`](BUILD-RULES.md): every completed
module is reviewed independently, and **every dependency between two modules is tested at
the seam** by something neither module's own unit tests can satisfy.

Two columns matter most. **Reviewed** names the independent review that attacked the module
(not the agent that built it). **Seam covered by** names the cross-section flow test that
drives the real services against a real Postgres. A blank in either column is work owed, not
a matter of opinion.

Update this file in the same commit as the module or seam it describes.

---

## 1. API modules

| Module (`apps/api/src/…`) | Owns | Reviewed | Notes |
|---|---|---|---|
| `auth` | Sessions, JWT, tenant + admin context | ✓ tenancy review | Admin-role users are refused tenant routes; legacy dual-role admins grandfathered |
| `business` | The tenant record, country, currency, GCT registration, numbering | ✓ | Invoice numbers now increment atomically |
| `clients` | Client book | ✓ | Soft delete keeps documents readable |
| `catalogs` | Materials, labour, equipment, suppliers, favourites | ✓ catalog sweep | Unit labels normalise per rule pack |
| `jobs` | Job recipes and their components | ✓ job-form sweep | Cost refused when it cannot be held exactly |
| `quotes` | Quotes, versions, variations, share tokens, public reads | ✓ quote-flow sweep | One quote makes one invoice |
| `invoices` | Invoices, retention, public reads | ✓ | Convert locks the source quote |
| `payments` | Recording payments, voids, card links | ✓ money sweep | Settlement comes from core |
| `projects` | Projects, costs, job profit | ✓ | GCT netting follows the registration flag |
| `purchases` | Purchases and labour entries against a project | ✓ | Supplier ownership checked |
| `exports` | Accountant CSV | ✓ | Currency per business; negative amount due still open |
| `reports` | Dashboard and reporting reads | partial | Reviewed only through the money sweep |
| `rulepack` | Country rule pack overrides | ✓ | Rates as data, audited |
| `regulatory` | Admin-curated regulatory feed | ✓ admin sweep | URLs validated by core |
| `admin` | Platform console: tenants, plans, pricing, audit, impersonation | ✓ admin sweep | Money in audit details redacted by capability |
| `billing` | Platform pricing config | ✓ | Free-tier default is 3 |
| `sync` | Mobile replica push/pull | **not reviewed** | Owed: its own review and a seam test with quotes/catalogs |
| `trades` | Trade master list | ✓ | Falls back to the in-code list |
| `common` | Ownership assertions, bounds, shared guards | ✓ | `assert-owned` is the single ownership rule |

## 2. Shared packages

| Package | Owns | Reviewed |
|---|---|---|
| `packages/core` | Money, tax, totals, settlement, job cost, renewal, rule packs, wire contracts | ✓ repeatedly |
| `packages/ui` | Design tokens | ✓ via the token guard |
| `packages/test-ast` | The one parser every guard uses | ✓ three rounds |

## 3. Seams that must be tested, and where they are tested

A seam is a place where one module trusts another's output. Unit tests with a mocked
database cannot see these; every defect that reached a customer here lived in this table.

| Seam | Invariant that must hold | Seam covered by |
|---|---|---|
| catalogs → jobs | A component keeps its catalog link and its own price; a retired item stays editable | `integration/catalog-job-quote.flow.ts` |
| jobs → quotes | A quote line's price equals the server-computed job cost to the cent, and later job edits never change a saved quote | `catalog-job-quote.flow.ts` |
| quotes → projects | Accepting a quote creates its project once | `quote-lifecycle.flow.ts` |
| quotes → invoices | Totals, tax and the line snapshot carry over exactly; one quote makes one invoice; a second convert is refused | `quote-lifecycle.flow.ts` |
| invoices → payments | Balance and settled state come from core after every payment, void and retention change | `invoice-balance.flow.ts` |
| payments → reports / exports | Every surface agrees with core on the same invoice | `invoice-balance.flow.ts` |
| business → quotes / invoices | Country, currency and GCT registration decide what a new document charges, and never change an issued one | `quote-lifecycle.flow.ts` |
| auth → every tenant module | A second tenant cannot read, reference or mutate the first tenant's rows through any id it supplies | `tenancy.flow.ts` |
| admin → billing → subscription sweep | The ledger, the console figure and the sweep agree on `renewsAt` | `subscription.flow.ts` |
| share tokens → public reads | A token exposes exactly one document; a draft, unknown or withdrawn token is indistinguishable from a bad one | `public-surfaces.flow.ts` |
| core → api + web | A rule is spent, not restated, on either side | `core-rules-drift.test.ts` |
| entitlements → every gated feature | A refusal is decided on the server and names the tier that includes the feature | **owed with feature 1** |
| sync → quotes / catalogs | An offline replay cannot create a duplicate, cross a tenant, or resurrect a deleted row | **owed** |
| web → api contracts | A web mirror type matches what the endpoint returns, field by field | **owed** — S16 proves a shape is used, never that its fields match |

## 4. What is owed right now

1. **`sync`** has no independent review and no seam test. It is the module most able to
   corrupt data quietly, because it replays writes the server did not originate.
2. **Entitlements seams** land with feature 1.
3. **Field-level web/API contract drift** has no guard: the mirrored-shape guard proves a
   type is referenced, not that its fields still match the endpoint.
4. **`reports`** has only been reviewed through another sweep, not on its own.
