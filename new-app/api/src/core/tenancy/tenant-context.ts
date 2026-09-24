/**
 * CORE: tenancy — the application half of tenant isolation.
 *
 * Owns:        the answer to "which tenant is this work for?", and putting that
 *              answer where the database's row-level-security policies can read it.
 * Trusted by:  every module. Nothing else may set `app.tenant_id`.
 * Never does:  accept a tenant id from a request body, a query string, a header or
 *              a token claim. The tenant comes from the authenticated session,
 *              resolved server-side. A caller-supplied id is a request, not a fact.
 *
 * HOW ISOLATION ACTUALLY WORKS HERE
 *
 * Three layers (Rule 4), and this file is the seam between two of them:
 *
 *   1. Every tenant-owned table carries `tenant_id`.               — db/schema.prisma
 *   2. Row-level security refuses rows that do not match           — db/policies/
 *      `current_setting('app.tenant_id')`.
 *   3. The application sets that variable, per transaction.        — THIS FILE
 *
 * The important property of this arrangement is what happens when layer 3 is
 * forgotten: the policies see no tenant and return NOTHING. A missing
 * `withTenant` is an empty result, loudly wrong in development. In the previous
 * application the same mistake returned every tenant's rows — see the Phase 0
 * audit.
 *
 * WHY THE SETTING IS TRANSACTION-LOCAL
 *
 * `set_config(..., true)` scopes the value to the current transaction, so it is
 * discarded at COMMIT or ROLLBACK. Session-scoped (`false`) would be faster and is
 * a trap: connections are pooled, so a tenant's id would outlive its request and be
 * inherited by whichever request picked up that connection next. That is a
 * cross-tenant read with no bug anywhere in the query code, and it is the single
 * most likely way to get this wrong.
 */

import { isUuid } from "@pryvis/core";

/**
 * The minimum of a Prisma client this module needs.
 *
 * Declared structurally rather than importing `PrismaClient`, so this file — the
 * one that decides what "in a tenant" means — does not depend on a generated
 * artefact, and so its tests can drive it with any transactional client, including
 * the raw PGlite used by the database tests.
 */
export interface TransactionalClient {
  $executeRawUnsafe(query: string, ...values: unknown[]): Promise<number>;
  $transaction<T>(fn: (tx: TransactionalClient) => Promise<T>): Promise<T>;
}

/** Thrown when a tenant id is not a shape this system ever issues. */
export class InvalidTenantIdError extends Error {
  constructor(received: string) {
    // The value is included because it never comes from a caller — it comes from
    // our own session store, so an invalid one is our bug and the operator needs
    // to see it. If that ever stops being true, this message must stop echoing it.
    super(`Not a tenant id: ${JSON.stringify(received)}`);
    this.name = "InvalidTenantIdError";
  }
}

/**
 * Is this the shape of an id we could have issued?
 *
 * `set_config` takes a string and the policy casts it to uuid, so a malformed value would surface
 * as a database error at some later, confusing point. Validating here makes the failure name the
 * real problem at the boundary where it entered.
 *
 * THE CHECK LIVES IN `@pryvis/core`, NOT HERE, and that is the fix for a real defect. This file
 * carried its own regex requiring UUID version 1-5, written before the decision to issue v7
 * (ADR 0019). The moment ids became v7, this function refused every genuine tenant id - every
 * request, every test, a total outage. It was caught only because the audit log's tests used
 * realistic v7 ids instead of hand-written v4 fixtures.
 *
 * Two copies of a rule diverge at exactly the moment one of them changes (Rule 7). There is now
 * one definition of "a uuid we can hold", beside one of "a uuid we made", and this imports it.
 * v4 is accepted because the database's gen_random_uuid() default is a deliberate fallback for
 * rows created by a migration or a script.
 */
export function assertTenantId(tenantId: string): void {
  if (!isUuid(tenantId)) throw new InvalidTenantIdError(tenantId);
}

/**
 * Runs `work` inside a transaction with this tenant in scope.
 *
 * Every read and write a module performs goes through here. The tenant id is
 * BOUND as a parameter, never interpolated into the SQL: `set_config` accepts a
 * parameter perfectly well, and a string-built `SET` statement is how a settings
 * call becomes an injection point.
 *
 * @throws InvalidTenantIdError before opening a transaction, so a bad id cannot
 *         leave a connection sitting in a half-configured state.
 */
export async function withTenant<T>(
  prisma: TransactionalClient,
  tenantId: string,
  work: (tx: TransactionalClient) => Promise<T>,
): Promise<T> {
  assertTenantId(tenantId);

  return prisma.$transaction(async (tx) => {
    // `true` = local to this transaction. See the header: session scope plus a
    // connection pool is a cross-tenant read waiting to happen.
    await tx.$executeRawUnsafe(`SELECT set_config('app.tenant_id', $1, true)`, tenantId);
    return work(tx);
  });
}

/**
 * Runs `work` with NO tenant in scope, for the few operations that legitimately
 * have none: signing in (the tenant is not known until the user is), and platform
 * administration.
 *
 * It exists so that "no tenant" is something a reader can see and a reviewer can
 * grep for, rather than the accidental default. It grants nothing by itself — with
 * no tenant set, the policies still refuse every tenant-owned row, which is why
 * these operations must use tables that are deliberately not tenant-scoped, or
 * run as a role with its own, separately reviewed policies.
 */
export async function withoutTenant<T>(
  prisma: TransactionalClient,
  reason: "authentication" | "platform-admin",
  work: (tx: TransactionalClient) => Promise<T>,
): Promise<T> {
  void reason; // named for the reader and for review; nothing branches on it
  return prisma.$transaction(async (tx) => work(tx));
}
