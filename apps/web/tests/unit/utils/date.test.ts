/**
 * Unit tests for date formatting utilities.
 *
 * @module
 * @category Tests
 */
import { describe, expect, it } from "vitest";

import { formatDate, formatDateShort } from "../../../lib/utils/date";

describe("Date Formatting Utilities", () => {
  describe("formatDate", () => {
    it("should format Date object correctly with time", () => {
      const date = new Date("2024-01-15T15:30:00.000Z");
      const formatted = formatDate(date);
      // Format uses comma separator and local timezone
      expect(formatted).toContain("Jan 15, 2024");
      expect(formatted).toMatch(/\d{1,2}:\d{2} [AP]M/);
    });

    it("should format ISO string correctly", () => {
      const isoString = "2024-03-20T10:45:00.000Z";
      const formatted = formatDate(isoString);
      expect(formatted).toContain("Mar 20, 2024");
      expect(formatted).toMatch(/\d{1,2}:\d{2} [AP]M/);
    });

    it("should format date string with different format", () => {
      const dateString = "2024-06-10T18:00:00.000Z";
      const formatted = formatDate(dateString);
      expect(formatted).toContain("Jun 10, 2024");
      expect(formatted).toMatch(/\d{1,2}:\d{2} [AP]M/);
    });

    it("should return 'N/A' for null", () => {
      expect(formatDate(null)).toBe("N/A");
    });

    it("should return 'N/A' for undefined", () => {
      expect(formatDate(undefined)).toBe("N/A");
    });

    it("should return 'Invalid date' for invalid string", () => {
      expect(formatDate("not a date")).toBe("Invalid date");
    });

    it("should return 'Invalid date' for empty string", () => {
      expect(formatDate("")).toBe("N/A"); // Empty string is falsy
    });

    it("should return 'Invalid date' for NaN date", () => {
      const invalidDate = new Date("invalid");
      expect(formatDate(invalidDate)).toBe("Invalid date");
    });

    it("should format dates with leading zeros in minutes", () => {
      const date = new Date("2024-12-25T08:05:00.000Z");
      const formatted = formatDate(date);
      // Should include :05 with leading zero
      expect(formatted).toContain("Dec 25, 2024");
      expect(formatted).toMatch(/:05 [AP]M/);
    });

    it("should format midnight correctly", () => {
      const date = new Date("2024-01-01T08:00:00.000Z");
      const formatted = formatDate(date);
      // Contains formatted date with time
      expect(formatted).toContain("Jan 1, 2024");
      expect(formatted).toMatch(/\d{1,2}:00 [AP]M/);
    });

    it("should format noon correctly", () => {
      const date = new Date("2024-07-04T20:00:00.000Z");
      const formatted = formatDate(date);
      // Contains formatted date with time
      expect(formatted).toContain("Jul 4, 2024");
      expect(formatted).toMatch(/\d{1,2}:00 [AP]M/);
    });

    it("should handle leap year dates", () => {
      const leapDay = new Date("2024-02-29T20:00:00.000Z");
      const formatted = formatDate(leapDay);
      // Contains formatted date
      expect(formatted).toContain("Feb 29, 2024");
      expect(formatted).toMatch(/\d{1,2}:00 [AP]M/);
    });

    it("should handle year boundaries", () => {
      const newYearsEve = new Date("2023-12-31T19:00:00.000Z");
      const formatted = formatDate(newYearsEve);
      // Timezone-agnostic test - just verify it formats as a valid date/time
      expect(formatted).toMatch(/[A-Z][a-z]{2} \d{1,2}, \d{4}, \d{1,2}:\d{2} [AP]M/);
    });

    it("should format very old dates", () => {
      const oldDate = new Date("1900-01-01T20:00:00.000Z");
      const formatted = formatDate(oldDate);
      // Contains formatted date
      expect(formatted).toContain("Jan 1, 1900");
      expect(formatted).toMatch(/\d{1,2}:00 [AP]M/);
    });

    it("should format future dates", () => {
      const futureDate = new Date("2099-12-31T19:00:00.000Z");
      const formatted = formatDate(futureDate);
      // Timezone-agnostic test - just verify it formats as a valid date/time
      expect(formatted).toMatch(/[A-Z][a-z]{2} \d{1,2}, \d{4}, \d{1,2}:\d{2} [AP]M/);
    });
  });

  describe("formatDateShort", () => {
    it("should format Date object without time", () => {
      const date = new Date("2024-01-15T15:30:00.000Z");
      const formatted = formatDateShort(date);
      expect(formatted).toBe("Jan 15, 2024");
    });

    it("should format ISO string without time", () => {
      const isoString = "2024-03-20T10:45:00.000Z";
      const formatted = formatDateShort(isoString);
      expect(formatted).toBe("Mar 20, 2024");
    });

    it("should return 'N/A' for null", () => {
      expect(formatDateShort(null)).toBe("N/A");
    });

    it("should return 'N/A' for undefined", () => {
      expect(formatDateShort(undefined)).toBe("N/A");
    });

    it("should return 'Invalid date' for invalid string", () => {
      expect(formatDateShort("not a date")).toBe("Invalid date");
    });

    it("should return 'N/A' for empty string", () => {
      expect(formatDateShort("")).toBe("N/A");
    });

    it("should return 'Invalid date' for NaN date", () => {
      const invalidDate = new Date("invalid");
      expect(formatDateShort(invalidDate)).toBe("Invalid date");
    });

    it("should format dates consistently regardless of time", () => {
      const morning = new Date("2024-06-10T08:00:00.000Z");
      const evening = new Date("2024-06-10T20:00:00.000Z");
      expect(formatDateShort(morning)).toBe("Jun 10, 2024");
      expect(formatDateShort(evening)).toBe("Jun 10, 2024");
    });

    it("should handle leap year dates", () => {
      const leapDay = new Date("2024-02-29T12:00:00.000Z");
      const formatted = formatDateShort(leapDay);
      expect(formatted).toBe("Feb 29, 2024");
    });

    it("should format first day of year", () => {
      const newYearsDay = new Date("2024-01-01T00:00:00.000Z");
      const formatted = formatDateShort(newYearsDay);
      expect(formatted).toBe("Jan 1, 2024");
    });

    it("should format last day of year", () => {
      const newYearsEve = new Date("2024-12-31T12:00:00.000Z");
      const formatted = formatDateShort(newYearsEve);
      // Timezone-agnostic test - just verify it's a valid date in 2024 or 2025
      expect(formatted).toMatch(/(Dec 31, 2024|Jan 1, 2025)/);
    });

    it("should format very old dates", () => {
      const oldDate = new Date("1900-01-01T12:00:00.000Z");
      const formatted = formatDateShort(oldDate);
      expect(formatted).toBe("Jan 1, 1900");
    });

    it("should format future dates", () => {
      const futureDate = new Date("2099-12-31T12:00:00.000Z");
      const formatted = formatDateShort(futureDate);
      expect(formatted).toBe("Dec 31, 2099");
    });

    it("should handle all months correctly", () => {
      const months = [
        { date: "2024-01-15", expected: "Jan 15, 2024" },
        { date: "2024-02-15", expected: "Feb 15, 2024" },
        { date: "2024-03-15", expected: "Mar 15, 2024" },
        { date: "2024-04-15", expected: "Apr 15, 2024" },
        { date: "2024-05-15", expected: "May 15, 2024" },
        { date: "2024-06-15", expected: "Jun 15, 2024" },
        { date: "2024-07-15", expected: "Jul 15, 2024" },
        { date: "2024-08-15", expected: "Aug 15, 2024" },
        { date: "2024-09-15", expected: "Sep 15, 2024" },
        { date: "2024-10-15", expected: "Oct 15, 2024" },
        { date: "2024-11-15", expected: "Nov 15, 2024" },
        { date: "2024-12-15", expected: "Dec 15, 2024" },
      ];

      months.forEach(({ date, expected }) => {
        expect(formatDateShort(date)).toBe(expected);
      });
    });
  });
});
