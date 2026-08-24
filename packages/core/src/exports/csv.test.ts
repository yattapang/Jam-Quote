import { describe, expect, it } from "vitest";
import { csvCell, csvDate, csvMoney, csvText, toCsv } from "./csv.js";

describe("csvCell", () => {
  it("leaves an ordinary value alone", () => {
    expect(csvCell("Carib Cement")).toBe("Carib Cement");
  });

  it("quotes a value containing a comma", () => {
    expect(csvCell("Cement, 42.5kg")).toBe('"Cement, 42.5kg"');
  });

  it("doubles embedded quotes", () => {
    expect(csvCell('6" block')).toBe('"6"" block"');
  });

  it("quotes a value containing a newline, so it cannot break the row", () => {
    expect(csvCell("line one\nline two")).toBe('"line one\nline two"');
  });

  it("defuses a value Excel would run as a formula", () => {
    // CSV injection, not just a display bug: these values come from tenant
    // input and land on an accountant's machine.
    expect(csvCell("=1+1")).toBe("'=1+1");
    expect(csvCell("@SUM(A1)")).toBe("'@SUM(A1)");
    expect(csvCell("-Ital Builders")).toBe("'-Ital Builders");
  });

  it("writes null and undefined as empty, never as the word", () => {
    expect(csvCell(null)).toBe("");
    expect(csvCell(undefined)).toBe("");
  });
});

describe("csvMoney", () => {
  it("turns cents into a summable decimal string", () => {
    expect(csvMoney(125_000)).toBe("1250.00");
  });

  it("keeps the minor units when they are not round", () => {
    expect(csvMoney(1_150)).toBe("11.50");
    expect(csvMoney(5)).toBe("0.05");
    expect(csvMoney(0)).toBe("0.00");
  });

  it("does not go through floating-point division", () => {
    // 1150 / 100 is 11.499999999999998 in IEEE754. An accountant's file must
    // never contain that.
    expect(csvMoney(1_150)).not.toContain("9999");
  });

  it("handles a negative, for a credit or refund", () => {
    expect(csvMoney(-2_550)).toBe("-25.50");
  });

  it("carries no symbol, so the column stays numeric in Excel", () => {
    expect(csvMoney(125_000)).not.toContain("$");
    expect(csvMoney(125_000)).not.toContain(",");
  });
});

describe("csvDate", () => {
  it("writes ISO-8601, unambiguous between readings of 03/04", () => {
    expect(csvDate(new Date("2026-04-03T00:00:00.000Z"))).toBe("2026-04-03");
  });

  it("writes a missing date as blank", () => {
    expect(csvDate(null)).toBe("");
    expect(csvDate(undefined)).toBe("");
  });

  it("does not emit Invalid Date", () => {
    expect(csvDate("not a date")).toBe("");
  });
});

describe("csvText", () => {
  it("stops Excel eating the leading zero on a TRN", () => {
    expect(csvText("001234567")).toBe('="001234567"');
  });

  it("is blank for a missing value rather than an empty formula", () => {
    expect(csvText(null)).toBe("");
    expect(csvText("   ")).toBe("");
  });
});

describe("toCsv", () => {
  const file = toCsv(["Number", "Total"], [["INV-0001", csvMoney(125_000)]]);

  it("starts with a BOM so Excel reads it as UTF-8", () => {
    expect(file.charCodeAt(0)).toBe(0xfeff);
  });

  it("uses CRLF line endings", () => {
    expect(file).toContain("\r\n");
    expect(file.endsWith("\r\n")).toBe(true);
  });

  it("puts the headers first, then the rows", () => {
    const [header, first] = file.slice(1).split("\r\n");
    expect(header).toBe("Number,Total");
    expect(first).toBe("INV-0001,1250.00");
  });

  it("still writes a usable file when there is nothing to report", () => {
    // An empty period is a real answer. A file with only headers says "no
    // invoices in March"; a zero-byte file looks like the export broke.
    const empty = toCsv(["Number"], []);
    expect(empty.slice(1)).toBe("Number\r\n");
  });
});
