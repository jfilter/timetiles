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

const ISO_DATE_PREFIX_REGEX = /^(\d{4})-(\d{2})-(\d{2})(?:$|[T\s])/;

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

const isValidCalendarDate = (year: number, month: number, day: number): boolean => {
  if (month < 1 || month > 12) {
    return false;
  }

  const maxDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return day >= 1 && day <= maxDay;
};

export const hasInvalidIsoDatePart = (date: string): boolean => {
  const match = ISO_DATE_PREFIX_REGEX.exec(date);
  if (!match?.[1] || !match[2] || !match[3]) {
    return false;
  }

  const year = Number.parseInt(match[1], 10);
  const month = Number.parseInt(match[2], 10);
  const day = Number.parseInt(match[3], 10);

  return !isValidCalendarDate(year, month, day);
};

export const parseDateInput = (date: string | number | Date | null | undefined): Date | null => {
  if (date == null) {
    return null;
  }

  if (typeof date === "number") {
    const dateObj = new Date(date);
    return isValidDate(dateObj) ? dateObj : null;
  }

  if (typeof date !== "string") {
    return isValidDate(date) ? date : null;
  }

  const trimmedDate = date.trim();
  if (trimmedDate === "") {
    return null;
  }

  if (hasInvalidIsoDatePart(trimmedDate)) {
    return null;
  }

  const dateObj = new Date(trimmedDate);
  if (!isValidDate(dateObj)) {
    return null;
  }

  return dateObj;
};

/**
 * Format a date string or Date object for display.
 *
 * By default includes time. Pass `{ includeTime: false }` for date-only format.
 */
export const formatDate = (date: string | Date | null | undefined, options?: { includeTime?: boolean }): string => {
  if (!date) return "N/A";

  try {
    const dateObj = parseDateInput(date);

    if (!dateObj) {
      return "Invalid date";
    }

    const formatOptions: Intl.DateTimeFormatOptions = {
      year: "numeric",
      month: "short",
      day: "numeric",
    };

    if (options?.includeTime !== false) {
      formatOptions.hour = "numeric";
      formatOptions.minute = "2-digit";
      formatOptions.hour12 = true;
    }

    return new Intl.DateTimeFormat("en-US", formatOptions).format(dateObj);
  } catch {
    return "Invalid date";
  }
};

/**
 * Format a date for short display (just the date, no time).
 */
export const formatDateShort = (date: string | Date | null | undefined): string =>
  formatDate(date, { includeTime: false });
