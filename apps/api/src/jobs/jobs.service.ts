import { Injectable, NotFoundException } from "@nestjs/common";
import type { Project } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service.js";
import type { CreateJobInput, UpdateJobInput } from "./jobs.dto.js";

@Injectable()
export class JobsService {
  constructor(private readonly prisma: PrismaService) {}

  create(businessId: string, input: CreateJobInput): Promise<Project> {
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

  async update(businessId: string, id: string, input: UpdateJobInput): Promise<Project> {
    await this.findOne(businessId, id);
    return this.prisma.project.update({ where: { id }, data: input });
  }

  async remove(businessId: string, id: string): Promise<void> {
    await this.findOne(businessId, id);
    await this.prisma.project.delete({ where: { id } });
  }
}
