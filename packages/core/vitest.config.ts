import { defineConfig } from "vitest/config";

/**
 * The suite runs in Jamaica's timezone, deliberately.
 *
 * A review found that eight tests pinning `nextTermEnd`'s month arithmetic could not
 * fail on a UTC host — and CI is a UTC host. The bug they were written for only
 * appears west of UTC: local `getMonth`/`setMonth` on a UTC-midnight instant reads
 * the PREVIOUS day locally, so terms came out 28 to 31 days instead of a calendar
 * month. Under `TZ=UTC` the old, broken implementation returned the right answer for
 * every assertion. "Verified by reverting the fix" held only on the author's machine.
 *
 * America/Jamaica is where this product runs, so it is the honest default for the
 * suite: a date bug that only bites a Jamaican contractor should fail here first.
 * Anything that must hold in every zone should say so by constructing its own
 * offsets rather than relying on the host.
 */
process.env.TZ = "America/Jamaica";

export default defineConfig({
  test: {
    environment: "node",
  },
});
