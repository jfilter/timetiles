/**
 * Import timeline duration rounding and invalid input handling.
 * @module
 * @category Tests
 */
import { describe, expect, it } from "vitest";

import { formatStageDuration, formatTimeRemaining } from "@/lib/ingest/processing-time";

describe("processing time", () => {
  const start = "2024-01-01T00:00:00.000Z";

  it.each([
    [0, "0ms"],
    [500, "500ms"],
    [1500, "1.5s"],
    [59900, "59.9s"],
    [59999, "1m 0s"],
    [60000, "1m 0s"],
    [119600, "2m 0s"],
    [125000, "2m 5s"],
  ] as const)("formats elapsed %s milliseconds", (ms, expected) => {
    expect(formatStageDuration(start, new Date(Date.parse(start) + ms).toISOString())).toBe(expected);
  });

  it.each([null, "", "invalid", "2023-12-31T23:59:59.000Z"])("omits invalid completion %s", (end) => {
    expect(formatStageDuration(start, end)).toBeNull();
  });

  it.each([null, "", "invalid"])("omits invalid start %s", (value) => {
    expect(formatStageDuration(value, start)).toBeNull();
  });

  it.each([
    [30, "~30s"],
    [59.6, "~1m 0s"],
    [60, "~1m 0s"],
    [119.6, "~2m 0s"],
    [125, "~2m 5s"],
  ] as const)("formats remaining %s seconds", (seconds, expected) => {
    expect(formatTimeRemaining(seconds)).toBe(expected);
  });

  it.each([null, 0, -1, Number.NaN, Number.POSITIVE_INFINITY])("omits invalid estimate %s", (seconds) => {
    expect(formatTimeRemaining(seconds)).toBeNull();
  });
});
