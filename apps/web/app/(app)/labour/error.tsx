"use client";

import shared from "../shared.module.css";
import CatalogLoadError from "@/components/layout/CatalogLoadError";

/**
 * Segment error boundary for /labour. Only reached when getLabourRates
 * (lib/api-server.ts) rethrows — i.e. the API was reachable but this
 * request failed. An unreachable API still returns [] and renders the
 * page's normal (correct) empty state, no boundary involved.
 */
export default function LabourError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className={shared.page}>
      <CatalogLoadError label="labour rates" reset={reset} />
    </div>
  );
}
