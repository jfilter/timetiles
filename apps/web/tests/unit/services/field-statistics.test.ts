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
import { enrichEnumFields } from "@/lib/services/schema-detection/utilities/geo";

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

describe("field-statistics unique-sample overflow", () => {
  it("flags overflow once the unique-sample cap is exceeded", () => {
    const stats = createFieldStats("name");
    const cap = 5;
    for (let i = 0; i < cap; i++) updateFieldStats(stats, `value-${i}`, cap);
    expect(stats.uniqueSamplesOverflow).toBeUndefined();

    updateFieldStats(stats, "value-overflow", cap);
    expect(stats.uniqueSamplesOverflow).toBe(true);
    // uniqueValues saturates at the cap — it is now only a lower bound
    expect(stats.uniqueValues).toBe(cap);
  });

  it("does not flag overflow for repeats of already-tracked values", () => {
    const stats = createFieldStats("status");
    const cap = 3;
    updateFieldStats(stats, "open", cap);
    updateFieldStats(stats, "closed", cap);
    updateFieldStats(stats, "pending", cap);
    updateFieldStats(stats, "open", cap);

    expect(stats.uniqueSamplesOverflow).toBeUndefined();
    expect(stats.valueCounts?.[JSON.stringify("open")]).toBe(2);
  });

  it("propagates the overflow flag through merges", () => {
    const cap = 3;
    const a = createFieldStats("name");
    for (let i = 0; i < cap + 1; i++) updateFieldStats(a, `a-${i}`, cap);
    const b = createFieldStats("name");
    updateFieldStats(b, "b-0", cap);

    expect(mergeFieldStats(a, b).uniqueSamplesOverflow).toBe(true);
    expect(mergeFieldStats(b, a).uniqueSamplesOverflow).toBe(true);
    expect(mergeFieldStats(b, b).uniqueSamplesOverflow).toBeUndefined();
  });

  it("disqualifies overflowed fields from enum candidacy", () => {
    // A fully-unique high-cardinality column whose uniqueValues saturated at
    // the cap must NOT be classified as an enum (the capped count made
    // 100/10000 rows look like a 1% low-cardinality field).
    const cap = 5;
    const stats = createFieldStats("email");
    for (let i = 0; i < 100; i++) updateFieldStats(stats, `user-${i}@example.com`, cap);

    expect(stats.uniqueSamplesOverflow).toBe(true);

    enrichEnumFields({ email: stats }, { enumThreshold: 10, enumMode: "percentage" });
    expect(stats.isEnumCandidate).toBe(false);
    expect(stats.enumValues).toBeUndefined();
  });

  it("keeps genuine low-cardinality fields as enum candidates", () => {
    const cap = 100;
    const stats = createFieldStats("status");
    for (let i = 0; i < 50; i++) updateFieldStats(stats, i % 2 === 0 ? "open" : "closed", cap);

    enrichEnumFields({ status: stats }, { enumThreshold: 10, enumMode: "percentage" });
    expect(stats.isEnumCandidate).toBe(true);
    expect(stats.enumValues).toHaveLength(2);
    expect(stats.enumValues?.find((e) => e.value === "open")?.count).toBe(25);
  });
});
