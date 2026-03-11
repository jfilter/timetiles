/**
 * Date formatting utilities for timestamp display.
 *
 * Provides functions to format timestamps as short dates, ISO date strings,
 * and to parse ISO date strings back to timestamps. Used primarily by the
 * time range slider and other temporal UI components.
 *
 * @module
 * @category Utils
 */

/**
 * Format a timestamp to a short date string (e.g., "Jan 2024")
 */
export const formatShortDate = (timestamp: number): string => {
  const date = new Date(timestamp);
  return date.toLocaleDateString("en-US", { month: "short", year: "numeric" });
};

/**
 * Format a timestamp to ISO date string (YYYY-MM-DD)
 */
export const formatISODate = (timestamp: number): string => {
  const date = new Date(timestamp);
  const parts = date.toISOString().split("T");
  return parts[0] ?? "";
};

/**
 * Parse an ISO date string to timestamp
 */
export const parseISODate = (dateStr: string): number => {
  return new Date(dateStr).getTime();
};
