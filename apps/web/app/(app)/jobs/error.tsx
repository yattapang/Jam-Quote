"use client";

import shared from "../shared.module.css";
import CatalogLoadError from "@/components/layout/CatalogLoadError";

/**
 * Segment error boundary for /jobs. Reached when getJobs, getMaterialFavourites,
 * getLabourRates, or getEquipment (lib/api-server.ts, all fetched together by
 * this page) rethrow — i.e. the API was reachable but one of those requests
 * failed. An unreachable API still returns [] from all four and renders the
 * page's normal (correct) empty state, no boundary involved.
 */
export default function JobsError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className={shared.page}>
      <CatalogLoadError label="jobs" reset={reset} />
    </div>
  );
}
