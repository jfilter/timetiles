/**
 * CSV / spreadsheet formula-injection escaping utilities.
 *
 * Papa Parse's default `unparse()` (and most CSV/XLSX writers) does NOT escape
 * cells whose first character could cause a spreadsheet application to
 * interpret the cell as a formula. If a recipient opens the file in Excel /
 * LibreOffice Calc / Google Sheets, those cells execute as formulas and can
 * exfiltrate data, hit URLs, or run local commands — the classic
 * "CSV injection" / "formula injection" class (CWE-1236).
 *
 * The defensive fix is to prefix such cells with a single apostrophe (`'`).
 * Spreadsheet applications strip the apostrophe on display but refuse to
 * evaluate the cell as a formula.
 *
 * Dangerous leading characters per OWASP guidance:
 *   `=`, `+`, `-`, `@`, TAB (`\t`), CR (`\r`).
 *
 * Apply this BEFORE handing rows to `Papa.unparse()` or any other CSV/XLSX
 * writer that does not offer its own `escapeFormula` option.
 *
 * @module
 * @category Utils
 */

const FORMULA_PREFIXES = /^[=+\-@\t\r]/;

/**
 * Prefix a single quote to a cell value if it would otherwise be interpreted
 * as a formula by a spreadsheet application. Non-string values pass through
 * unchanged (numbers, booleans, null, undefined, objects).
 *
 * Note: legitimate string values that happen to start with `-` (e.g. `-42`,
 * or a negative reading like `-0.5`) are also escaped. This is the correct
 * defensive behavior: the escape is cosmetic (spreadsheets strip the
 * apostrophe on display) and we cannot distinguish "user-provided negative
 * number as a string" from "formula payload" at this layer. Callers that
 * know they have a numeric field should pass a `number`, not a `string`.
 */
export const escapeCsvFormula = (value: unknown): unknown => {
  if (typeof value !== "string") return value;
  return FORMULA_PREFIXES.test(value) ? `'${value}` : value;
};

/**
 * Apply {@link escapeCsvFormula} to every string cell in a flat row.
 *
 * Only scalar string values on the row are rewritten — nested objects and
 * arrays are left alone because the CSV writer will serialize them via
 * `JSON.stringify`, which produces leading `{` / `[` (not dangerous).
 */
export const escapeRowFormulas = (row: Record<string, unknown>): Record<string, unknown> => {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(row)) {
    out[key] = escapeCsvFormula(row[key]);
  }
  return out;
};

/**
 * Apply {@link escapeRowFormulas} across an array of rows. Convenience helper
 * for the common `rows.map(escapeRowFormulas)` pattern at call sites.
 */
export const escapeRowsFormulas = (rows: readonly Record<string, unknown>[]): Record<string, unknown>[] =>
  rows.map((row) => escapeRowFormulas(row));
