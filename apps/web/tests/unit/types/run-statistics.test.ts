import { describe, expect, it } from "vitest";

import {
  recordScheduledIngestFailure,
  recordScheduledIngestSuccess,
  recordScraperRun,
  resolveScheduledIngestStats,
  resolveScraperStats,
} from "@/lib/types/run-statistics";

describe("resolveScheduledIngestStats", () => {
  it("returns defaults for null", () => {
    expect(resolveScheduledIngestStats(null)).toEqual({
      totalRuns: 0,
      successfulRuns: 0,
      failedRuns: 0,
      averageDuration: 0,
    });
  });

  it("returns defaults for undefined", () => {
    expect(resolveScheduledIngestStats(undefined)).toEqual({
      totalRuns: 0,
      successfulRuns: 0,
      failedRuns: 0,
      averageDuration: 0,
    });
  });

  it("coerces null fields to 0", () => {
    const result = resolveScheduledIngestStats({
      totalRuns: null,
      successfulRuns: 5,
      failedRuns: null,
      averageDuration: 1.5,
    });
    expect(result).toEqual({ totalRuns: 0, successfulRuns: 5, failedRuns: 0, averageDuration: 1.5 });
  });

  it("passes through valid values", () => {
    const input = { totalRuns: 10, successfulRuns: 8, failedRuns: 2, averageDuration: 3.5 };
    expect(resolveScheduledIngestStats(input)).toEqual(input);
  });
});

describe("recordScheduledIngestSuccess", () => {
  it("increments totalRuns and successfulRuns, computes rolling average", () => {
    const current = { totalRuns: 5, successfulRuns: 4, failedRuns: 1, averageDuration: 2.0 };
    const result = recordScheduledIngestSuccess(current, 4000); // 4s
    expect(result.totalRuns).toBe(6);
    expect(result.successfulRuns).toBe(5);
    expect(result.failedRuns).toBe(1);
    expect(result.averageDuration).toBeCloseTo(2.4); // (2*4 + 4) / 5 = 2.4
  });

  it("handles first run", () => {
    const current = { totalRuns: 0, successfulRuns: 0, failedRuns: 0, averageDuration: 0 };
    const result = recordScheduledIngestSuccess(current, 3000);
    expect(result.totalRuns).toBe(1);
    expect(result.successfulRuns).toBe(1);
    expect(result.averageDuration).toBe(3);
  });

  it("does not mutate the input", () => {
    const current = { totalRuns: 1, successfulRuns: 1, failedRuns: 0, averageDuration: 1 };
    recordScheduledIngestSuccess(current, 2000);
    expect(current.totalRuns).toBe(1);
  });
});

describe("recordScheduledIngestFailure", () => {
  it("increments both totalRuns and failedRuns", () => {
    const current = { totalRuns: 5, successfulRuns: 4, failedRuns: 1, averageDuration: 2.0 };
    const result = recordScheduledIngestFailure(current);
    expect(result.totalRuns).toBe(6);
    expect(result.failedRuns).toBe(2);
    expect(result.successfulRuns).toBe(4);
    expect(result.averageDuration).toBe(2.0);
  });
});

describe("resolveScraperStats", () => {
  it("returns defaults for null", () => {
    expect(resolveScraperStats(null)).toEqual({ totalRuns: 0, successRuns: 0, failedRuns: 0 });
  });

  it("returns defaults for non-object values", () => {
    expect(resolveScraperStats("not an object")).toEqual({ totalRuns: 0, successRuns: 0, failedRuns: 0 });
    expect(resolveScraperStats(42)).toEqual({ totalRuns: 0, successRuns: 0, failedRuns: 0 });
    expect(resolveScraperStats([1, 2])).toEqual({ totalRuns: 0, successRuns: 0, failedRuns: 0 });
  });

  it("extracts valid fields from object", () => {
    const result = resolveScraperStats({ totalRuns: 10, successRuns: 7, failedRuns: 3 });
    expect(result).toEqual({ totalRuns: 10, successRuns: 7, failedRuns: 3 });
  });

  it("defaults non-numeric fields to 0", () => {
    const result = resolveScraperStats({ totalRuns: "bad", successRuns: null, failedRuns: 1 });
    expect(result).toEqual({ totalRuns: 0, successRuns: 0, failedRuns: 1 });
  });
});

describe("recordScraperRun", () => {
  it("increments successRuns on success", () => {
    const current = { totalRuns: 3, successRuns: 2, failedRuns: 1 };
    const result = recordScraperRun(current, "success");
    expect(result).toEqual({ totalRuns: 4, successRuns: 3, failedRuns: 1 });
  });

  it("increments failedRuns on failure", () => {
    const current = { totalRuns: 3, successRuns: 2, failedRuns: 1 };
    const result = recordScraperRun(current, "failed");
    expect(result).toEqual({ totalRuns: 4, successRuns: 2, failedRuns: 2 });
  });

  it("treats timeout as failure", () => {
    const current = { totalRuns: 0, successRuns: 0, failedRuns: 0 };
    const result = recordScraperRun(current, "timeout");
    expect(result).toEqual({ totalRuns: 1, successRuns: 0, failedRuns: 1 });
  });
});
