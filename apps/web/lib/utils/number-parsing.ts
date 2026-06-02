/**
 * Locale-aware numeric-string parsing for the ingest pipeline.
 *
 * The decimal / thousands separator is a per-COLUMN property, never a per-row
 * one — `"1,5"` cannot mean 1.5 in one row and 1500 in another within the same
 * column. So the convention is decided ONCE from a column's (or merge group's)
 * values via {@link decideNumberFormat}, then applied uniformly with
 * {@link parseLocaleNumber}. This mirrors how date order and coordinate axis
 * order are per-column decisions (ADR 0040), and deliberately avoids the
 * row-local separator guessing that would reintroduce silent cross-row
 * corruption.
 *
 * @module
 * @category Utils
 */

/** A resolved per-column number convention. */
export interface NumberFormat {
  /** The character that separates the integer and fractional parts. */
  decimalSeparator: "." | ",";
  /** The digit-grouping character, or null when the column uses none. */
  thousandsSeparator: "." | "," | null;
}

/**
 * The format style a single value exhibits:
 * - `plain` — digits only, no separators (`"42"`).
 * - `us` — unambiguously dot-decimal (`"1.5"`, `"1,234.56"`).
 * - `eu` — unambiguously comma-decimal (`"1,5"`, `"1.234,56"`).
 * - `ambiguous` — one separator followed by exactly three digits (`"1.234"` /
 *   `"1,234"`): could be a decimal or a thousands group; only the column as a
 *   whole can settle it.
 * - `null` — not a numeric string at all.
 */
export type NumericStyle = "plain" | "us" | "eu" | "ambiguous" | null;

const US_FORMAT: NumberFormat = { decimalSeparator: ".", thousandsSeparator: "," };
const EU_FORMAT: NumberFormat = { decimalSeparator: ",", thousandsSeparator: "." };

/** Both "." and "," present: the LAST-occurring separator is the decimal (US "1,234.56" / EU "1.234,56"). */
const classifyMixedSeparators = (unsigned: string): NumericStyle => {
  const decimalIsComma = unsigned.lastIndexOf(",") > unsigned.lastIndexOf(".");
  const fmt = decimalIsComma ? EU_FORMAT : US_FORMAT;
  if (!isWellFormed(unsigned, fmt)) return null;
  return decimalIsComma ? "eu" : "us";
};

/** Exactly one KIND of separator (`sep`), possibly repeated. */
const classifySingleSeparator = (unsigned: string, sep: "." | ","): NumericStyle => {
  // Repeated same separator → pure thousands grouping of an integer
  // ("1.234.567" is EU, "1,234,567" is US).
  if (unsigned.indexOf(sep) !== unsigned.lastIndexOf(sep)) {
    const fmt = sep === "." ? EU_FORMAT : US_FORMAT;
    if (!isWellFormed(unsigned, fmt)) return null;
    return sep === "." ? "eu" : "us";
  }

  const [intPart, fracPart] = unsigned.split(sep);
  if (!intPart || !fracPart || !/^\d+$/.test(intPart) || !/^\d+$/.test(fracPart)) return null;

  // One separator + exactly three trailing digits is genuinely undecidable in
  // isolation (decimal vs a thousands group); only the column can settle it.
  if (fracPart.length === 3) return "ambiguous";

  // Otherwise the separator must be a decimal (a thousands group is always
  // exactly three digits), so the style follows the separator kind.
  return sep === "." ? "us" : "eu";
};

/** Classify the locale style a single numeric string exhibits (per-value, never decisive on its own). */
export const classifyNumericFormat = (raw: string): NumericStyle => {
  const trimmed = raw.trim();
  const unsigned = trimmed.startsWith("-") ? trimmed.slice(1) : trimmed;
  if (unsigned === "" || !/^[\d.,]+$/.test(unsigned)) return null;

  const hasDot = unsigned.includes(".");
  const hasComma = unsigned.includes(",");
  if (!hasDot && !hasComma) return "plain";
  if (hasDot && hasComma) return classifyMixedSeparators(unsigned);
  return classifySingleSeparator(unsigned, hasDot ? "." : ",");
};

/** True when `unsigned` (no leading sign) is a well-formed number under `fmt` (3-digit thousands groups). */
const isWellFormed = (unsigned: string, fmt: NumberFormat): boolean => {
  const [intPart, ...rest] = fmt.decimalSeparator === "," ? unsigned.split(",") : unsigned.split(".");
  if (rest.length > 1) return false; // more than one decimal separator
  const fracPart = rest[0];
  if (fracPart !== undefined && !/^\d+$/.test(fracPart)) return false;
  if (intPart === undefined) return false;

  if (fmt.thousandsSeparator && intPart.includes(fmt.thousandsSeparator)) {
    const groups = intPart.split(fmt.thousandsSeparator);
    // First group 1–3 digits, every subsequent group exactly 3 digits.
    if (!/^\d{1,3}$/.test(groups[0] ?? "")) return false;
    return groups.slice(1).every((g) => /^\d{3}$/.test(g));
  }
  return /^\d+$/.test(intPart);
};

/**
 * Decide a column's number convention from a sample of its values.
 *
 * Decides from the NUMERIC values only — non-numeric values (e.g. dates, text)
 * are ignored here and are caught downstream (a value that does not parse under
 * the chosen format falls through to date parsing / the invalid-value skip). So
 * a field mixing `"2"` with dates still yields a format, letting `"2"` parse as a
 * number (and the date as a date → a "mixed types" skip), matching prior
 * behavior. Returns `null` only when there are no numeric values at all, or the
 * numeric values contradict (both unambiguous US and EU present — never guess).
 * Ambiguous-only / plain-only columns default to US (`"."` decimal).
 */
export const decideNumberFormat = (values: readonly string[]): NumberFormat | null => {
  let us = 0;
  let eu = 0;
  let numeric = 0;

  for (const value of values) {
    const style = classifyNumericFormat(value);
    if (style === null) continue; // non-numeric — ignored; the numeric values decide
    numeric++;
    if (style === "us") us++;
    else if (style === "eu") eu++;
  }

  if (numeric === 0) return null;
  if (us > 0 && eu > 0) return null; // contradictory column — do not guess
  return eu > 0 ? EU_FORMAT : US_FORMAT;
};

/**
 * Parse a numeric string under a resolved {@link NumberFormat}, or `null` if it
 * is not a clean number under that convention. Strips the thousands separator
 * and normalizes the decimal separator to `"."` before `Number()`, validating
 * the canonical form so malformed input never silently coerces.
 */
export const parseLocaleNumber = (raw: string, format: NumberFormat): number | null => {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  const negative = trimmed.startsWith("-");
  const unsigned = negative ? trimmed.slice(1) : trimmed;

  let normalized = unsigned;
  if (format.thousandsSeparator) {
    normalized = normalized.split(format.thousandsSeparator).join("");
  }
  if (format.decimalSeparator === ",") {
    normalized = normalized.replace(",", ".");
  }

  // Canonical US form only: integer with optional single fractional part.
  // eslint-disable-next-line security/detect-unsafe-regex -- Simple numeric pattern, false positive
  if (!/^\d+(\.\d+)?$/.test(normalized)) return null;

  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) return null;
  return negative ? -parsed : parsed;
};
