import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import type { MaterialAttributeKind } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service.js";
import {
  buildSearchText,
  composeMaterialName,
  normalizeOptionValue,
  type AttributeShape,
} from "./material-schema.js";

export interface AttributeOptionView {
  id: string;
  value: string;
  label: string;
  custom: boolean;
}

export interface AttributeView extends AttributeShape {
  id: string;
  unit: string | null;
  sort: number;
  custom: boolean;
  options: AttributeOptionView[];
}

export interface CategoryView {
  id: string;
  key: string;
  label: string;
  sort: number;
  custom: boolean;
  attributes: AttributeView[];
}

export interface UnitView {
  id: string;
  key: string;
  label: string;
  sort: number;
  custom: boolean;
}

export interface MaterialSchemaView {
  categories: CategoryView[];
  units: UnitView[];
}

/** Result of validating a material write against its category's attributes. */
export interface NormalizedMaterial {
  specs: Record<string, string> | null;
  name: string;
  searchText: string;
}

/**
 * Owns the material attribute schema: what categories exist, what attributes
 * each asks for, what values those attributes allow, and how a material write
 * is validated and normalized against all of that.
 *
 * Visibility rule everywhere in here: a business sees CURATED rows
 * (businessId NULL) plus ITS OWN (businessId = theirs), never another
 * tenant's. Every read is filtered on that, and every id supplied by a client
 * is re-checked against it before use — an id is not a capability.
 */
@Injectable()
export class MaterialSchemaService {
  private readonly logger = new Logger(MaterialSchemaService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Curated + this tenant's own, as one tree for the pickers/forms. */
  async getSchema(businessId: string): Promise<MaterialSchemaView> {
    const visible = { OR: [{ businessId: null }, { businessId }] };

    const [categories, units] = await Promise.all([
      this.prisma.materialCategoryDef.findMany({
        where: { ...visible, deletedAt: null },
        orderBy: [{ sort: "asc" }, { label: "asc" }],
        include: {
          attributes: {
            where: { ...visible, deletedAt: null },
            orderBy: [{ sort: "asc" }, { label: "asc" }],
            include: {
              options: {
                where: { ...visible, deletedAt: null },
                orderBy: [{ sort: "asc" }, { label: "asc" }],
              },
            },
          },
        },
      }),
      this.prisma.materialUnit.findMany({
        where: { ...visible, deletedAt: null },
        orderBy: [{ sort: "asc" }, { label: "asc" }],
      }),
    ]);

    return {
      categories: categories.map((c) => ({
        id: c.id,
        key: c.key,
        label: c.label,
        sort: c.sort,
        custom: c.businessId !== null,
        attributes: c.attributes.map((a) => ({
          id: a.id,
          key: a.key,
          label: a.label,
          kind: a.kind as AttributeShape["kind"],
          unit: a.unit,
          required: a.required,
          includeInName: a.includeInName,
          nameOrder: a.nameOrder,
          sort: a.sort,
          custom: a.businessId !== null,
          options: a.options.map((o) => ({
            id: o.id,
            value: o.value,
            label: o.label,
            custom: o.businessId !== null,
          })),
        })),
      })),
      units: units.map((u) => ({
        id: u.id,
        key: u.key,
        label: u.label,
        sort: u.sort,
        custom: u.businessId !== null,
      })),
    };
  }

  /**
   * Confirms a client-supplied unit id is one this business may actually use.
   * Without this check a tenant could reference another tenant's private unit
   * by guessing its id — ids are not capabilities.
   */
  async assertUnitVisible(businessId: string, unitId: string): Promise<void> {
    const unit = await this.prisma.materialUnit.findFirst({
      where: { id: unitId, deletedAt: null, OR: [{ businessId: null }, { businessId }] },
      select: { id: true },
    });
    if (!unit) throw new BadRequestException("Unknown unit");
  }

  /**
   * Validates and normalizes a material write against its category.
   *
   * - unknown spec keys are REJECTED (they would be invisible in the form and
   *   silently un-editable, which is how the pre-2a blob rotted);
   * - missing required attributes are rejected;
   * - NUMBER values must parse;
   * - an ENUM value outside the vocabulary is ACCEPTED and recorded as a
   *   tenant-scoped option. That is the deliberate trade from #26: a
   *   contractor must never be blocked from entering the material actually in
   *   front of them, but the value is captured as vocabulary rather than free
   *   text so it is reusable and stops "cedar"/"Cedar" diverging. The UI makes
   *   this an explicit "add" action so a typo is not silently enshrined.
   */
  async normalizeForWrite(
    businessId: string,
    input: {
      categoryDefId?: string | null;
      specs?: Record<string, string> | null;
      name?: string;
      nameCustom?: boolean;
      description?: string | null;
    },
    existing?: {
      categoryDefId: string | null;
      specs: Record<string, string> | null;
      name: string;
      nameCustom: boolean;
      description: string | null;
    },
  ): Promise<NormalizedMaterial> {
    const categoryDefId =
      input.categoryDefId !== undefined ? input.categoryDefId : (existing?.categoryDefId ?? null);
    const rawSpecs = input.specs !== undefined ? input.specs : (existing?.specs ?? null);
    const description =
      input.description !== undefined ? input.description : (existing?.description ?? null);
    const nameCustom = input.nameCustom ?? existing?.nameCustom ?? false;
    const providedName = input.name ?? existing?.name ?? "";

    if (!categoryDefId) {
      // Uncategorized material: nothing to validate against, so the name is
      // whatever the contractor typed.
      const name = providedName.trim();
      if (!name) throw new BadRequestException("A material with no category needs a name");
      return { specs: rawSpecs ?? null, name, searchText: buildSearchText(name, description, rawSpecs) };
    }

    const category = await this.prisma.materialCategoryDef.findFirst({
      where: { id: categoryDefId, deletedAt: null, OR: [{ businessId: null }, { businessId }] },
      include: {
        attributes: {
          where: { deletedAt: null, OR: [{ businessId: null }, { businessId }] },
          include: {
            options: { where: { deletedAt: null, OR: [{ businessId: null }, { businessId }] } },
          },
        },
      },
    });
    if (!category) throw new BadRequestException("Unknown material category");

    const byKey = new Map(category.attributes.map((a) => [a.key, a]));
    const specs: Record<string, string> = {};

    for (const [key, rawValue] of Object.entries(rawSpecs ?? {})) {
      const value = String(rawValue ?? "").trim();
      if (!value) continue; // empty = "not set", not an error

      const attribute = byKey.get(key);
      if (!attribute) {
        throw new BadRequestException(
          `"${key}" is not an attribute of ${category.label}. Add it to the category first.`,
        );
      }

      if (attribute.kind === ("NUMBER" as MaterialAttributeKind) && !Number.isFinite(Number(value))) {
        throw new BadRequestException(`${attribute.label} must be a number`);
      }

      if (attribute.kind === ("ENUM" as MaterialAttributeKind)) {
        const normalized = normalizeOptionValue(value);
        const known = attribute.options.find((o) => o.value === normalized);
        if (!known) {
          await this.prisma.materialAttributeOption.create({
            data: {
              attributeId: attribute.id,
              businessId, // tenant-scoped: never widens the curated vocabulary
              value: normalized,
              label: value,
              sort: 900,
            },
          });
          this.logger.log(
            `business ${businessId} added "${value}" to ${category.key}.${attribute.key}`,
          );
        }
      }

      specs[key] = value;
    }

    for (const attribute of category.attributes) {
      if (attribute.required && !specs[attribute.key]) {
        throw new BadRequestException(`${attribute.label} is required for ${category.label}`);
      }
    }

    const shapes: AttributeShape[] = category.attributes.map((a) => ({
      key: a.key,
      label: a.label,
      kind: a.kind as AttributeShape["kind"],
      required: a.required,
      includeInName: a.includeInName,
      nameOrder: a.nameOrder,
    }));

    // A pinned name is never recomposed — it is already on documents the
    // contractor has sent to customers.
    const composed = composeMaterialName(category.label, shapes, specs);
    const name = nameCustom ? providedName.trim() || composed : composed;
    if (!name) throw new BadRequestException("Could not build a name for this material");

    return { specs: Object.keys(specs).length ? specs : null, name, searchText: buildSearchText(name, description, specs) };
  }
}
