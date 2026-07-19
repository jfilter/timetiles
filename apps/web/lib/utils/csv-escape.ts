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

// Characters a spreadsheet evaluates as a formula when they lead a cell.
const FORMULA_TRIGGERS = new Set(["=", "+", "-", "@"]);
// A spreadsheet may split the file on any of these depending on locale/config, so
// a trigger sitting right after one of them (or at a line/file start, or just
// inside a quote opened at such a start) could become a formula regardless of
// which delimiter the file "really" uses. Includes:
// - `,` `;` `\t` `|` — the common locale delimiters.
// - `\x1e` (RS) `\x1f` (US) — Papa auto-detects these too, so an importer could
//   read them as delimiters.
// - U+FEFF (BOM) — a spreadsheet strips a leading BOM, making whatever follows
//   the logical first cell, so a `<BOM>=formula` must still be escaped.
const FIELD_BOUNDARIES = new Set(["\n", "\r", ",", ";", "\t", "|", "\x1e", "\x1f", "﻿"]);

const isFieldBoundary = (char: string | undefined): boolean => char === undefined || FIELD_BOUNDARIES.has(char);

/**
 * Delimiter-agnostic CSV formula escape.
 *
 * Rather than guessing the delimiter (unsound — `,` vs `;` are ambiguous, and a
 * spreadsheet's choice depends on the viewer's locale), this inserts a `'` before
 * any `=`/`+`/`-`/`@` that sits at a field boundary under ANY common delimiter
 * (comma, semicolon, tab, pipe), at a line/file start, or just inside a quote
 * opened at such a start. The cell can then never be evaluated no matter how the
 * spreadsheet splits the row. It only ever INSERTS apostrophes, so the file
 * structure (delimiters, quotes, line breaks, a leading BOM) is preserved exactly;
 * the only cost is occasionally over-escaping a `<boundary><trigger>` sequence
 * inside a quoted value, which is cosmetic and safe (matches {@link escapeCsvFormula},
 * which likewise escapes e.g. a leading `-5`).
 *
 * Streaming: pass the previous call's returned `carry` (its last two raw chars)
 * back in as the second argument so boundary detection is correct across chunks.
 */
export const escapeCsvFormulaBoundaries = (text: string, carry = ""): { output: string; carry: string } => {
  const combined = carry + text;
  let output = "";
  for (let i = carry.length; i < combined.length; i++) {
    const char = combined[i]!;
    if (FORMULA_TRIGGERS.has(char)) {
      const prev1 = i > 0 ? combined[i - 1] : undefined;
      const prev2 = i > 1 ? combined[i - 2] : undefined;
      if (isFieldBoundary(prev1) || (prev1 === '"' && isFieldBoundary(prev2))) {
        output += "'";
      }
    }
    output += char;
  }
  return { output, carry: combined.slice(-2) };
};

/**
 * Formula-escape a whole CSV string at the DOWNLOAD boundary (CWE-1236).
 *
 * Canonical ingest CSVs are stored raw (the pipeline re-parses them and a leading
 * apostrophe would corrupt real values), so this runs only when a human downloads
 * the file into a spreadsheet application. Delimiter-agnostic (see
 * {@link escapeCsvFormulaBoundaries}); an empty input yields "".
 */
export const escapeCsvFormulasInText = (csvText: string): string => escapeCsvFormulaBoundaries(csvText).output;

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
