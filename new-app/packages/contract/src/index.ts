/**
 * @pryvis/contract — what the API promises its clients.
 *
 * Web and mobile import from here. They never declare their own copy of a server
 * shape: the Phase 0 audit found exactly that pattern in the previous application,
 * with a guard that proved the copy was used and nothing that proved its fields
 * still matched.
 *
 * Everything under ./generated is produced by ../generate.ts from the API's @wire
 * types. Editing it by hand is undone by the next run and fails CI in between.
 */
export type * from "./generated/wire.js";
