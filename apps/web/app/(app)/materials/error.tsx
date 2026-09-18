"use client";

import shared from "../shared.module.css";
import CatalogLoadError from "@/components/layout/CatalogLoadError";

/**
 * Segment error boundary for /materials. Only reached when getMaterialFavourites
 * (lib/api-server.ts) rethrows — i.e. the API was reachable but this
 * request failed. An unreachable API still returns [] and renders the
 * page's normal (correct) empty state, no boundary involved.
 */
export default function MaterialsError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className={shared.page}>
      <CatalogLoadError label="materials" reset={reset} />
    </div>
  );
}
