import { NotFoundException } from "@nestjs/common";
import type { PrismaService } from "../prisma/prisma.service.js";

/**
 * Ownership checks for ids that arrive in a request BODY.
 *
 * ## Why this file exists
 *
 * Every tenant read and write is scoped by `businessId`, and that was taken to
 * mean the tenancy boundary held. It did not, for one case: a foreign key the
 * CALLER supplies. `POST /invoices` with another contractor's `clientId` was
 * accepted, because the row being written is scoped (it is your invoice) and the
 * database only enforces that the client EXISTS, never that it is yours.
 *
 * The consequence was not theoretical. `sendReminderEmail` read that client with
 * `findUnique({ where: { id: invoice.clientId } })` — no `businessId` — returned
 * their email address in the response body, and sent that person an email under
 * the attacker's business name. Through a shared quote it returned their full
 * name over the unauthenticated surface.
 *
 * `PurchasesService` had this right from the start, with the comment that names
 * the principle: **an id is not a capability.** Quotes, invoices and projects did
 * not, and `TESTING.md` recorded — wrongly — that tenant checks made it safe.
 * That line is why it survived a security review.
 *
 * ## Why a function rather than an injectable
 *
 * Four services need it, in two modules that do not currently share a provider.
 * A free function taking the Prisma client is a smaller change than wiring a new
 * injectable into each module, and there is nothing here to mock.
 *
 * ## Soft-deleted rows do not count
 *
 * `deletedAt` is a tombstone for offline sync. A client the contractor deleted is
 * not one they may attach new work to, so the checks below exclude them — the
 * same reason `findAll` does.
 */

/** A shape narrow enough to accept the real client or a fake in a test. */
type ClientLookup = Pick<PrismaService, "client" | "project">;

/**
 * Refuses unless `clientId` names a live client of THIS business.
 *
 * A missing id is not an error — `clientId` is optional on every caller, and
 * "no client yet" is a normal state for a draft quote.
 *
 * Throws `NotFoundException` rather than `ForbiddenException` deliberately: a
 * 403 would confirm the id names a real client of some other tenant, which is
 * the fact being protected. The same reasoning the public share views use for
 * DRAFT vs unknown token.
 */
export async function assertClientOwned(
  prisma: ClientLookup,
  businessId: string,
  clientId?: string | null,
): Promise<void> {
  if (!clientId) return;
  const client = await prisma.client.findFirst({
    where: { id: clientId, businessId, deletedAt: null },
    select: { id: true },
  });
  if (!client) throw new NotFoundException("Client not found");
}

/** As above, for a caller-supplied `projectId`. */
export async function assertProjectOwned(
  prisma: ClientLookup,
  businessId: string,
  projectId?: string | null,
): Promise<void> {
  if (!projectId) return;
  const project = await prisma.project.findFirst({
    where: { id: projectId, businessId, deletedAt: null },
    select: { id: true },
  });
  if (!project) throw new NotFoundException("Project not found");
}

/**
 * The same question without a throw, for the offline sync push.
 *
 * Sync answers per change with an OUTCOME rather than an exception — one bad row
 * in a batch must not fail the batch. Three answers rather than two, because
 * "not usable" and "not yours" are different facts and the client acts on them
 * differently: `"foreign"` is documented as belonging to another business, and a
 * device treating that as "discard my copy" would be right to. A client of THIS
 * business that has been deleted must not cause the contractor's own project to
 * be thrown away.
 */
export type ClientRefState = "owned" | "foreign" | "deleted";

export async function clientReferenceState(
  prisma: ClientLookup,
  businessId: string,
  clientId?: string | null,
): Promise<ClientRefState> {
  if (!clientId) return "owned";
  const client = await prisma.client.findFirst({
    where: { id: clientId, businessId },
    select: { deletedAt: true },
  });
  if (!client) return "foreign";
  return client.deletedAt ? "deleted" : "owned";
}
