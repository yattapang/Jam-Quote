/**
 * The cross-section integration suite: the REAL services over a REAL Postgres.
 *
 * Almost every other API test mocks Prisma, and several real defects crossed module
 * boundaries and hid behind those mocks (a job's placeholder cost priced a quote line;
 * the web's GCT default drifted from the API's; a quote's supplier ids travelled
 * onward through revise and convert unchecked). Each flow here drives the real
 * services end to end and asserts the invariants that LINK the sections.
 *
 * ONE database, ONE worker, for every flow. PGlite takes ~3.5s of CPU to boot, and one
 * boot per flow file in parallel starved the rest of `npm test` (web tests hit their 5s
 * timeout under turbo). Every flow creates its own fresh tenants (fixture.ts
 * `tenants()`), so sharing the database shares no rows between tests.
 *
 * The flows (each file's header states its invariants and limits):
 *   1. catalog-job-quote.flow.ts  — catalog -> job -> quote line price
 *   2. quote-lifecycle.flow.ts    — DRAFT -> sent -> public accept -> project -> invoice; GCT; revise
 *   3. invoice-balance.flow.ts    — payments, overpayment, void, retention vs every surface
 *   4. tenancy.flow.ts            — B vs A's ids across every id-taking method
 *   5. subscription.flow.ts       — renewsAt across ledger, admin console and sweep
 *   6. public-surfaces.flow.ts    — share tokens: own document only, uniform 404s
 * Drift checks that pair with these live in core-rules-drift.test.ts.
 *
 * `it.fails` tests named "KNOWN DEFECT Dn" pin a defect this suite found and did not
 * fix: they pass while the defect exists and fail once it is fixed, at which point the
 * fixer flips them to `it`.
 */
import { afterAll, beforeAll } from "vitest";
import { startIntegration, type Integration } from "./fixture.js";
import { catalogJobQuoteFlow } from "./catalog-job-quote.flow.js";
import { quoteLifecycleFlow } from "./quote-lifecycle.flow.js";
import { invoiceBalanceFlow } from "./invoice-balance.flow.js";
import { tenancyFlow } from "./tenancy.flow.js";
import { subscriptionFlow } from "./subscription.flow.js";
import { publicSurfacesFlow } from "./public-surfaces.flow.js";

let env: Integration | undefined;
beforeAll(async () => {
  env = await startIntegration();
}, 120_000);
afterAll(async () => {
  await env?.close();
});

const shared = (): Integration => {
  if (!env) throw new Error("integration database did not start");
  return env;
};

catalogJobQuoteFlow(shared);
quoteLifecycleFlow(shared);
invoiceBalanceFlow(shared);
tenancyFlow(shared);
subscriptionFlow(shared);
publicSurfacesFlow(shared);
