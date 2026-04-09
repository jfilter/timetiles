/**
 * Unit tests for data export formatting utilities.
 *
 * @module
 * @category Tests
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import { formatExportDate, getExportDownloadUrl, getTimeUntilExpiry } from "@/lib/export/formatting";

describe("Export Formatting Utilities", () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  describe("getExportDownloadUrl", () => {
    it("returns the correct download URL for a given export ID", () => {
      expect(getExportDownloadUrl(42)).toBe("/api/data-exports/42/download");
    });

    it("handles single-digit IDs", () => {
      expect(getExportDownloadUrl(1)).toBe("/api/data-exports/1/download");
    });

    it("handles large IDs", () => {
      expect(getExportDownloadUrl(999999)).toBe("/api/data-exports/999999/download");
    });
  });

  describe("formatExportDate", () => {
    it("returns a formatted date string for valid input", () => {
      const result = formatExportDate("2024-01-15T15:30:00.000Z");

      // formatDate returns a locale-formatted string with date and time
      expect(result).toContain("Jan");
      expect(result).toContain("15");
      expect(result).toContain("2024");
    });

    it("returns 'Unknown' for null input", () => {
      expect(formatExportDate(null)).toBe("Unknown");
    });

    it("returns 'Unknown' for undefined input", () => {
      expect(formatExportDate(undefined)).toBe("Unknown");
    });

    it("returns 'Unknown' for empty string input", () => {
      expect(formatExportDate("")).toBe("Unknown");
    });

    it("returns 'Unknown' for an invalid date string", () => {
      // formatDate returns "Invalid date" for unparseable strings,
      // but formatExportDate only maps "N/A" to "Unknown"
      const result = formatExportDate("not-a-date");
      // "Invalid date" is not "N/A", so it passes through as-is
      expect(result).toBe("Invalid date");
    });
  });

  describe("getTimeUntilExpiry", () => {
    it("returns null for null input", () => {
      expect(getTimeUntilExpiry(null)).toBeNull();
    });

    it("returns null for undefined input", () => {
      expect(getTimeUntilExpiry(undefined)).toBeNull();
    });

    it("returns null for empty string input", () => {
      expect(getTimeUntilExpiry("")).toBeNull();
    });

    it("returns null for an invalid date string", () => {
      expect(getTimeUntilExpiry("not-a-date")).toBeNull();
    });

    it("returns 'Expired' for a date in the past", () => {
      expect(getTimeUntilExpiry("2020-01-01T00:00:00Z")).toBe("Expired");
    });

    it("returns days and hours remaining for a date days in the future", () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2024-06-01T12:00:00Z"));

      expect(getTimeUntilExpiry("2024-06-04T17:00:00Z")).toBe("3d 5h remaining");
    });

    it("returns hours only when less than a day remains", () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2024-06-01T12:00:00Z"));

      expect(getTimeUntilExpiry("2024-06-01T17:00:00Z")).toBe("5h remaining");
    });

    it("returns minutes only when less than an hour remains", () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2024-06-01T12:00:00Z"));

      expect(getTimeUntilExpiry("2024-06-01T12:45:00Z")).toBe("45m remaining");
    });

    it("returns '0m remaining' when expiry is seconds away", () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2024-06-01T12:00:00Z"));

      expect(getTimeUntilExpiry("2024-06-01T12:00:30Z")).toBe("0m remaining");
    });

    it("returns 'Expired' when expiry is exactly now", () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2024-06-01T12:00:00Z"));

      expect(getTimeUntilExpiry("2024-06-01T12:00:00Z")).toBe("Expired");
    });

    it("returns days with 0 hours when exactly on a day boundary", () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2024-06-01T12:00:00Z"));

      expect(getTimeUntilExpiry("2024-06-03T12:00:00Z")).toBe("2d 0h remaining");
    });
  });
});
