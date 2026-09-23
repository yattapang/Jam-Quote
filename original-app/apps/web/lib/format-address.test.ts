import { describe, expect, it } from "vitest";
import { formatAddress } from "./format-address";

describe("formatAddress", () => {
  it("joins street, town and parish in the order an address is written", () => {
    expect(formatAddress(["12 Barbican Road", "Kingston 8", "St. Andrew"])).toBe(
      "12 Barbican Road, Kingston 8, St. Andrew",
    );
  });

  it("skips a missing town rather than emitting a double comma", () => {
    // Most records predate #30, so this is the common case, not the edge one —
    // naive interpolation printed "12 Barbican Road, , St. Andrew" on the
    // document the customer reads.
    expect(formatAddress(["12 Barbican Road", "", "St. Andrew"])).toBe("12 Barbican Road, St. Andrew");
    expect(formatAddress(["12 Barbican Road", undefined, "St. Andrew"])).toBe("12 Barbican Road, St. Andrew");
    expect(formatAddress(["12 Barbican Road", null, "St. Andrew"])).toBe("12 Barbican Road, St. Andrew");
  });

  it("leaves no trailing separator when the tail is empty", () => {
    expect(formatAddress(["12 Barbican Road", "", ""])).toBe("12 Barbican Road");
  });

  it("returns an empty string when nothing is set, so callers can skip the line", () => {
    expect(formatAddress([undefined, null, ""])).toBe("");
  });

  it("trims whitespace-only parts", () => {
    expect(formatAddress(["  12 Barbican Road  ", "   ", "St. Andrew"])).toBe("12 Barbican Road, St. Andrew");
  });
});
