/**
 * Unit tests for date formatting utilities.
 *
 * @module
 * @category Tests
 */
import { describe, expect, it } from "vitest";

import { formatDateRangeLabel, formatDateShort } from "../../../lib/utils/date";

describe("Date Formatting Utilities", () => {
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

  describe("formatDateRangeLabel", () => {
    it("returns undefined when both dates are empty", () => {
      expect(formatDateRangeLabel(null, null)).toBeUndefined();
      expect(formatDateRangeLabel("", "")).toBeUndefined();
    });

    it("labels a closed range", () => {
      const result = formatDateRangeLabel("2024-01-15", "2024-01-20");
      expect(result?.type).toBe("range");
    });

    it("labels an open start as 'since'", () => {
      const result = formatDateRangeLabel("2024-01-15", null);
      expect(result?.type).toBe("since");
    });

    it("labels an open end as 'until'", () => {
      const result = formatDateRangeLabel(null, "2024-01-20");
      expect(result?.type).toBe("until");
    });

    // Regression: a malformed date param (e.g. ?startDate=garbage) reaches this
    // straight from the URL. Intl.format/formatRange throw on Invalid Date, so an
    // unparseable value must be treated as absent rather than crashing the page.
    it("does not throw on an unparseable date and treats it as absent", () => {
      expect(() => formatDateRangeLabel("garbage", null)).not.toThrow();
      expect(formatDateRangeLabel("garbage", null)).toBeUndefined();
      expect(formatDateRangeLabel("garbage", "2024-01-20")?.type).toBe("until");
      expect(formatDateRangeLabel("2024-01-15", "garbage")?.type).toBe("since");
    });
  });
});
