/**
 * Unit tests for timezone conversion utilities.
 *
 * @module
 * @category Tests
 */
import { describe, expect, it } from "vitest";

import { getDatePartsInTimezone, isValidTimezone, wallClockToUtc } from "@/lib/utils/timezone";

describe("Timezone Utilities", () => {
  describe("isValidTimezone", () => {
    it("should accept valid IANA timezone identifiers", () => {
      expect(isValidTimezone("UTC")).toBe(true);
      expect(isValidTimezone("Europe/Berlin")).toBe(true);
      expect(isValidTimezone("America/New_York")).toBe(true);
      expect(isValidTimezone("Asia/Tokyo")).toBe(true);
      expect(isValidTimezone("Australia/Sydney")).toBe(true);
    });

    it("should reject invalid timezone identifiers", () => {
      expect(isValidTimezone("Invalid/Timezone")).toBe(false);
      expect(isValidTimezone("Europe/FakeCity")).toBe(false);
      expect(isValidTimezone("")).toBe(false);
      expect(isValidTimezone("ABC")).toBe(false);
    });
  });

  describe("getDatePartsInTimezone", () => {
    it("should return UTC components for UTC timezone", () => {
      const date = new Date("2024-01-15T10:30:00Z");
      const parts = getDatePartsInTimezone(date, "UTC");

      expect(parts.year).toBe(2024);
      expect(parts.month).toBe(1);
      expect(parts.day).toBe(15);
      expect(parts.hour).toBe(10);
      expect(parts.minute).toBe(30);
    });

    it("should convert UTC to Europe/Berlin (CET, UTC+1 in winter)", () => {
      // 2024-01-15 23:30 UTC = 2024-01-16 00:30 CET
      const date = new Date("2024-01-15T23:30:00Z");
      const parts = getDatePartsInTimezone(date, "Europe/Berlin");

      expect(parts.year).toBe(2024);
      expect(parts.month).toBe(1);
      expect(parts.day).toBe(16);
      expect(parts.hour).toBe(0);
      expect(parts.minute).toBe(30);
    });

    it("should convert UTC to Europe/Berlin (CEST, UTC+2 in summer)", () => {
      // 2024-07-15 22:00 UTC = 2024-07-16 00:00 CEST
      const date = new Date("2024-07-15T22:00:00Z");
      const parts = getDatePartsInTimezone(date, "Europe/Berlin");

      expect(parts.year).toBe(2024);
      expect(parts.month).toBe(7);
      expect(parts.day).toBe(16);
      expect(parts.hour).toBe(0);
      expect(parts.minute).toBe(0);
    });

    it("should convert UTC to America/New_York (EST, UTC-5 in winter)", () => {
      // 2024-01-15 03:00 UTC = 2024-01-14 22:00 EST
      const date = new Date("2024-01-15T03:00:00Z");
      const parts = getDatePartsInTimezone(date, "America/New_York");

      expect(parts.year).toBe(2024);
      expect(parts.month).toBe(1);
      expect(parts.day).toBe(14);
      expect(parts.hour).toBe(22);
      expect(parts.minute).toBe(0);
    });

    it("should return correct day of week", () => {
      // 2024-01-15 is a Monday
      const date = new Date("2024-01-15T12:00:00Z");
      const parts = getDatePartsInTimezone(date, "UTC");
      expect(parts.dayOfWeek).toBe(1); // Monday

      // But in Asia/Tokyo (UTC+9), this is still Monday
      const tokyoParts = getDatePartsInTimezone(date, "Asia/Tokyo");
      expect(tokyoParts.dayOfWeek).toBe(1); // Still Monday (21:00 JST)
    });

    it("should handle day-of-week rollover due to timezone", () => {
      // 2024-01-14 (Sunday) 23:00 UTC = 2024-01-15 (Monday) 00:00 CET
      const date = new Date("2024-01-14T23:00:00Z");
      const utcParts = getDatePartsInTimezone(date, "UTC");
      expect(utcParts.dayOfWeek).toBe(0); // Sunday in UTC

      const berlinParts = getDatePartsInTimezone(date, "Europe/Berlin");
      expect(berlinParts.dayOfWeek).toBe(1); // Monday in Berlin
    });
  });

  describe("wallClockToUtc", () => {
    it("should convert UTC wall-clock to UTC (identity)", () => {
      const result = wallClockToUtc(2024, 1, 15, 10, 30, "UTC");
      expect(result.toISOString()).toBe("2024-01-15T10:30:00.000Z");
    });

    it("should convert Berlin midnight to UTC (winter, CET UTC+1)", () => {
      // Midnight in Berlin (CET) = 23:00 previous day in UTC
      const result = wallClockToUtc(2024, 1, 16, 0, 0, "Europe/Berlin");
      expect(result.toISOString()).toBe("2024-01-15T23:00:00.000Z");
    });

    it("should convert Berlin midnight to UTC (summer, CEST UTC+2)", () => {
      // Midnight in Berlin (CEST) = 22:00 previous day in UTC
      const result = wallClockToUtc(2024, 7, 16, 0, 0, "Europe/Berlin");
      expect(result.toISOString()).toBe("2024-07-15T22:00:00.000Z");
    });

    it("should convert New York midnight to UTC (EST UTC-5)", () => {
      // Midnight in New York (EST) = 05:00 same day in UTC
      const result = wallClockToUtc(2024, 1, 15, 0, 0, "America/New_York");
      expect(result.toISOString()).toBe("2024-01-15T05:00:00.000Z");
    });

    it("should convert New York midnight to UTC (EDT UTC-4)", () => {
      // Midnight in New York (EDT) = 04:00 same day in UTC
      const result = wallClockToUtc(2024, 7, 15, 0, 0, "America/New_York");
      expect(result.toISOString()).toBe("2024-07-15T04:00:00.000Z");
    });

    it("should handle date overflow correctly", () => {
      // Day 32 of January = February 1
      const result = wallClockToUtc(2024, 1, 32, 0, 0, "UTC");
      expect(result.toISOString()).toBe("2024-02-01T00:00:00.000Z");
    });

    it("should handle month overflow correctly", () => {
      // Month 13 = January of next year
      const result = wallClockToUtc(2024, 13, 1, 0, 0, "UTC");
      expect(result.toISOString()).toBe("2025-01-01T00:00:00.000Z");
    });
  });
});
