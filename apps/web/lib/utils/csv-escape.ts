/**
 * CSV serialization and download-boundary formula escaping.
 *
 * Canonical ingest CSVs preserve source values. The ingest-files download
 * handler applies the streaming escape helpers when serving CSVs to users.
 *
 * @module
 * @category Utils
 */

import Papa from "papaparse";

// Characters a spreadsheet evaluates as a formula when they lead a cell.
const FORMULA_TRIGGERS = new Set(["=", "+", "-", "@"]);
// A spreadsheet may split the file on any of these depending on locale/config, so
// a trigger sitting right after one of them (or at a line/file start, or just
// inside a quote opened at such a start) could become a formula regardless of
// which delimiter the file "really" uses. Includes:
// - `,` `;` `\t` `|` — the common locale delimiters.
// - `\x1e` (RS) `\x1f` (US) — Papa auto-detects these too, so an importer could
//   read them as delimiters.
// - `\0` (NUL) — Excel/Calc strip embedded NULs on import, so a `<...>\0=formula`
//   cell logically starts with the trigger; treating NUL as a boundary escapes it.
// A leading BOM is handled by the callers (stripped, then re-prepended) so that a
// `<BOM>=formula` is scanned as a file-start trigger.
const FIELD_BOUNDARIES = new Set(["\n", "\r", ",", ";", "\t", "|", "\x1e", "\x1f", "\0"]);
// Excel/Calc strip a leading text qualifier on import, so a `<boundary>'=x'` or
// `<boundary>"=x"` cell content still starts with the trigger — both `"` and `'`
// are valid qualifiers.
const QUOTE_OPENERS = new Set(['"', "'"]);

/**
 * The UTF-8 byte-order mark as three latin1 (byte-per-char) characters. This
 * module scans files as a byte stream (latin1) so arbitrary source encodings are
 * preserved on download; the BOM therefore appears as its three raw bytes, not as
 * a single U+FEFF code point.
 */
export const UTF8_BOM = "\xef\xbb\xbf";

const isFieldBoundary = (char: string | undefined, extraDelimiter?: string): boolean =>
  char === undefined || FIELD_BOUNDARIES.has(char) || (extraDelimiter !== undefined && char === extraDelimiter);

/**
 * Detect an Excel `sep=<char>` directive on the first line. Excel honors it and
 * splits every row on that character, so it must be treated as a field boundary
 * too — otherwise `sep=:` + a `:=formula` cell would slip through. Expects the
 * BOM to have already been stripped by the caller. Returns the declared
 * separator, or undefined.
 */
export const detectSepDirective = (text: string): string | undefined => {
  // LibreOffice Calc accepts both `sep=:` and the quoted `"sep=:"` forms.
  const match = /^(?:sep=(.)|"sep=(.)")\r?\n/i.exec(text);
  return match?.[1] ?? match?.[2];
};

/**
 * Neutralize an Excel SYLK misdetection. Excel opens a `.csv` whose content
 * begins with the uppercase magic `ID` as a SYLK document, and SYLK carries
 * formulas the CSV scan never sees. Break the magic with a leading apostrophe
 * (Microsoft's documented workaround) so it parses as CSV instead. Expects the
 * BOM to have already been stripped by the caller.
 */
export const neutralizeSylkMagic = (text: string): string => (text.startsWith("ID") ? `'${text}` : text);

/**
 * Delimiter-agnostic CSV formula escape.
 *
 * Rather than guessing the delimiter (unsound — `,` vs `;` are ambiguous, and a
 * spreadsheet's choice depends on the viewer's locale), this inserts a `'` before
 * any `=`/`+`/`-`/`@` that sits at a field boundary under ANY common delimiter
 * (comma, semicolon, tab, pipe, RS, US, a `sep=`-declared one), at a line/file
 * start, or just inside a text qualifier (`"` or `'`) opened at such a start. The
 * cell can then never be evaluated no matter how the spreadsheet splits the row.
 * It only ever INSERTS apostrophes, so the file structure (delimiters, quotes,
 * line breaks, a leading BOM) is preserved exactly; the only cost is occasionally
 * over-escaping a `<boundary><trigger>` sequence inside a quoted value, which is
 * intentional, as is escaping negative numeric strings such as `-5`.
 *
 * Streaming: pass the previous call's returned `carry` (its last two raw chars)
 * back in as `carry` so boundary detection is correct across chunks, and pass the
 * file's `sep=` separator (if any) as `extraDelimiter` for every chunk.
 */
export const escapeCsvFormulaBoundaries = (
  text: string,
  carry = "",
  extraDelimiter?: string
): { output: string; carry: string } => {
  const combined = carry + text;
  let output = "";
  for (let i = carry.length; i < combined.length; i++) {
    const char = combined[i]!;
    if (FORMULA_TRIGGERS.has(char)) {
      const prev1 = i > 0 ? combined[i - 1] : undefined;
      const prev2 = i > 1 ? combined[i - 2] : undefined;
      const afterBoundary = isFieldBoundary(prev1, extraDelimiter);
      const afterQuoteAtBoundary =
        prev1 !== undefined && QUOTE_OPENERS.has(prev1) && isFieldBoundary(prev2, extraDelimiter);
      // A trigger that IS the declared `sep=` separator is a structural field
      // separator, not a cell start (escaping it would corrupt empty fields and
      // the directive itself). It's only dangerous when it leads a quoted cell.
      if (afterQuoteAtBoundary || (afterBoundary && char !== extraDelimiter)) {
        output += "'";
      }
    }
    output += char;
  }
  return { output, carry: combined.slice(-2) };
};

/**
 * Serialize rows to a CSV string with EVERY field as a column.
 *
 * `Papa.unparse(rows)` without an explicit `columns` derives the header from the
 * keys of the FIRST row only, silently dropping fields that appear solely in
 * later rows. Heterogeneous records — optional JSON-API fields, GeoJSON feature
 * properties, or a first feature missing geometry (which would drop lat/lng for
 * every row) — therefore lose columns and data. Compute the union of keys across
 * all rows, preserving first-seen order, so nothing is dropped. This serializer
 * does not escape formulas; apply escaping at the user-facing download boundary.
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
