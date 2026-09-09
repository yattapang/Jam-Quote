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
      where: { businessId, ...(clientId ? { clientId } : {}) },
      orderBy: { createdAt: "desc" },
    });
  }

  async findOne(businessId: string, id: string): Promise<Project> {
    const project = await this.prisma.project.findFirst({ where: { id, businessId } });
    if (!project) throw new NotFoundException("Project not found");
    return project;
  }

  async update(businessId: string, id: string, input: UpdateProjectInput): Promise<Project> {
    await this.findOne(businessId, id);
    await assertClientOwned(this.prisma, businessId, input.clientId);
    return this.prisma.project.update({ where: { id }, data: input });
  }

  async remove(businessId: string, id: string): Promise<void> {
    await this.findOne(businessId, id);
    await this.prisma.project.delete({ where: { id } });
  }
}
