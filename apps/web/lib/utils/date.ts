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

import { valueToString } from "@/lib/utils/format";

const ISO_DATE_PREFIX_REGEX = /^(\d{4})-(\d{2})-(\d{2})(?:$|[T\s])/;
const NUMERIC_STRING_REGEX = /^[+-]?\d+(?:\.\d+)?$/;

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
    // Bare years (1000-9999) should be treated as years, not milliseconds
    if (Number.isInteger(date) && date >= 1000 && date <= 9999) {
      const dateObj = new Date(`${date}-01-01T00:00:00Z`);
      return isValidDate(dateObj) ? dateObj : null;
    }
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

  // Bare 4-digit year string: treat as January 1st of that year
  if (/^\d{4}$/.test(trimmedDate)) {
    const dateObj = new Date(`${trimmedDate}-01-01T00:00:00Z`);
    return isValidDate(dateObj) ? dateObj : null;
  }

  // Do not let JavaScript's Date parser reinterpret arbitrary numeric
  // strings as huge years (for example "39135" -> year 39135). CSV readers
  // commonly leave ID, income, and count columns as strings; only bare
  // four-digit year strings are accepted above.
  if (NUMERIC_STRING_REGEX.test(trimmedDate)) {
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

export const formatDate = (date: DateInput, options?: { includeTime?: boolean; locale?: string }): string => {
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

    return new Intl.DateTimeFormat(options?.locale, formatOptions).format(dateObj);
  } catch {
    return "Invalid date";
  }
};

/**
 * Format a date for short display (just the date, no time).
 */
export const formatDateShort = (date: string | Date | null | undefined, locale?: string): string =>
  formatDate(date, { includeTime: false, locale });

/**
 * Format a date in long format with weekday, suitable for emails and notifications.
 *
 * @param date - Date to format
 * @param includeTime - Whether to include hour and minute (default: false)
 * @returns Formatted date string like "Saturday, March 15, 2026" or "Unknown" if invalid
 */
export const formatLongDate = (
  date: string | Date | null | undefined,
  includeTime = false,
  locale?: string
): string => {
  const dateObj = parseDateInput(date);
  if (!dateObj) return "Unknown";

  const options: Intl.DateTimeFormatOptions = { weekday: "long", year: "numeric", month: "long", day: "numeric" };

  if (includeTime) {
    options.hour = "2-digit";
    options.minute = "2-digit";
  }

  return dateObj.toLocaleDateString(locale, options);
};

/**
 * Format a timestamp to a month-year string (e.g., "Jan 2024").
 */
export const formatMonthYear = (timestamp: string | number, locale?: string): string => {
  const date = new Date(timestamp);
  return date.toLocaleDateString(locale, { month: "short", year: "numeric" });
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
 * Format a Date object as a local calendar ISO date string (YYYY-MM-DD).
 *
 * Unlike {@link formatISODate}, this preserves the user's local calendar day
 * instead of converting through UTC first.
 */
export const formatLocalISODate = (date: Date): string => {
  if (!isValidDate(date)) return "";

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

/**
 * Parse an ISO date string to timestamp.
 */
export const parseISODate = (dateStr: string): number => {
  return new Date(dateStr).getTime();
};

/** Format start/end dates into a locale-aware range string using Intl.DateTimeFormat */
export const formatDateRange = (startDate: unknown, endDate: unknown, locale: string = "en-US"): string | null => {
  const hasStart = startDate != null && valueToString(startDate) !== "";
  const hasEnd = endDate != null && valueToString(endDate) !== "";

  if (!hasStart && !hasEnd) return null;

  const fmt = new Intl.DateTimeFormat(locale, { dateStyle: "medium" });
  const start = hasStart ? new Date(valueToString(startDate)) : null;
  const end = hasEnd ? new Date(valueToString(endDate)) : null;

  if (start && end && valueToString(startDate) !== valueToString(endDate)) {
    return fmt.formatRange(start, end);
  }

  return fmt.format(start ?? end!);
};

/**
 * Format a date range for filter labels using locale-aware formatting.
 *
 * Returns `undefined` when both dates are empty. Uses `Intl.DateTimeFormat.formatRange`
 * for proper locale-specific range display.
 */
export const formatDateRangeLabel = (
  startDate: string | null,
  endDate: string | null,
  locale?: string
): { type: "range" | "since" | "until"; formatted: string } | undefined => {
  const hasStartDate = startDate != null && startDate !== "";
  const hasEndDate = endDate != null && endDate !== "";

  if (!hasStartDate && !hasEndDate) {
    return undefined;
  }

  const fmt = new Intl.DateTimeFormat(locale, { dateStyle: "medium" });
  const start = hasStartDate ? new Date(startDate) : null;
  const end = hasEndDate ? new Date(endDate) : null;

  if (start && end) {
    return { type: "range", formatted: fmt.formatRange(start, end) };
  }

  if (start) {
    return { type: "since", formatted: fmt.format(start) };
  }

  return { type: "until", formatted: fmt.format(end!) };
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

/**
 * Format a duration in milliseconds to a human-readable string.
 *
 * Returns an em-dash for null/undefined input.
 * Shows milliseconds for durations under 1 second, otherwise seconds with one decimal.
 */
export const formatDuration = (ms: number | null | undefined): string => {
  if (ms == null) return "\u2014";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
};
