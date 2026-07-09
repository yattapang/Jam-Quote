import { Injectable, NotFoundException } from "@nestjs/common";
import type { Job } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service.js";
import type { CreateJobInput, UpdateJobInput } from "./jobs.dto.js";

@Injectable()
export class JobsService {
  constructor(private readonly prisma: PrismaService) {}

  create(businessId: string, input: CreateJobInput): Promise<Job> {
    return this.prisma.job.create({ data: { ...input, businessId } });
  }

  findAll(businessId: string, clientId?: string): Promise<Job[]> {
    return this.prisma.job.findMany({
      where: { businessId, ...(clientId ? { clientId } : {}) },
      orderBy: { createdAt: "desc" },
    });
  }

  async findOne(businessId: string, id: string): Promise<Job> {
    const job = await this.prisma.job.findFirst({ where: { id, businessId } });
    if (!job) throw new NotFoundException("Job not found");
    return job;
  }

  async update(businessId: string, id: string, input: UpdateJobInput): Promise<Job> {
    await this.findOne(businessId, id);
    return this.prisma.job.update({ where: { id }, data: input });
  }

  async remove(businessId: string, id: string): Promise<void> {
    await this.findOne(businessId, id);
    await this.prisma.job.delete({ where: { id } });
  }
}
