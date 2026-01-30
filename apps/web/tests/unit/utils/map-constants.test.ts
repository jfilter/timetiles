/**
 * Unit tests for map constants and utilities.
 *
 * @module
 * @category Tests
 */
import { describe, expect, it } from "vitest";

import { DEFAULT_CLUSTER_STATS, ensureAscendingPercentiles } from "@/lib/constants/map";

describe("ensureAscendingPercentiles", () => {
  it("should return defaults when given empty object", () => {
    const result = ensureAscendingPercentiles({});
    expect(result.p20).toBe(DEFAULT_CLUSTER_STATS.p20);
    expect(result.p40).toBeGreaterThan(result.p20);
    expect(result.p60).toBeGreaterThan(result.p40);
    expect(result.p80).toBeGreaterThan(result.p60);
    expect(result.p100).toBeGreaterThan(result.p80);
  });

  it("should ensure strictly ascending when values are equal", () => {
    const result = ensureAscendingPercentiles({ p20: 5, p40: 5, p60: 5, p80: 5, p100: 5 });
    expect(result.p20).toBe(5);
    expect(result.p40).toBe(6);
    expect(result.p60).toBe(7);
    expect(result.p80).toBe(8);
    expect(result.p100).toBe(9);
  });

  it("should preserve already ascending values", () => {
    const result = ensureAscendingPercentiles({ p20: 2, p40: 10, p60: 20, p80: 50, p100: 100 });
    expect(result).toEqual({ p20: 2, p40: 10, p60: 20, p80: 50, p100: 100 });
  });
});
