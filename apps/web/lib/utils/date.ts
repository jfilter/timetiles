/**
 * Provides utility functions for formatting and validating dates.
 *
 * This module contains helpers to convert date strings or Date objects into consistent,
 * human-readable formats for display in the user interface. It handles null or invalid
 * date inputs gracefully and provides options for both long (date and time) and short
 * (date only) formats.
 *
 * @module
 */

/**
 * Check if a Date object is valid.
 *
 * @param date - Date object to validate
 * @returns True if the date is valid, false if invalid (NaN time)
 *
 * @example
 * ```typescript
 * const date = new Date('invalid');
 * isValidDate(date); // Returns false
 *
 * const validDate = new Date('2024-01-15');
 * isValidDate(validDate); // Returns true
 * ```
 */
export const isValidDate = (date: Date): boolean => {
  return !Number.isNaN(date.getTime());
};

/**
 * Format a date string or Date object for display.
 */
export const formatDate = (date: string | Date | null | undefined): string => {
  if (!date) return "N/A";

  try {
    const dateObj = typeof date === "string" ? new Date(date) : date;

    // Check if date is valid
    if (!isValidDate(dateObj)) {
      return "Invalid date";
    }

    // Format as: "Jan 15, 2024 at 3:30 PM"
    return new Intl.DateTimeFormat("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }).format(dateObj);
  } catch {
    return "Invalid date";
  }
};

/**
 * Format a date for short display (just the date, no time).
 */
export const formatDateShort = (date: string | Date | null | undefined): string => {
  if (!date) return "N/A";

  try {
    const dateObj = typeof date === "string" ? new Date(date) : date;

    // Check if date is valid
    if (!isValidDate(dateObj)) {
      return "Invalid date";
    }

    // Format as: "Jan 15, 2024"
    return new Intl.DateTimeFormat("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    }).format(dateObj);
  } catch {
    return "Invalid date";
  }
};
