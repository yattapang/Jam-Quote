/**
 * @pryvis/core — the rules every surface shares.
 *
 * Consumed from source, never through a built `dist` (ADR 0012, answering the Phase 0 finding
 * that the previous application's core went stale until someone remembered to rebuild it).
 *
 * Today it holds row identity. The money, tax, totals, settlement and jurisdiction rules arrive
 * here as their own reviewed port from `original-app/packages/core` — deliberately adapted rather
 * than copied, because the names change (`customer`, `…MinorUnits`) and a copy would carry the
 * old vocabulary into the new schema.
 */
export { isRowId, newRowId, rowIdTimestamp } from "./identity/row-id.js";
