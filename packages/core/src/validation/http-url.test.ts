import { describe, expect, it } from "vitest";
import { isHttpUrl, isIsoDate, safeHref } from "./http-url.js";

/**
 * The check that keeps a `javascript:` URL out of an `href`.
 *
 * `sourceUrl` on the rule pack and the regulatory feed was `z.string().url()`, which
 * accepts `javascript:`, `mailto:` and `ftp:` — and two screens render it as a link,
 * one of them the contractor dashboard. A correct check existed as a private function
 * in one web module, whose own comment named those three schemes, and it was wired to
 * that module's form and to neither of the other two places.
 */

describe("isHttpUrl", () => {
  it("accepts the two schemes a link may use", () => {
    expect(isHttpUrl("https://www.jamaicatax.gov.jm/gct")).toBe(true);
    expect(isHttpUrl("http://taj.gov.jm")).toBe(true);
  });

  it("refuses the schemes z.string().url() lets through", () => {
    // Each of these passes `z.string().url()`. The first is the one that executes.
    for (const hostile of [
      "javascript:alert(1)",
      "JavaScript:alert(1)",
      "  javascript:alert(1)  ",
      "mailto:someone@example.com",
      "ftp://files.example.com/x",
      "data:text/html;base64,PHNjcmlwdD4=",
      "vbscript:msgbox(1)",
      "file:///etc/passwd",
    ]) {
      expect(isHttpUrl(hostile), hostile).toBe(false);
    }
  });

  it("refuses things that are not URLs at all", () => {
    for (const value of ["", "   ", "example.com", "not a url", "//example.com"]) {
      expect(isHttpUrl(value), JSON.stringify(value)).toBe(false);
    }
  });
});

describe("safeHref", () => {
  it("hands back a safe address unchanged", () => {
    expect(safeHref("https://taj.gov.jm/gct")).toBe("https://taj.gov.jm/gct");
  });

  it("returns null for anything a render site must not link", () => {
    // A row written before the DTO was tightened is still in the database, so the
    // render guard is not redundant with the input rule — it is the half that covers
    // the data already there.
    expect(safeHref("javascript:alert(1)")).toBeNull();
    expect(safeHref(null)).toBeNull();
    expect(safeHref(undefined)).toBeNull();
    expect(safeHref("")).toBeNull();
  });
});

describe("isIsoDate", () => {
  it("accepts a real calendar date", () => {
    expect(isIsoDate("2026-02-28")).toBe(true);
    expect(isIsoDate("2024-02-29")).toBe(true); // leap year
  });

  it("refuses a date that matches the shape but not the calendar", () => {
    // The exact gap: the DTO uses z.string().date() (calendar-checked), while the
    // web client used to check with /^\d{4}-\d{2}-\d{2}$/, which "2026-02-31"
    // passes despite February never having 31 days.
    expect(isIsoDate("2026-02-31")).toBe(false);
    expect(isIsoDate("2023-02-29")).toBe(false); // not a leap year
    expect(isIsoDate("2026-13-01")).toBe(false);
    expect(isIsoDate("2026-00-10")).toBe(false);
  });

  it("refuses anything not shaped like YYYY-MM-DD", () => {
    for (const value of ["", "2026-2-3", "2026/02/03", "not a date", "2026-02-03T00:00:00Z"]) {
      expect(isIsoDate(value), value).toBe(false);
    }
  });
});
