/**
 * General-purpose formatting utilities.
 *
 * @module
 * @category Utils
 */

/**
 * Convert a raw field key (camelCase, snake_case, etc.) to a human-readable Title Case label.
 *
 * Examples: "stadtbezirk" → "Stadtbezirk", "locationName" → "Location Name",
 * "start_date" → "Start Date", "oepnv" → "Oepnv"
 */
export const formatFieldLabel = (key: string): string =>
  key
    // Insert space before uppercase letters (camelCase → camel Case)
    .replaceAll(/([a-z])([A-Z])/g, "$1 $2")
    // Replace underscores/hyphens with spaces
    .replaceAll(/[_-]+/g, " ")
    // Title case each word
    .replaceAll(/\b\w/g, (c) => c.toUpperCase())
    .trim();

/**
 * Convert an unknown value to a string safely.
 *
 * Handles null/undefined, primitives, Dates, and objects.
 * Returns empty string for unsupported types (symbol, bigint, function).
 */
export const valueToString = (value: unknown): string => {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") return JSON.stringify(value);
  return "";
};

/**
 * Format a number in compact notation (e.g. 1.2k, 15k, 1.2M).
 * Numbers below 1000 are returned as-is. Uses locale-aware decimal separator.
 *
 * - Under 10k: one decimal place (1.2k / 1,2k)
 * - 10k+: rounded (15k, 234k)
 * - Under 10M: one decimal place (1.2M / 1,2M)
 * - 10M+: rounded (15M, 234M)
 */
export const formatCompactNumber = (n: number, locale?: string): string => {
  if (n < 1000) return String(n);

  const formatDecimal = (value: number): string =>
    value.toLocaleString(locale, { minimumFractionDigits: 0, maximumFractionDigits: 1 });

  // Thresholds are compared against the ROUNDED value, not the raw one. Comparing the raw
  // value let a number round up across its own unit boundary and print in the unit it had
  // just left — 999_999 rendered as "1000k" instead of "1.0M".
  if (Math.round(n / 1000) < 1000) {
    return n < 10_000 ? `${formatDecimal(n / 1000)}k` : `${Math.round(n / 1000)}k`;
  }
  return n < 10_000_000 ? `${formatDecimal(n / 1_000_000)}M` : `${Math.round(n / 1_000_000)}M`;
};

/**
 * Format a byte count as a human-readable file size string.
 */
export const formatFileSize = (bytes: number | null | undefined): string => {
  if (bytes == null) return "Unknown size";

  // Each threshold is checked against the value as it will be PRINTED, so a size that
  // rounds up to a full unit steps up instead of printing "1024.0 KB".
  const KB = 1024;
  const MB = KB * 1024;
  const GB = MB * 1024;

  if (bytes < KB) return `${bytes} B`;
  if (Number((bytes / KB).toFixed(1)) < 1024) return `${(bytes / KB).toFixed(1)} KB`;
  if (Number((bytes / MB).toFixed(2)) < 1024) return `${(bytes / MB).toFixed(2)} MB`;
  return `${(bytes / GB).toFixed(2)} GB`;
};
