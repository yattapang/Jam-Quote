import { Injectable, NotFoundException } from "@nestjs/common";
import type { Supplier } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service.js";
import type { CreateSupplierInput, UpdateSupplierInput } from "./catalogs.dto.js";

/**
 * Suppliers are not business-scoped in the schema (they're a shared directory,
 * e.g. H&L True Value) — unlike the other catalog resources.
 */
@Injectable()
export class SuppliersService {
  constructor(private readonly prisma: PrismaService) {}

  create(input: CreateSupplierInput): Promise<Supplier> {
    return this.prisma.supplier.create({ data: input });
  }

  findAll(): Promise<Supplier[]> {
    return this.prisma.supplier.findMany({ orderBy: { name: "asc" } });
  }

  async findOne(id: string): Promise<Supplier> {
    const supplier = await this.prisma.supplier.findUnique({ where: { id } });
    if (!supplier) throw new NotFoundException("Supplier not found");
    return supplier;
  }

  async update(id: string, input: UpdateSupplierInput): Promise<Supplier> {
    await this.findOne(id);
    return this.prisma.supplier.update({ where: { id }, data: input });
  }

  async remove(id: string): Promise<void> {
    await this.findOne(id);
    await this.prisma.supplier.delete({ where: { id } });
  }
}
