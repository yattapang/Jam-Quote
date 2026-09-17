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

/** As above, for the catalog/job-costing foreign keys a caller can supply. */
type CatalogLookup = Pick<
  PrismaService,
  "materialFavourite" | "labourRate" | "equipmentItem" | "supplier"
>;

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
/**
 * As above, for a caller-supplied `labourRateId`.
 *
 * Moved here from `PurchasesService`'s private copy so jobs (which has the
 * same shaped hole — `JobComponent.labourRateId`) spends the identical check
 * rather than growing a second copy that drifts, as `assertProjectOwned` once
 * did between purchases and quotes.
 */
/**
 * `allowDeleted` drops the `deletedAt: null` filter entirely, for a caller
 * that pins its own price at record time rather than doing a live lookup —
 * `PurchasesService.createLabour`'s labour entry stores a snapshot
 * (rateCents, description) and routinely arrives as an offline replay well
 * after the contractor deleted the rate. Refusing that replay would be wrong;
 * a rate this business never owned (foreign or made-up) must still be
 * refused either way, which is the ownership half this shares with every
 * other caller. Absent, behaviour is unchanged: a soft-deleted rate is
 * treated as gone, as it is for a live check-then-price lookup.
 */
export async function assertLabourRateOwned(
  prisma: CatalogLookup,
  businessId: string,
  rateId?: string | null,
  options?: { allowDeleted?: boolean },
): Promise<void> {
  if (!rateId) return;
  const rate = await prisma.labourRate.findFirst({
    where: options?.allowDeleted
      ? { id: rateId, businessId }
      : { id: rateId, businessId, deletedAt: null },
    select: { id: true },
  });
  if (!rate) throw new NotFoundException("Labour rate not found");
}

/** As above, for a caller-supplied `materialFavouriteId`. */
export async function assertMaterialFavouriteOwned(
  prisma: CatalogLookup,
  businessId: string,
  materialFavouriteId?: string | null,
): Promise<void> {
  if (!materialFavouriteId) return;
  const material = await prisma.materialFavourite.findFirst({
    where: { id: materialFavouriteId, businessId, deletedAt: null },
    select: { id: true },
  });
  if (!material) throw new NotFoundException("Material favourite not found");
}

/** As above, for a caller-supplied `equipmentItemId`. */
export async function assertEquipmentItemOwned(
  prisma: CatalogLookup,
  businessId: string,
  equipmentItemId?: string | null,
): Promise<void> {
  if (!equipmentItemId) return;
  const item = await prisma.equipmentItem.findFirst({
    where: { id: equipmentItemId, businessId, deletedAt: null },
    select: { id: true },
  });
  if (!item) throw new NotFoundException("Equipment item not found");
}

/**
 * As above, for a caller-supplied `supplierId`.
 *
 * `Supplier.businessId` is nullable — a NULL row is legacy platform data no
 * tenant owns (see the model comment in schema.prisma) — so it is deliberately
 * excluded rather than matched: a NULL-owner supplier is not "this business's"
 * either.
 */
export async function assertSupplierOwned(
  prisma: CatalogLookup,
  businessId: string,
  supplierId?: string | null,
): Promise<void> {
  if (!supplierId) return;
  const supplier = await prisma.supplier.findFirst({
    where: { id: supplierId, businessId, deletedAt: null },
    select: { id: true },
  });
  if (!supplier) throw new NotFoundException("Supplier not found");
}

/**
 * Batched form of the three catalog checks above, for a component array
 * (`JobComponent[]`) rather than one field. One query per referenced table
 * instead of one per component, and duplicate ids across components cost
 * nothing extra: the id set is de-duped before the query.
 *
 * Throws the first missing kind found (material, then labour, then
 * equipment) with the SAME "not found" message a single-field check would
 * give, so a foreign id and a made-up id are indistinguishable to the caller.
 */
/**
 * Ids already persisted on the record being updated. These stay allowed even
 * if the row they name has since been soft-deleted elsewhere — the record
 * that already references them is not required to drop that reference just
 * because the catalog row was later deleted. They must still belong to THIS
 * business: a foreign id is never grandfathered in.
 *
 * Absent (CREATE, or an UPDATE not passing this) every id is treated as new
 * and must be live.
 */
export interface JobComponentRefsAllowedDeleted {
  materialFavouriteIds?: ReadonlySet<string>;
  labourRateIds?: ReadonlySet<string>;
  equipmentItemIds?: ReadonlySet<string>;
}

/**
 * Takes a query FUNCTION rather than the Prisma delegate itself: each
 * delegate's real `findMany` accepts a model-specific args type (not
 * `unknown`), so a single helper parameter typed to hold any of the three
 * delegates cannot call it directly without narrowing that TypeScript can't
 * do here. The caller already has the concretely-typed delegate in scope, so
 * it does the narrowing simply by writing the call.
 */
async function assertRefKindOwned(
  findMany: (where: Record<string, unknown>) => Promise<Array<{ id: string }>>,
  businessId: string,
  ids: readonly string[],
  allowedDeletedIds: ReadonlySet<string> | undefined,
  message: string,
): Promise<void> {
  if (ids.length === 0) return;
  const allowed = allowedDeletedIds ?? new Set<string>();
  const newIds = ids.filter((id) => !allowed.has(id));
  const grandfatheredIds = ids.filter((id) => allowed.has(id));

  if (newIds.length > 0) {
    const rows = await findMany({ id: { in: newIds }, businessId, deletedAt: null });
    if (rows.length !== newIds.length) throw new NotFoundException(message);
  }
  if (grandfatheredIds.length > 0) {
    // No deletedAt filter: already-persisted ids stay allowed once deleted,
    // as long as they still belong to this business.
    const rows = await findMany({ id: { in: grandfatheredIds }, businessId });
    if (rows.length !== grandfatheredIds.length) throw new NotFoundException(message);
  }
}

export async function assertJobComponentRefsOwned(
  prisma: CatalogLookup,
  businessId: string,
  components: ReadonlyArray<{
    materialFavouriteId?: string | null;
    labourRateId?: string | null;
    equipmentItemId?: string | null;
  }>,
  allowedDeleted?: JobComponentRefsAllowedDeleted,
): Promise<void> {
  const materialIds = [...new Set(components.map((c) => c.materialFavouriteId).filter((v): v is string => Boolean(v)))];
  const labourIds = [...new Set(components.map((c) => c.labourRateId).filter((v): v is string => Boolean(v)))];
  const equipmentIds = [...new Set(components.map((c) => c.equipmentItemId).filter((v): v is string => Boolean(v)))];

  await assertRefKindOwned(
    (where) => prisma.materialFavourite.findMany({ where, select: { id: true } }),
    businessId,
    materialIds,
    allowedDeleted?.materialFavouriteIds,
    "Material favourite not found",
  );
  await assertRefKindOwned(
    (where) => prisma.labourRate.findMany({ where, select: { id: true } }),
    businessId,
    labourIds,
    allowedDeleted?.labourRateIds,
    "Labour rate not found",
  );
  await assertRefKindOwned(
    (where) => prisma.equipmentItem.findMany({ where, select: { id: true } }),
    businessId,
    equipmentIds,
    allowedDeleted?.equipmentItemIds,
    "Equipment item not found",
  );
}

/**
 * As above, for a single caller-supplied `supplierId` on UPDATE: the id
 * already persisted on the record stays allowed even if soft-deleted since,
 * as long as it still belongs to this business. Pass the record's current
 * `supplierId` (or undefined/null on CREATE, where every id must be live).
 */
export async function assertSupplierOwnedForUpdate(
  prisma: CatalogLookup,
  businessId: string,
  supplierId: string | undefined | null,
  currentSupplierId: string | undefined | null,
): Promise<void> {
  if (!supplierId) return;
  if (supplierId === currentSupplierId) {
    const supplier = await prisma.supplier.findFirst({
      where: { id: supplierId, businessId },
      select: { id: true },
    });
    if (!supplier) throw new NotFoundException("Supplier not found");
    return;
  }
  await assertSupplierOwned(prisma, businessId, supplierId);
}

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
