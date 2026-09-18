"use client";

import shared from "../shared.module.css";
import CatalogLoadError from "@/components/layout/CatalogLoadError";

/**
 * Segment error boundary for /equipment. Only reached when getEquipment
 * (lib/api-server.ts) rethrows — i.e. the API was reachable but this
 * request failed. An unreachable API still returns [] and renders the
 * page's normal (correct) empty state, no boundary involved.
 */
export default function EquipmentError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className={shared.page}>
      <CatalogLoadError label="equipment" reset={reset} />
    </div>
  );
}
