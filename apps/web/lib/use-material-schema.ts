"use client";

import { useEffect, useState } from "react";
import { fetchMaterialSchema, type ApiMaterialSchema } from "@/lib/api-client";

/**
 * The material attribute schema changes only when the platform ships new
 * curated rows or this contractor adds a value of their own, so it is fetched
 * once per page load and shared by every consumer (the materials page form and
 * the quote builder's inline "+ Add material…" modal both mount MaterialForm).
 *
 * The cache is a module-level promise rather than state so two components
 * mounting in the same tick share one request instead of racing.
 */
let cached: Promise<ApiMaterialSchema> | null = null;

export function loadMaterialSchema(): Promise<ApiMaterialSchema> {
  cached ??= fetchMaterialSchema();
  return cached;
}

/** Drops the cache so the next read re-fetches — call after a write that adds
 * a tenant option, otherwise the new value is missing from the picker until a
 * page reload. */
export function invalidateMaterialSchema(): void {
  cached = null;
}

export interface MaterialSchemaState {
  schema: ApiMaterialSchema | null;
  loading: boolean;
  /** True when the schema could not be fetched. The form stays usable — spec
   * fields degrade to plain text inputs — rather than blocking a contractor
   * from saving a material because a secondary request failed. */
  failed: boolean;
}

export function useMaterialSchema(): MaterialSchemaState {
  const [schema, setSchema] = useState<ApiMaterialSchema | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    loadMaterialSchema()
      .then((s) => {
        if (active) setSchema(s);
      })
      .catch(() => {
        if (active) setFailed(true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  return { schema, loading, failed };
}
