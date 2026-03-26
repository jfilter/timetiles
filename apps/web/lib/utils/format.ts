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
 * Try to interpret a value as a string array — either a native array or a JSON-stringified one.
 *
 * Returns `null` if the value is not an array. Used by event detail rendering
 * to display multi-value fields (tags, categories) as chips.
 */
export const tryParseStringArray = (value: unknown): string[] | null => {
  // Native array (from parse-json-array transform)
  if (Array.isArray(value)) {
    const strings = value.filter((v): v is string | number => v != null && v !== "").map(String);
    return strings.length > 0 ? strings : null;
  }
  // JSON-stringified array (from CSV serialization)
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed.startsWith("[")) return null;
    try {
      const parsed: unknown = JSON.parse(trimmed);
      if (!Array.isArray(parsed)) return null;
      const strings = parsed.filter((v): v is string | number => v != null && v !== "").map(String);
      return strings.length > 0 ? strings : null;
    } catch {
      return null;
    }
  }
  return null;
};

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

  if (n < 10_000) return `${formatDecimal(n / 1000)}k`;
  if (n < 1_000_000) return `${Math.round(n / 1000)}k`;
  if (n < 10_000_000) return `${formatDecimal(n / 1_000_000)}M`;
  return `${Math.round(n / 1_000_000)}M`;
};

/**
 * Format a byte count as a human-readable file size string.
 */
export const formatFileSize = (bytes: number | null | undefined): string => {
  if (bytes == null) return "Unknown size";

  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
};
