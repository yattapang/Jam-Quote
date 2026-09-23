import { Injectable, NotFoundException } from "@nestjs/common";
import type { Project } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service.js";
import type { CreateProjectInput, UpdateProjectInput } from "./projects.dto.js";
import { assertClientOwned } from "../common/assert-owned.js";

@Injectable()
export class ProjectsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(businessId: string, input: CreateProjectInput): Promise<Project> {
    // An id in the body is not a capability: the row being written is scoped to
    // this business, but `clientId` arrives from the caller and the database only
    // enforces that the client exists.
    await assertClientOwned(this.prisma, businessId, input.clientId);
    return this.prisma.project.create({ data: { ...input, businessId } });
  }

  findAll(businessId: string, clientId?: string): Promise<Project[]> {
    return this.prisma.project.findMany({
      // `deletedAt` is the soft-delete tombstone written both by `remove` below
      // and by the mobile sync path (sync.service.ts). Without this, a project
      // deleted from either path kept appearing — and being openable and
      // editable — everywhere on the web.
      where: { businessId, deletedAt: null, ...(clientId ? { clientId } : {}) },
      orderBy: { createdAt: "desc" },
    });
  }

  async findOne(businessId: string, id: string): Promise<Project> {
    const project = await this.prisma.project.findFirst({
      where: { id, businessId, deletedAt: null },
    });
    if (!project) throw new NotFoundException("Project not found");
    return project;
  }

  async update(businessId: string, id: string, input: UpdateProjectInput): Promise<Project> {
    await this.findOne(businessId, id);
    await assertClientOwned(this.prisma, businessId, input.clientId);
    return this.prisma.project.update({ where: { id }, data: input });
  }

  /**
   * Soft delete, for the same reason `QuotesService.remove` was moved off a
   * hard delete: `Project.deletedAt` has always been declared "soft-delete for
   * offline sync", and the mobile sync path (sync.service.ts `applyProject`)
   * already writes it rather than deleting the row — a hard delete here was a
   * second, contradictory convention on the same model.
   *
   * It also protects job costing. `Purchase.projectId` and
   * `LabourEntry.projectId` are `onDelete: SetNull`, and `Quote`/`Invoice`
   * hold the project optionally — so a hard delete did not remove those costs,
   * it silently detached them. They kept existing, unreachable by any
   * project's profit query (which filters `where: { businessId, projectId }`),
   * while the revenue side survived because invoices are not deleted. The
   * job-costing answer for that work vanished without the cost or revenue
   * actually going anywhere, and a past month's figures could change
   * retroactively as a result.
   *
   * Purchases, labour entries, quotes and invoices are left untouched: they
   * still point at this project's id, and `findAll`/`findOne` above now
   * exclude the tombstoned project itself from view.
   */
  async remove(businessId: string, id: string): Promise<void> {
    await this.findOne(businessId, id);
    await this.prisma.project.update({ where: { id }, data: { deletedAt: new Date() } });
  }
}
