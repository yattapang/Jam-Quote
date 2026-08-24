/**
 * CSV for an accountant opening the file in Excel.
 *
 * "CSV" in the abstract is not the target — a file a Jamaican accountant can
 * double-click is. That distinction drives every choice here, and each one is
 * a real failure someone has had to explain away:
 *
 * - **UTF-8 with a BOM.** Without it Excel reads the file as the system
 *   codepage and mangles accented names.
 * - **CRLF line endings**, which is what the CSV spec says and what older
 *   Excel builds need to see rows at all.
 * - **Money as a plain decimal string, with a separate currency column.**
 *   Never cents, never a pre-formatted "$1,250.00" — a symbol in the cell
 *   makes it text, and the accountant cannot sum the column.
 * - **Dates as ISO-8601**, unambiguous between the Jamaican and US readings of
 *   03/04/2026.
 */

/** Excel needs this to read the file as UTF-8. */
const BOM = "﻿";

/**
 * A cell whose exact characters must reach the file — see `csvText`.
 *
 * A marker rather than a bare string, so the ONE value allowed to skip
 * escaping has to be produced deliberately. A naming convention or a boolean
 * flag would be silently bypassable; this is not.
 */
export interface CsvRaw {
  readonly __csvRaw: string;
}

export type CsvValue = string | number | CsvRaw | null | undefined;

/**
 * One cell, quoted only when it has to be.
 *
 * A leading `=`, `+`, `-` or `@` makes Excel treat the value as a FORMULA, so
 * such a value is prefixed with a single quote. That is CSV injection as much
 * as it is a display bug: a crafted line description could otherwise execute
 * on the accountant's machine, and every value here comes from tenant input.
 */
export function csvCell(value: CsvValue): string {
  if (value === null || value === undefined) return "";
  // Pre-encoded by csvText: written through untouched. Escaping it here would
  // put the literal characters ="..." in the cell instead of the value they
  // protect — the helper defeated by the layer above it.
  if (typeof value === "object" && "__csvRaw" in value) return value.__csvRaw;
  let text = String(value);
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  if (/[",\r\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

/** A complete file: BOM, header row, then data. */
export function toCsv(
  headers: readonly string[],
  rows: readonly (readonly CsvValue[])[],
): string {
  const lines = [headers.map(csvCell).join(",")];
  for (const row of rows) lines.push(row.map(csvCell).join(","));
  return BOM + lines.join("\r\n") + "\r\n";
}

/**
 * Integer cents to the decimal string an accountant can sum: 125000 -> "1250.00".
 *
 * Goes through integer arithmetic, never `cents / 100`, because the whole
 * point of storing cents is to avoid the floating-point representation that
 * turns 1150 into 11.499999999999998.
 */
export function csvMoney(cents: number): string {
  const negative = cents < 0;
  const abs = Math.abs(Math.round(cents));
  const body = `${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
  return negative ? `-${body}` : body;
}

/** A calendar date as YYYY-MM-DD. Null dates are blank, not "null". */
export function csvDate(value: Date | string | null | undefined): string {
  if (!value) return "";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

/**
 * A value Excel must not turn into a number — a TRN with leading zeros, or one
 * long enough to be rendered as 1.23457E+11.
 *
 * The `="..."` form is the only thing Excel reliably honours. Other tools show
 * the literal text, which is ugly but never WRONG, and a mangled tax number on
 * an accountant's file is worse than an ugly one.
 */
export function csvText(value: string | null | undefined): CsvRaw | "" {
  if (!value?.trim()) return "";
  // Commas and quotes are STRIPPED rather than escaped: this form only works
  // unquoted, so no escaping is available inside it. Neither character belongs
  // in a tax number, a phone number or a bank reference, and losing a stray
  // one beats breaking the row it sits on.
  const safe = value.trim().replace(/[",\r\n]/g, "");
  return { __csvRaw: `="${safe}"` };
}

