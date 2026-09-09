/**
 * Unit tests for timezone-aware cron expression matching.
 *
 * @module
 * @category Tests
 */
import { describe, expect, it } from "vitest";

import { calculateNextCronRun } from "@/lib/ingest/cron-parser";

describe("Timezone-aware Cron Parser", () => {
  describe("calculateNextCronRun with timezone", () => {
    it.each([
      ["Pacific/Kiritimati", "2025-01-31T10:00:00.000Z"],
      ["Pacific/Pago_Pago", "2025-02-01T11:00:00.000Z"],
      ["Asia/Kathmandu", "2025-01-31T18:15:00.000Z"],
    ])("keeps month-boundary matches in %s", (timezone, expected) => {
      const next = calculateNextCronRun("0 0 1 2 *", new Date("2025-01-01T00:00:00Z"), timezone);
      expect(next?.toISOString()).toBe(expected);
    });

    it("finds a distant leap day in local time", () => {
      const next = calculateNextCronRun("0 0 29 2 *", new Date("2025-03-01T00:00:00Z"), "Europe/Berlin");
      expect(next?.toISOString()).toBe("2028-02-28T23:00:00.000Z");
    }, 30_000);

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

    it("shifts a nonexistent local time forward during the spring transition", () => {
      const next = calculateNextCronRun("30 2 * * *", new Date("2024-03-31T00:00:00Z"), "Europe/Berlin");

      // Croner shifts the nonexistent 02:30 to 03:30 CEST on the same day.
      expect(next?.toISOString()).toBe("2024-03-31T01:30:00.000Z");
    });

    it("does not repeat a local time during the autumn transition", () => {
      const next = calculateNextCronRun("30 2 * * *", new Date("2024-10-27T00:31:00Z"), "Europe/Berlin");

      // The first 02:30 has passed; Croner schedules the next day, not the repeated hour.
      expect(next?.toISOString()).toBe("2024-10-28T01:30:00.000Z");
    });
  });
});
