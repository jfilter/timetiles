/**
 * General-purpose formatting utilities.
 *
 * @module
 * @category Utils
 */

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
 * Format a byte count as a human-readable file size string.
 */
export const formatFileSize = (bytes: number | null | undefined): string => {
  if (bytes == null) return "Unknown size";

  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
};
