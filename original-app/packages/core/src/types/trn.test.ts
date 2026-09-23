import { describe, expect, it } from "vitest";
import { formatTrn, formatTrnInput } from "./trn.js";

describe("formatTrn", () => {
  it("groups nine stored digits the way a TRN is read", () => {
    expect(formatTrn("102458963")).toBe("102-458-963");
  });

  it("regroups a value that already carries punctuation", () => {
    expect(formatTrn("102 458 963")).toBe("102-458-963");
    expect(formatTrn("102-458-963")).toBe("102-458-963");
  });

  it("keeps a leading zero, which is the whole reason TRNs are stored as text", () => {
    expect(formatTrn("012345678")).toBe("012-345-678");
  });

  it("leaves anything that is not nine digits ALONE", () => {
    // Displaying a wrong tax number tidily is worse than displaying it
    // plainly — a forced shape hides that the value is wrong.
    expect(formatTrn("12345")).toBe("12345");
    expect(formatTrn("1234567890")).toBe("1234567890");
    expect(formatTrn("not a trn")).toBe("not a trn");
  });

  it("is empty for a missing value, not the word null", () => {
    expect(formatTrn(null)).toBe("");
    expect(formatTrn(undefined)).toBe("");
    expect(formatTrn("   ")).toBe("");
  });
});

describe("formatTrnInput", () => {
  it("adds each dash as the field fills, not all at once at the end", () => {
    expect(formatTrnInput("1")).toBe("1");
    expect(formatTrnInput("102")).toBe("102");
    expect(formatTrnInput("1024")).toBe("102-4");
    expect(formatTrnInput("102458")).toBe("102-458");
    expect(formatTrnInput("1024589")).toBe("102-458-9");
    expect(formatTrnInput("102458963")).toBe("102-458-963");
  });

  it("does not fight someone who types the dashes themselves", () => {
    expect(formatTrnInput("102-458-963")).toBe("102-458-963");
    expect(formatTrnInput("102-458")).toBe("102-458");
  });

  it("survives a paste with a label and spaces around it", () => {
    expect(formatTrnInput("TRN: 102 458 963")).toBe("102-458-963");
  });

  it("stops at nine digits, because a tenth is always a typo", () => {
    expect(formatTrnInput("1024589631234")).toBe("102-458-963");
  });

  it("clears to empty rather than leaving a stray dash", () => {
    // Deleting back to nothing must leave nothing — a lone "-" in the box
    // would be impossible to clear.
    expect(formatTrnInput("")).toBe("");
    expect(formatTrnInput("---")).toBe("");
  });
});
