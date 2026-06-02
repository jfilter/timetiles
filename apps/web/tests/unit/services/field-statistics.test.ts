/**
 * Unit tests for numeric field-statistics averaging.
 *
 * Regression for the running mean dividing by `stats.occurrences` (bumped for
 * every value, including nulls/non-numeric strings) instead of the count of
 * numeric values. The mean must reflect only the numeric values, both for a
 * single pass and when merging batches.
 *
 * @module
 * @category Unit Tests
 */
import { describe, expect, it } from "vitest";

import { createFieldStats, mergeFieldStats, updateFieldStats } from "@/lib/services/schema-builder/field-statistics";

describe("field-statistics numeric averaging", () => {
  it("averages only numeric values, ignoring interleaved nulls and strings", () => {
    const stats = createFieldStats("value");
    updateFieldStats(stats, 10, 100);
    updateFieldStats(stats, null, 100);
    updateFieldStats(stats, "not-a-number", 100);
    updateFieldStats(stats, 20, 100);

    // Mean of [10, 20] = 15. The old bug divided by total occurrences (4),
    // yielding 12.5.
    expect(stats.numericStats?.avg).toBe(15);
    expect(stats.numericStats?.count).toBe(2);
    expect(stats.numericStats?.min).toBe(10);
    expect(stats.numericStats?.max).toBe(20);
    expect(stats.occurrences).toBe(4);
  });

  it("computes a count-weighted mean when merging batches", () => {
    // Batch A: three numeric values [10, 20, 30] plus a null -> avg 20, count 3.
    const a = createFieldStats("value");
    updateFieldStats(a, 10, 100);
    updateFieldStats(a, 20, 100);
    updateFieldStats(a, 30, 100);
    updateFieldStats(a, null, 100);

    // Batch B: one numeric value [100] -> avg 100, count 1.
    const b = createFieldStats("value");
    updateFieldStats(b, 100, 100);

    const merged = mergeFieldStats(a, b);

    // (10+20+30+100) / 4 numeric values = 40. Weighting by total occurrences
    // (5 vs 1) would have produced a different, wrong value.
    expect(merged.numericStats?.avg).toBe(40);
    expect(merged.numericStats?.count).toBe(4);
    expect(merged.numericStats?.min).toBe(10);
    expect(merged.numericStats?.max).toBe(100);
  });
});

describe("field-statistics formats.numeric — locale-aware", () => {
  it("counts EU-style numeric strings toward formats.numeric", () => {
    const stats = createFieldStats("price");
    updateFieldStats(stats, "1.234,56", 100); // EU: thousands "." + decimal ","
    updateFieldStats(stats, "9,99", 100); // EU decimal ","
    updateFieldStats(stats, "1234.56", 100); // US decimal "."
    updateFieldStats(stats, "42", 100); // plain

    // All four are numeric under the locale-aware classifier (the old US-only
    // regex would have missed the two EU strings).
    expect(stats.formats.numeric).toBe(4);
  });

  it("does not count non-numeric strings toward formats.numeric", () => {
    const stats = createFieldStats("label");
    updateFieldStats(stats, "alpha", 100);
    updateFieldStats(stats, "not-a-number", 100);

    expect(stats.formats.numeric).toBeUndefined();
  });
});
