/**
 * Unit tests for timezone-aware cron expression matching.
 *
 * @module
 * @category Tests
 */
import { describe, expect, it } from "vitest";

import { calculateNextCronRun, matchesCronDate, parseCronExpression } from "@/lib/ingest/cron-parser";
import { createTimezoneFormatter } from "@/lib/utils/timezone";

describe("Timezone-aware Cron Parser", () => {
  describe("matchesCronDate with timezone formatter", () => {
    it("should match using UTC when no formatter provided", () => {
      const date = new Date("2024-01-15T12:30:00Z");
      const parts = parseCronExpression("30 12 * * *");
      expect(matchesCronDate(date, parts)).toBe(true);
    });

    it("should match against wall-clock time in Europe/Berlin", () => {
      // 2024-01-15 07:00 UTC = 08:00 CET (Europe/Berlin, winter)
      const date = new Date("2024-01-15T07:00:00Z");
      const parts = parseCronExpression("0 8 * * *");
      const berlinFmt = createTimezoneFormatter("Europe/Berlin");

      // Should NOT match in UTC (it's 07:00 UTC, not 08:00)
      expect(matchesCronDate(date, parts)).toBe(false);

      // Should match in Europe/Berlin (it's 08:00 CET)
      expect(matchesCronDate(date, parts, berlinFmt)).toBe(true);
    });

    it("should match against wall-clock time in America/New_York", () => {
      // 2024-01-15 13:00 UTC = 08:00 EST (America/New_York, winter)
      const date = new Date("2024-01-15T13:00:00Z");
      const parts = parseCronExpression("0 8 * * *");
      const nyFmt = createTimezoneFormatter("America/New_York");

      expect(matchesCronDate(date, parts, nyFmt)).toBe(true);
      expect(matchesCronDate(date, parts)).toBe(false); // Not 08:00 in UTC
    });

    it("should match day-of-week correctly across timezone boundary", () => {
      // 2024-01-14 23:00 UTC (Sunday) = 2024-01-15 00:00 CET (Monday) in Berlin
      const date = new Date("2024-01-14T23:00:00Z");
      const mondayParts = parseCronExpression("0 0 * * 1"); // Monday at 00:00
      const berlinFmt = createTimezoneFormatter("Europe/Berlin");

      expect(matchesCronDate(date, mondayParts)).toBe(false); // Sunday in UTC
      expect(matchesCronDate(date, mondayParts, berlinFmt)).toBe(true); // Monday in Berlin
    });

    it("should match month correctly across timezone boundary", () => {
      // 2024-01-31 23:30 UTC = 2024-02-01 00:30 CET in Berlin
      const date = new Date("2024-01-31T23:30:00Z");
      const febParts = parseCronExpression("30 0 1 2 *"); // Feb 1st at 00:30
      const berlinFmt = createTimezoneFormatter("Europe/Berlin");

      expect(matchesCronDate(date, febParts)).toBe(false); // Still January in UTC
      expect(matchesCronDate(date, febParts, berlinFmt)).toBe(true); // February in Berlin
    });
  });

  describe("calculateNextCronRun with timezone", () => {
    it("should calculate next run in UTC by default", () => {
      const from = new Date("2024-01-15T10:00:00Z");
      const next = calculateNextCronRun("0 12 * * *", from);
      expect(next).not.toBeNull();
      expect(next!.toISOString()).toBe("2024-01-15T12:00:00.000Z");
    });

    it("should calculate next run at 08:00 in Europe/Berlin", () => {
      // From 2024-01-15 06:30 UTC (= 07:30 CET Berlin)
      // Next "0 8 * * *" in Berlin = 08:00 CET = 07:00 UTC
      const from = new Date("2024-01-15T06:30:00Z");
      const next = calculateNextCronRun("0 8 * * *", from, "Europe/Berlin");
      expect(next).not.toBeNull();
      expect(next!.toISOString()).toBe("2024-01-15T07:00:00.000Z");
    });

    it("should calculate next run at 08:00 in America/New_York", () => {
      // From 2024-01-15 12:00 UTC (= 07:00 EST New York)
      // Next "0 8 * * *" in NYC = 08:00 EST = 13:00 UTC
      const from = new Date("2024-01-15T12:00:00Z");
      const next = calculateNextCronRun("0 8 * * *", from, "America/New_York");
      expect(next).not.toBeNull();
      expect(next!.toISOString()).toBe("2024-01-15T13:00:00.000Z");
    });

    it("should advance to next day if past target time in timezone", () => {
      // From 2024-01-15 08:00 UTC (= 09:00 CET Berlin, past 08:00)
      // Next "0 8 * * *" in Berlin = 2024-01-16 08:00 CET = 07:00 UTC
      const from = new Date("2024-01-15T08:00:00Z");
      const next = calculateNextCronRun("0 8 * * *", from, "Europe/Berlin");
      expect(next).not.toBeNull();
      expect(next!.toISOString()).toBe("2024-01-16T07:00:00.000Z");
    });

    it("should handle DST spring forward (Europe/Berlin)", () => {
      // Berlin DST: 2024-03-31 02:00 CET -> 03:00 CEST (UTC+1 -> UTC+2)
      // From: 2024-03-30 08:00 UTC (= 09:00 CET, past 08:00)
      // Next "0 8 * * *" in Berlin = 2024-03-31 08:00 CEST = 06:00 UTC
      const from = new Date("2024-03-30T08:00:00Z");
      const next = calculateNextCronRun("0 8 * * *", from, "Europe/Berlin");
      expect(next).not.toBeNull();
      expect(next!.toISOString()).toBe("2024-03-31T06:00:00.000Z");
    });

    it("should handle DST fall back (Europe/Berlin)", () => {
      // Berlin DST: 2024-10-27 03:00 CEST -> 02:00 CET (UTC+2 -> UTC+1)
      // From: 2024-10-26 07:00 UTC (= 09:00 CEST, past 08:00)
      // Next "0 8 * * *" in Berlin = 2024-10-27 08:00 CET = 07:00 UTC
      const from = new Date("2024-10-26T07:00:00Z");
      const next = calculateNextCronRun("0 8 * * *", from, "Europe/Berlin");
      expect(next).not.toBeNull();
      expect(next!.toISOString()).toBe("2024-10-27T07:00:00.000Z");
    });

    it("should return null for impossible cron even with timezone", () => {
      // Feb 31 never exists in any timezone
      const result = calculateNextCronRun("0 0 31 2 *", undefined, "Europe/Berlin");
      expect(result).toBeNull();
    }, 30_000); // Extended timeout for exhaustive search with timezone
  });
});
