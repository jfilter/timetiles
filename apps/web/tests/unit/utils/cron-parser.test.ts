/**
 * Tests for the Croner adapter used by scheduled ingests.
 *
 * @module
 * @category Tests
 */
import { describe, expect, it } from "vitest";

import { calculateNextCronRun, createCronSchedule } from "@/lib/ingest/cron-parser";

describe("Cron scheduling", () => {
  it.each(["", "0 12 *", "0 12 * * * *", "@daily"])("rejects non-five-field schedules: %s", (expression) => {
    expect(() => createCronSchedule(expression)).toThrow(/Expected 5 parts/);
  });

  describe("calculateNextCronRun", () => {
    it("finds a leap-day run more than one year in the future", () => {
      const next = calculateNextCronRun("0 0 29 2 *", new Date("2025-03-01T00:00:00Z"));
      expect(next?.toISOString()).toBe("2028-02-29T00:00:00.000Z");
    });

    it("finds the next leap day across a non-leap century", () => {
      const next = calculateNextCronRun("0 0 29 2 *", new Date("2096-03-01T00:00:00Z"));
      expect(next?.toISOString()).toBe("2104-02-29T00:00:00.000Z");
    });

    it("keeps weekday alternatives when the month-day cannot exist", () => {
      const next = calculateNextCronRun("0 0 31 2 1", new Date("2025-02-01T00:00:00Z"));
      expect(next?.toISOString()).toBe("2025-02-03T00:00:00.000Z");
    });

    it("should calculate next run for daily cron", () => {
      const from = new Date("2026-03-15T10:00:00Z");
      const next = calculateNextCronRun("0 12 * * *", from);
      expect(next).not.toBeNull();
      expect(next!.getUTCHours()).toBe(12);
      expect(next!.getUTCMinutes()).toBe(0);
      expect(next!.getUTCDate()).toBe(15);
    });

    it("should advance to next day if past target time", () => {
      const from = new Date("2026-03-15T13:00:00Z");
      const next = calculateNextCronRun("0 12 * * *", from);
      expect(next).not.toBeNull();
      expect(next!.getUTCHours()).toBe(12);
      expect(next!.getUTCDate()).toBe(16);
    });

    it("should calculate next run for weekly cron", () => {
      // From Sunday, find next Monday at 08:30
      const from = new Date("2026-03-15T10:00:00Z"); // Sunday
      const next = calculateNextCronRun("30 8 * * 1", from);
      expect(next).not.toBeNull();
      expect(next!.getUTCDay()).toBe(1); // Monday
      expect(next!.getUTCHours()).toBe(8);
      expect(next!.getUTCMinutes()).toBe(30);
    });

    it("should calculate next run for step-based cron", () => {
      const from = new Date("2026-03-15T10:03:00Z");
      const next = calculateNextCronRun("*/5 * * * *", from);
      expect(next).not.toBeNull();
      expect(next!.getUTCMinutes() % 5).toBe(0);
    });

    it("should run day-of-month steps on odd days (standard cron)", () => {
      // From the 15th, "0 0 */2 * *" must next fire on the 17th — not the 16th
      const from = new Date("2026-03-15T10:00:00Z");
      const next = calculateNextCronRun("0 0 */2 * *", from);
      expect(next).not.toBeNull();
      expect(next!.getUTCDate()).toBe(17);
    });

    it("should support range-with-step expressions", () => {
      // "0 0 1-30/2 * *" fires on odd days within 1-30
      const from = new Date("2026-03-15T10:00:00Z");
      const next = calculateNextCronRun("0 0 1-30/2 * *", from);
      expect(next).not.toBeNull();
      expect(next!.getUTCDate()).toBe(17);
    });

    it("should return null for impossible expressions", () => {
      // Feb 31 never exists
      const result = calculateNextCronRun("0 0 31 2 *");
      expect(result).toBeNull();
    });

    it("should return null for malformed field values", () => {
      // "30abc" is not a valid cron field, so no date will ever match
      const result = calculateNextCronRun("30abc 14 * * *");
      expect(result).toBeNull();
    });

    it("should skip to next minute from fromDate", () => {
      const from = new Date("2026-03-15T12:00:00Z");
      const next = calculateNextCronRun("* * * * *", from);
      expect(next).not.toBeNull();
      // Should be at least 1 minute after fromDate
      expect(next!.getTime()).toBeGreaterThan(from.getTime());
      expect(next!.getUTCMinutes()).toBe(1);
    });

    it("should calculate next run for monthly cron on specific day", () => {
      const from = new Date("2026-03-20T10:00:00Z");
      const next = calculateNextCronRun("0 9 1 * *", from);
      expect(next).not.toBeNull();
      expect(next!.getUTCDate()).toBe(1);
      expect(next!.getUTCMonth()).toBe(3); // April (0-indexed)
      expect(next!.getUTCHours()).toBe(9);
    });
  });
});
