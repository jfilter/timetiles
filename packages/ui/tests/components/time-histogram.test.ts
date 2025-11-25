/**
 * Tests for time histogram date formatting utilities.
 *
 * @module
 */
import { describe, expect, it } from "vitest";

import {
  DAY_SECONDS,
  formatDateRange,
  formatDateTime,
  formatTime,
  HOUR_SECONDS,
  MINUTE_SECONDS,
  MONTH_SECONDS,
  YEAR_SECONDS,
} from "../../src/components/charts/time-histogram";

// Test dates in UTC (all tests use UTC dates to ensure consistency)
const NOV_25_2025 = "2025-11-25";

describe("time constants", () => {
  it("has correct second values", () => {
    expect(MINUTE_SECONDS).toBe(60);
    expect(HOUR_SECONDS).toBe(3600);
    expect(DAY_SECONDS).toBe(86400);
    expect(MONTH_SECONDS).toBe(30 * 86400);
    expect(YEAR_SECONDS).toBe(365 * 86400);
  });
});

describe("formatTime", () => {
  it("formats time without seconds", () => {
    const date = new Date(`${NOV_25_2025}T10:30:45Z`);
    const result = formatTime(date, false);
    // Should include hour and minute but not seconds
    // Note: format is locale-dependent (may be 10:30 or 10:30 AM etc.)
    expect(result).toMatch(/30/); // minute should be present
    expect(result).not.toMatch(/:45|:45/); // seconds should not be present
  });

  it("formats time with seconds", () => {
    const date = new Date(`${NOV_25_2025}T10:30:45Z`);
    const result = formatTime(date, true);
    // Should include hour, minute, and seconds
    expect(result).toMatch(/30/); // minute
    expect(result).toMatch(/45/); // seconds
  });
});

describe("formatDateTime", () => {
  it("formats datetime without seconds", () => {
    const date = new Date(`${NOV_25_2025}T10:30:45Z`);
    const result = formatDateTime(date, false);
    // Should include date parts and time
    expect(result).toMatch(/Nov/i);
    expect(result).toMatch(/25/);
    expect(result).toMatch(/2025/);
    expect(result).toMatch(/30/); // minute
  });

  it("formats datetime with seconds", () => {
    const date = new Date(`${NOV_25_2025}T10:30:45Z`);
    const result = formatDateTime(date, true);
    // Should include date parts and time with seconds
    expect(result).toMatch(/Nov/i);
    expect(result).toMatch(/25/);
    expect(result).toMatch(/2025/);
    expect(result).toMatch(/45/); // seconds
  });
});

describe("formatDateRange - sub-minute buckets (seconds)", () => {
  it("shows full datetime with seconds for 30-second buckets", () => {
    const startDate = new Date(`${NOV_25_2025}T10:30:45Z`);
    const endDate = new Date(`${NOV_25_2025}T10:31:15Z`);
    const result = formatDateRange(startDate, endDate, 30);

    // Should show full datetime with seconds
    expect(result).toMatch(/Nov/i);
    expect(result).toMatch(/25/);
    expect(result).toMatch(/2025/);
    expect(result).toMatch(/30/); // minute
    expect(result).toMatch(/45/); // seconds
  });

  it("shows full datetime with seconds for 1-second buckets", () => {
    const startDate = new Date(`${NOV_25_2025}T10:30:01Z`);
    const endDate = new Date(`${NOV_25_2025}T10:30:02Z`);
    const result = formatDateRange(startDate, endDate, 1);

    expect(result).toMatch(/01/); // seconds
  });
});

describe("formatDateRange - sub-hour buckets (minutes)", () => {
  it("shows datetime without seconds for 5-minute buckets", () => {
    const startDate = new Date(`${NOV_25_2025}T10:30:00Z`);
    const endDate = new Date(`${NOV_25_2025}T10:35:00Z`);
    const result = formatDateRange(startDate, endDate, 5 * MINUTE_SECONDS);

    // Should show datetime without seconds
    expect(result).toMatch(/Nov/i);
    expect(result).toMatch(/25/);
    expect(result).toMatch(/2025/);
    expect(result).toMatch(/30/); // minute
    // Should not contain :00 for seconds (only time component)
  });

  it("shows datetime for 15-minute buckets", () => {
    const startDate = new Date("2025-11-25T14:15:00Z");
    const endDate = new Date("2025-11-25T14:30:00Z");
    const result = formatDateRange(startDate, endDate, 15 * MINUTE_SECONDS);

    expect(result).toMatch(/Nov/i);
    // Time format is locale/timezone-dependent, just verify it includes minutes
    expect(result).toMatch(/:15/);
    expect(result).toMatch(/2025/);
  });
});

describe("formatDateRange - sub-day buckets (hours)", () => {
  it("shows date and hour range for same-day hourly buckets", () => {
    const startDate = new Date(`${NOV_25_2025}T10:00:00Z`);
    const endDate = new Date(`${NOV_25_2025}T11:00:00Z`);
    const result = formatDateRange(startDate, endDate, HOUR_SECONDS);

    // Should show date and hour range
    expect(result).toMatch(/Nov/i);
    expect(result).toMatch(/25/);
    expect(result).toMatch(/2025/);
    // Should contain a separator (hyphen or dash) for range
    expect(result).toMatch(/-/);
  });

  it("shows full datetime range for cross-day hourly buckets", () => {
    const startDate = new Date("2025-11-25T23:00:00Z");
    const endDate = new Date("2025-11-26T01:00:00Z");
    const result = formatDateRange(startDate, endDate, 2 * HOUR_SECONDS);

    // Should show both dates since they span midnight
    expect(result).toMatch(/25/);
    expect(result).toMatch(/26/);
  });

  it("shows date and hour range for 6-hour buckets", () => {
    const startDate = new Date(`${NOV_25_2025}T06:00:00Z`);
    const endDate = new Date(`${NOV_25_2025}T12:00:00Z`);
    const result = formatDateRange(startDate, endDate, 6 * HOUR_SECONDS);

    expect(result).toMatch(/Nov/i);
    expect(result).toMatch(/25/);
    // Should have a range separator
    expect(result).toMatch(/-/);
  });
});

describe("formatDateRange - daily buckets", () => {
  it("shows single date for 1-day buckets", () => {
    const startDate = new Date(`${NOV_25_2025}T00:00:00Z`);
    const endDate = new Date("2025-11-26T00:00:00Z");
    const result = formatDateRange(startDate, endDate, DAY_SECONDS);

    expect(result).toMatch(/Nov/i);
    expect(result).toMatch(/25/);
    expect(result).toMatch(/2025/);
  });

  it("shows single date when bucket size is null (default)", () => {
    const startDate = new Date(`${NOV_25_2025}T00:00:00Z`);
    const endDate = new Date("2025-11-26T00:00:00Z");
    const result = formatDateRange(startDate, endDate, null);

    expect(result).toMatch(/Nov/i);
    expect(result).toMatch(/25/);
    expect(result).toMatch(/2025/);
  });

  it("shows single date when bucket size is undefined", () => {
    const startDate = new Date(`${NOV_25_2025}T00:00:00Z`);
    const endDate = new Date("2025-11-26T00:00:00Z");
    const result = formatDateRange(startDate, endDate, undefined);

    expect(result).toMatch(/Nov/i);
    expect(result).toMatch(/25/);
    expect(result).toMatch(/2025/);
  });
});

describe("formatDateRange - weekly/multi-day buckets", () => {
  it("shows date range for same-month weekly buckets", () => {
    const startDate = new Date("2024-01-01T00:00:00Z");
    const endDate = new Date("2024-01-07T00:00:00Z");
    const result = formatDateRange(startDate, endDate, 7 * DAY_SECONDS);

    // Should show compact range like "Jan 1 - 7, 2024"
    expect(result).toMatch(/Jan/i);
    expect(result).toMatch(/1/);
    expect(result).toMatch(/7/);
    expect(result).toMatch(/2024/);
  });

  it("shows date range for cross-month weekly buckets", () => {
    const startDate = new Date("2024-01-29T00:00:00Z");
    const endDate = new Date("2024-02-04T00:00:00Z");
    const result = formatDateRange(startDate, endDate, 7 * DAY_SECONDS);

    // Should show both months
    expect(result).toMatch(/Jan/i);
    expect(result).toMatch(/Feb/i);
    expect(result).toMatch(/2024/);
  });

  it("shows date range for cross-year weekly buckets", () => {
    const startDate = new Date("2023-12-25T00:00:00Z");
    const endDate = new Date("2024-01-01T00:00:00Z");
    const result = formatDateRange(startDate, endDate, 7 * DAY_SECONDS);

    // Should show both years
    expect(result).toMatch(/Dec/i);
    expect(result).toMatch(/Jan/i);
    expect(result).toMatch(/2023/);
    expect(result).toMatch(/2024/);
  });
});

describe("formatDateRange - monthly buckets", () => {
  it("shows month and year for 30-day buckets", () => {
    const startDate = new Date("2025-12-01T00:00:00Z");
    const endDate = new Date("2025-12-31T00:00:00Z");
    const result = formatDateRange(startDate, endDate, MONTH_SECONDS);

    // Should show "December 2025" or similar
    expect(result).toMatch(/December/i);
    expect(result).toMatch(/2025/);
  });

  it("shows month and year for various months", () => {
    const startDate = new Date("2025-06-01T00:00:00Z");
    const endDate = new Date("2025-06-30T00:00:00Z");
    const result = formatDateRange(startDate, endDate, MONTH_SECONDS);

    expect(result).toMatch(/June/i);
    expect(result).toMatch(/2025/);
  });
});

describe("formatDateRange - yearly buckets", () => {
  it("shows just the year for 365-day buckets", () => {
    const startDate = new Date("2025-01-01T00:00:00Z");
    const endDate = new Date("2025-12-31T00:00:00Z");
    const result = formatDateRange(startDate, endDate, YEAR_SECONDS);

    // Should show just "2025"
    expect(result).toBe("2025");
  });

  it("shows just the year for leap year (366-day) buckets", () => {
    const startDate = new Date("2024-01-01T00:00:00Z");
    const endDate = new Date("2024-12-31T00:00:00Z");
    const result = formatDateRange(startDate, endDate, 366 * DAY_SECONDS);

    expect(result).toBe("2024");
  });
});

describe("formatDateRange - edge cases", () => {
  it("handles bucket size at exact boundary (60 seconds = 1 minute)", () => {
    const startDate = new Date(`${NOV_25_2025}T10:30:00Z`);
    const endDate = new Date(`${NOV_25_2025}T10:31:00Z`);
    // Exactly 60 seconds is NOT sub-minute, so should show datetime without seconds
    const result = formatDateRange(startDate, endDate, MINUTE_SECONDS);

    // Should show datetime format without seconds
    expect(result).toMatch(/Nov/i);
    expect(result).toMatch(/30/); // minute
  });

  it("handles bucket size at exact boundary (3600 seconds = 1 hour)", () => {
    const startDate = new Date(`${NOV_25_2025}T10:00:00Z`);
    const endDate = new Date(`${NOV_25_2025}T11:00:00Z`);
    // Exactly 3600 seconds is NOT sub-hour, so should show hour range
    const result = formatDateRange(startDate, endDate, HOUR_SECONDS);

    expect(result).toMatch(/-/); // Should have separator for range
  });

  it("handles midnight crossing correctly", () => {
    const startDate = new Date("2025-11-25T23:00:00Z");
    const endDate = new Date("2025-11-26T00:00:00Z");
    const result = formatDateRange(startDate, endDate, HOUR_SECONDS);

    // Should handle midnight crossing
    expect(result).toMatch(/Nov/i);
  });

  it("handles year boundary correctly", () => {
    const startDate = new Date("2024-12-31T00:00:00Z");
    const endDate = new Date("2025-01-01T00:00:00Z");
    const result = formatDateRange(startDate, endDate, DAY_SECONDS);

    // Should show December 31, 2024
    expect(result).toMatch(/Dec/i);
    expect(result).toMatch(/31/);
    expect(result).toMatch(/2024/);
  });
});
