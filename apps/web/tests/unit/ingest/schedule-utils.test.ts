/**
 * Unit tests for frequency-based schedule calculation.
 *
 * Focuses on timezone handling — in particular that a blank timezone is treated
 * as UTC rather than crashing Intl.DateTimeFormat.
 *
 * @module
 * @category Tests
 */
import { describe, expect, it } from "vitest";

import { getNextFrequencyExecution } from "@/lib/ingest/schedule-utils";

describe("getNextFrequencyExecution", () => {
  const from = new Date("2024-01-15T10:30:00.000Z");

  it("treats an empty-string timezone as UTC instead of throwing", () => {
    // Regression: the timezone field's validate accepts "", and a data-package
    // manifest can supply "". `"" ?? "UTC"` kept "", which routed into
    // Intl.DateTimeFormat({ timeZone: "" }) → RangeError, crashing schedule
    // create/activate and silently disabling frequency schedules.
    expect(() => getNextFrequencyExecution("daily", from, "")).not.toThrow();
    expect(getNextFrequencyExecution("daily", from, "").toISOString()).toBe(
      getNextFrequencyExecution("daily", from, "UTC").toISOString()
    );
  });

  it("defaults to UTC when timezone is undefined", () => {
    const next = getNextFrequencyExecution("daily", from);
    expect(next.getUTCHours()).toBe(0);
    expect(next.toISOString()).toBe("2024-01-16T00:00:00.000Z");
  });

  it("still honors a real IANA timezone", () => {
    // Next Berlin midnight after 11:30 (Berlin, UTC+1 in January) on Jan 15
    // is Jan 16 00:00 Berlin = Jan 15 23:00 UTC.
    const next = getNextFrequencyExecution("daily", from, "Europe/Berlin");
    expect(next.toISOString()).toBe("2024-01-15T23:00:00.000Z");
  });
});
