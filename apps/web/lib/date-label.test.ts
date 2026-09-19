import { afterEach, describe, expect, it } from "vitest";
import { dateLabel } from "./api-client";

/**
 * Item 8 (fd7d9c8 review): dateLabel formatted with no fixed time zone, so
 * the SAME stored instant rendered a different calendar day depending on
 * where the process (or the visitor's browser) happened to be — a date
 * stored near midnight UTC could show as the day before on a host west of
 * UTC. dateLabel now delegates to core's formatJamaicaDateLabel, which pins
 * the zone to America/Jamaica (UTC-5, no DST) so the label is the same no
 * matter what host TZ the code runs under.
 */
describe("dateLabel", () => {
  const originalTz = process.env.TZ;
  afterEach(() => {
    process.env.TZ = originalTz;
  });

  it("renders a fixed Jamaica-local calendar day for a 00:00Z instant", () => {
    // 2026-03-15T00:00:00Z is 2026-03-14 19:00 in America/Jamaica (UTC-5).
    expect(dateLabel("2026-03-15T00:00:00.000Z")).toBe("14 Mar");
  });

  it("renders a fixed Jamaica-local calendar day for a 23:59Z instant", () => {
    // 2026-03-15T23:59:00Z is 2026-03-15 18:59 in America/Jamaica (UTC-5).
    expect(dateLabel("2026-03-15T23:59:00.000Z")).toBe("15 Mar");
  });

  it("does not shift with the host process's own time zone", () => {
    const iso = "2026-03-15T04:30:00.000Z";
    process.env.TZ = "UTC";
    const underUtc = dateLabel(iso);
    process.env.TZ = "Pacific/Kiritimati"; // UTC+14 — as far from Jamaica as a host can be
    const underKiritimati = dateLabel(iso);
    expect(underUtc).toBe(underKiritimati);
    expect(underUtc).toBe("14 Mar"); // always America/Jamaica, regardless of process.env.TZ
  });

  it("applies the given prefix", () => {
    expect(dateLabel("2026-03-15T23:59:00.000Z", "Valid until ")).toBe("Valid until 15 Mar");
  });

  it("returns empty string for an invalid date", () => {
    expect(dateLabel("not-a-date")).toBe("");
  });
});
