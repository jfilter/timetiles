/**
 * Geo/structural pattern detection utility tests.
 *
 * @module
 */

import { describe, expect, it } from "vitest";

import type { FieldStatistics } from "@/lib/services/schema-detection/types";
import { detectEnumFields, detectIdFields, detectPatterns } from "@/lib/services/schema-detection/utilities/geo";

const createFieldStats = (overrides: Partial<FieldStatistics> = {}): FieldStatistics => ({
  path: "test",
  occurrences: 100,
  occurrencePercent: 100,
  nullCount: 0,
  uniqueValues: 100,
  uniqueSamples: [],
  typeDistribution: { string: 100 },
  formats: {},
  isEnumCandidate: false,
  firstSeen: new Date(),
  lastSeen: new Date(),
  depth: 0,
  ...overrides,
});

describe("detectIdFields", () => {
  it("detects field named 'id'", () => {
    const fieldStats: Record<string, FieldStatistics> = {
      id: createFieldStats({ typeDistribution: { number: 100 }, uniqueValues: 100, occurrences: 100 }),
    };

    const result = detectIdFields(fieldStats);

    expect(result).toContain("id");
  });

  it("detects fields with _id suffix", () => {
    const fieldStats: Record<string, FieldStatistics> = {
      user_id: createFieldStats({ typeDistribution: { string: 100 }, uniqueValues: 100, occurrences: 100 }),
      event_id: createFieldStats({ typeDistribution: { string: 100 }, uniqueValues: 100, occurrences: 100 }),
    };

    const result = detectIdFields(fieldStats);

    expect(result).toContain("user_id");
    expect(result).toContain("event_id");
  });

  it("detects uuid/guid fields", () => {
    const fieldStats: Record<string, FieldStatistics> = {
      uuid: createFieldStats({ typeDistribution: { string: 100 }, uniqueValues: 100, occurrences: 100 }),
      guid: createFieldStats({ typeDistribution: { string: 100 }, uniqueValues: 100, occurrences: 100 }),
    };

    const result = detectIdFields(fieldStats);

    expect(result).toContain("uuid");
    expect(result).toContain("guid");
  });

  it("detects fields with unique values as potential IDs", () => {
    const fieldStats: Record<string, FieldStatistics> = {
      record_number: createFieldStats({ typeDistribution: { number: 100 }, uniqueValues: 100, occurrences: 100 }),
    };

    const result = detectIdFields(fieldStats);

    expect(result).toContain("record_number");
  });

  it("does not detect fields with non-unique values", () => {
    const fieldStats: Record<string, FieldStatistics> = {
      category: createFieldStats({ typeDistribution: { string: 100 }, uniqueValues: 5, occurrences: 100 }),
    };

    const result = detectIdFields(fieldStats);

    expect(result).not.toContain("category");
  });
});

describe("detectEnumFields", () => {
  it("detects fields with low cardinality as enums", () => {
    const fieldStats: Record<string, FieldStatistics> = {
      status: createFieldStats({
        typeDistribution: { string: 100 },
        uniqueValues: 5,
        occurrences: 100,
        uniqueSamples: ["active", "inactive", "pending", "completed", "cancelled"],
      }),
    };

    const result = detectEnumFields(fieldStats);

    expect(result).toContain("status");
  });

  it("does not detect fields with high cardinality", () => {
    const fieldStats: Record<string, FieldStatistics> = {
      name: createFieldStats({
        typeDistribution: { string: 100 },
        uniqueValues: 80,
        occurrences: 100,
        uniqueSamples: ["name1", "name2", "name3"],
      }),
    };

    const result = detectEnumFields(fieldStats, { enumThreshold: 50 });

    expect(result).not.toContain("name");
  });

  it("respects custom threshold", () => {
    const fieldStats: Record<string, FieldStatistics> = {
      category: createFieldStats({
        typeDistribution: { string: 100 },
        uniqueValues: 30,
        occurrences: 100,
        uniqueSamples: ["cat1", "cat2", "cat3"],
      }),
    };

    const resultWithDefault = detectEnumFields(fieldStats);
    const resultWithLowThreshold = detectEnumFields(fieldStats, { enumThreshold: 20 });

    expect(resultWithDefault).toContain("category");
    expect(resultWithLowThreshold).not.toContain("category");
  });

  it("uses percentage mode correctly", () => {
    const fieldStats: Record<string, FieldStatistics> = {
      type: createFieldStats({
        typeDistribution: { string: 100 },
        uniqueValues: 3,
        occurrences: 100,
        uniqueSamples: ["A", "B", "C"],
      }),
    };

    const result = detectEnumFields(fieldStats, { enumMode: "percentage", enumThreshold: 5 });

    expect(result).toContain("type");
  });

  it("does not include fields where all values are unique", () => {
    const fieldStats: Record<string, FieldStatistics> = {
      description: createFieldStats({
        typeDistribution: { string: 100 },
        uniqueValues: 100,
        occurrences: 100,
        uniqueSamples: ["desc1", "desc2"],
      }),
    };

    const result = detectEnumFields(fieldStats);

    expect(result).not.toContain("description");
  });
});

describe("detectPatterns", () => {
  it("returns both id and enum fields", () => {
    const fieldStats: Record<string, FieldStatistics> = {
      id: createFieldStats({ typeDistribution: { number: 100 }, uniqueValues: 100, occurrences: 100 }),
      status: createFieldStats({
        typeDistribution: { string: 100 },
        uniqueValues: 3,
        occurrences: 100,
        uniqueSamples: ["active", "inactive", "pending"],
      }),
    };

    const result = detectPatterns(fieldStats);

    expect(result.idFields).toContain("id");
    expect(result.enumFields).toContain("status");
  });

  it("passes config to detectEnumFields", () => {
    const fieldStats: Record<string, FieldStatistics> = {
      category: createFieldStats({
        typeDistribution: { string: 100 },
        uniqueValues: 30,
        occurrences: 100,
        uniqueSamples: ["cat1", "cat2"],
      }),
    };

    const resultDefault = detectPatterns(fieldStats);
    const resultLowThreshold = detectPatterns(fieldStats, { enumThreshold: 10 });

    expect(resultDefault.enumFields).toContain("category");
    expect(resultLowThreshold.enumFields).not.toContain("category");
  });
});
