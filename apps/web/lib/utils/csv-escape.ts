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

import Papa from "papaparse";

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

/**
 * Formula-escape every cell of an already-serialized CSV string.
 *
 * Parses the CSV as a raw 2-D grid (no header inference, so structure and column
 * order survive exactly), applies {@link escapeCsvFormula} to each cell, and
 * re-serializes. This is the DOWNLOAD-boundary defense: canonical ingest CSVs
 * are stored raw (the pipeline re-parses them and a leading apostrophe would
 * corrupt real values), so escaping happens only when a human downloads the
 * file into a spreadsheet application (CWE-1236). An empty input yields "".
 */
export const escapeCsvFormulasInText = (csvText: string): string => {
  if (csvText === "") return "";
  const parsed = Papa.parse<string[]>(csvText, { skipEmptyLines: false });
  const escaped = parsed.data.map((row) => (Array.isArray(row) ? row.map((cell) => escapeCsvFormula(cell)) : row));
  return Papa.unparse(escaped);
};

/**
 * Serialize rows to a CSV string with EVERY field as a column.
 *
 * `Papa.unparse(rows)` without an explicit `columns` derives the header from the
 * keys of the FIRST row only, silently dropping fields that appear solely in
 * later rows. Heterogeneous records — optional JSON-API fields, GeoJSON feature
 * properties, or a first feature missing geometry (which would drop lat/lng for
 * every row) — therefore lose columns and data. Compute the union of keys across
 * all rows, preserving first-seen order, so nothing is dropped. Pass rows that
 * have already been formula-escaped (see {@link escapeRowsFormulas}).
 */
export const unparseRowsToCsv = (rows: readonly Record<string, unknown>[]): string => {
  const columns: string[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (!seen.has(key)) {
        seen.add(key);
        columns.push(key);
      }
    }
  }
  // Papa.unparse rejects an empty `columns` option ("Option columns is empty"),
  // so short-circuit the no-rows / no-keys case to an empty string.
  if (columns.length === 0) return "";
  return Papa.unparse(rows as Record<string, unknown>[], { columns });
};
