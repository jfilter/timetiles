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
type DateInput = string | Date | null | undefined;

export const formatDate = (date: DateInput, options?: { includeTime?: boolean }): string => {
  if (!date) return "N/A";

  try {
    const dateObj = parseDateInput(date);

    if (!dateObj) {
      return "Invalid date";
    }

    const formatOptions: Intl.DateTimeFormatOptions = { year: "numeric", month: "short", day: "numeric" };

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

/**
 * Format a date in long format with weekday, suitable for emails and notifications.
 *
 * @param date - Date to format
 * @param includeTime - Whether to include hour and minute (default: false)
 * @returns Formatted date string like "Saturday, March 15, 2026" or "Unknown" if invalid
 */
export const formatLongDate = (date: string | Date | null | undefined, includeTime = false): string => {
  const dateObj = parseDateInput(date);
  if (!dateObj) return "Unknown";

  const options: Intl.DateTimeFormatOptions = { weekday: "long", year: "numeric", month: "long", day: "numeric" };

  if (includeTime) {
    options.hour = "2-digit";
    options.minute = "2-digit";
  }

  return dateObj.toLocaleDateString("en-US", options);
};

/**
 * Format a timestamp to a short date string (e.g., "Jan 2024").
 */
export const formatShortDate = (timestamp: string | number): string => {
  const date = new Date(timestamp);
  return date.toLocaleDateString("en-US", { month: "short", year: "numeric" });
};

/**
 * Format a timestamp to ISO date string (YYYY-MM-DD).
 */
export const formatISODate = (timestamp: number): string => {
  const date = new Date(timestamp);
  const parts = date.toISOString().split("T");
  return parts[0] ?? "";
};

/**
 * Parse an ISO date string to timestamp.
 */
export const parseISODate = (dateStr: string): number => {
  return new Date(dateStr).getTime();
};

/**
 * Format a date range for display with "From"/"Until" prefixes.
 *
 * Returns `undefined` when both dates are empty. Uses en-US locale formatting.
 */
export const formatDateRangeLabel = (startDate: string | null, endDate: string | null): string | undefined => {
  const hasStartDate = startDate != null && startDate !== "";
  const hasEndDate = endDate != null && endDate !== "";

  if (!hasStartDate && !hasEndDate) {
    return undefined;
  }

  const start = hasStartDate ? new Date(startDate).toLocaleDateString("en-US") : "Start";
  const end = hasEndDate ? new Date(endDate).toLocaleDateString("en-US") : "End";

  if (hasStartDate && hasEndDate) {
    return `${start} - ${end}`;
  } else if (hasStartDate) {
    return `From ${start}`;
  } else if (hasEndDate) {
    return `Until ${end}`;
  }
  return undefined;
};

/**
 * Format a date string using the browser's locale-aware toLocaleString().
 *
 * Returns an em-dash for null/undefined input.
 */
export const formatDateLocale = (dateStr: string | null | undefined): string => {
  if (!dateStr) return "\u2014";
  return new Date(dateStr).toLocaleString();
};
