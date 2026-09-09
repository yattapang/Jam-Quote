/**
 * Finds rows whose `clientId` or `projectId` points at another tenant's record.
 *
 * ## Why this exists
 *
 * A caller-supplied `clientId` was never checked for ownership (F1 in
 * `REVIEW-FINDINGS.md`). `assertClientOwned` now refuses one on every write, but
 * **that only stops NEW bad rows.** Every row written before it existed was never
 * validated, and the read that actually leaked —
 * `sendReminderEmail` → `client.findFirst` — would still have found a foreign
 * client if one had been attached. That read is now scoped too, so the leak is
 * closed either way; this script answers the separate question of whether any bad
 * data is sitting in the database, because bad rows also propagate:
 * `revise`, `createVariation` and `convertFromQuote` copy `clientId` forward
 * faithfully, so one bad reference multiplies rather than ageing out.
 *
 * ## Table names
 *
 * `Project` maps to the physical table `"Job"` and `projectId` to the column
 * `"jobId"` — the vocabulary rename (JOB = priced template, PROJECT = client
 * work) deliberately left the physical schema alone. Raw SQL has to use the
 * physical names.
 *
 * ## Running it
 *
 *   node --env-file=.env scripts/audit-client-refs.mjs
 *
 * from `apps/api`, against whichever database `DATABASE_URL` names. Read-only —
 * it reports, it does not repair. Exits 1 if it finds anything, so it can gate a
 * deploy.
 *
 * If it finds rows, the fix is a decision rather than a script: detaching the
 * client silently rewrites a document a contractor may already have sent, so the
 * owner should see the list first.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

try {
  const clientRefs = await prisma.$queryRaw`
    SELECT 'quote' AS kind, q.id, q."businessId" AS "ownerBusinessId", c."businessId" AS "refBusinessId"
      FROM "Quote" q JOIN "Client" c ON c.id = q."clientId"
     WHERE q."businessId" <> c."businessId"
    UNION ALL
    SELECT 'invoice', i.id, i."businessId", c."businessId"
      FROM "Invoice" i JOIN "Client" c ON c.id = i."clientId"
     WHERE i."businessId" <> c."businessId"
    UNION ALL
    SELECT 'project', j.id, j."businessId", c."businessId"
      FROM "Job" j JOIN "Client" c ON c.id = j."clientId"
     WHERE j."businessId" <> c."businessId"`;

  const projectRefs = await prisma.$queryRaw`
    SELECT 'quote' AS kind, q.id, q."businessId" AS "ownerBusinessId", j."businessId" AS "refBusinessId"
      FROM "Quote" q JOIN "Job" j ON j.id = q."jobId"
     WHERE q."businessId" <> j."businessId"
    UNION ALL
    SELECT 'invoice', i.id, i."businessId", j."businessId"
      FROM "Invoice" i JOIN "Job" j ON j.id = i."jobId"
     WHERE i."businessId" <> j."businessId"`;

  const report = (label, rows) => {
    console.log(`${label}: ${rows.length}`);
    for (const r of rows) {
      console.log(`  ${r.kind} ${r.id} owned by ${r.ownerBusinessId} -> references ${r.refBusinessId}`);
    }
  };

  report("cross-tenant client references", clientRefs);
  report("cross-tenant project references", projectRefs);

  const total = clientRefs.length + projectRefs.length;
  console.log(total === 0 ? "\nClean." : `\n${total} row(s) need an owner decision — see the header of this file.`);
  process.exitCode = total === 0 ? 0 : 1;
} finally {
  await prisma.$disconnect();
}
