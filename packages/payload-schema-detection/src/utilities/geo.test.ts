/**
 * Geo/structural pattern detection utility tests.
 *
 * @module
 */

import { describe, expect, it } from "vitest";

import type { FieldStatistics } from "../types";
import { detectEnumFields, detectIdFields, detectPatterns, looksLikeCoordinate, looksLikeId } from "./geo";

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
      id: createFieldStats({
        typeDistribution: { number: 100 },
        uniqueValues: 100,
        occurrences: 100,
      }),
    };

    const result = detectIdFields(fieldStats);

    expect(result).toContain("id");
  });

  it("detects fields with _id suffix", () => {
    const fieldStats: Record<string, FieldStatistics> = {
      user_id: createFieldStats({
        typeDistribution: { string: 100 },
        uniqueValues: 100,
        occurrences: 100,
      }),
      event_id: createFieldStats({
        typeDistribution: { string: 100 },
        uniqueValues: 100,
        occurrences: 100,
      }),
    };

    const result = detectIdFields(fieldStats);

    expect(result).toContain("user_id");
    expect(result).toContain("event_id");
  });

  it("detects uuid/guid fields", () => {
    const fieldStats: Record<string, FieldStatistics> = {
      uuid: createFieldStats({
        typeDistribution: { string: 100 },
        uniqueValues: 100,
        occurrences: 100,
      }),
      guid: createFieldStats({
        typeDistribution: { string: 100 },
        uniqueValues: 100,
        occurrences: 100,
      }),
    };

    const result = detectIdFields(fieldStats);

    expect(result).toContain("uuid");
    expect(result).toContain("guid");
  });

  it("detects fields with unique values as potential IDs", () => {
    const fieldStats: Record<string, FieldStatistics> = {
      record_number: createFieldStats({
        typeDistribution: { number: 100 },
        uniqueValues: 100,
        occurrences: 100,
      }),
    };

    const result = detectIdFields(fieldStats);

    expect(result).toContain("record_number");
  });

  it("does not detect fields with non-unique values", () => {
    const fieldStats: Record<string, FieldStatistics> = {
      category: createFieldStats({
        typeDistribution: { string: 100 },
        uniqueValues: 5,
        occurrences: 100,
      }),
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
      id: createFieldStats({
        typeDistribution: { number: 100 },
        uniqueValues: 100,
        occurrences: 100,
      }),
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

describe("looksLikeId", () => {
  it("identifies UUIDs", () => {
    expect(looksLikeId("550e8400-e29b-41d4-a716-446655440000")).toBe(true);
    expect(looksLikeId("123e4567-e89b-12d3-a456-426614174000")).toBe(true);
  });

  it("identifies MongoDB ObjectIds", () => {
    expect(looksLikeId("507f1f77bcf86cd799439011")).toBe(true);
    expect(looksLikeId("5f8d0d55b54764421b7156c3")).toBe(true);
  });

  it("identifies alphanumeric IDs", () => {
    expect(looksLikeId("abc12345")).toBe(true);
    expect(looksLikeId("ID123456789")).toBe(true);
  });

  it("identifies large numeric IDs", () => {
    expect(looksLikeId(1234567890)).toBe(true);
    expect(looksLikeId(9999999)).toBe(true);
  });

  it("rejects small numbers", () => {
    expect(looksLikeId(42)).toBe(false);
    expect(looksLikeId(1000)).toBe(false);
  });

  it("rejects short strings", () => {
    expect(looksLikeId("abc")).toBe(false);
    expect(looksLikeId("id123")).toBe(false);
  });

  it("rejects non-alphanumeric strings", () => {
    expect(looksLikeId("hello world")).toBe(false);
    expect(looksLikeId("name-with-dashes")).toBe(false);
  });
});

describe("looksLikeCoordinate", () => {
  describe("latitude", () => {
    it("accepts valid latitudes", () => {
      expect(looksLikeCoordinate(0, "lat")).toBe(true);
      expect(looksLikeCoordinate(45.5, "lat")).toBe(true);
      expect(looksLikeCoordinate(-90, "lat")).toBe(true);
      expect(looksLikeCoordinate(90, "lat")).toBe(true);
    });

    it("rejects invalid latitudes", () => {
      expect(looksLikeCoordinate(91, "lat")).toBe(false);
      expect(looksLikeCoordinate(-91, "lat")).toBe(false);
      expect(looksLikeCoordinate(180, "lat")).toBe(false);
    });
  });

  describe("longitude", () => {
    it("accepts valid longitudes", () => {
      expect(looksLikeCoordinate(0, "lng")).toBe(true);
      expect(looksLikeCoordinate(100, "lng")).toBe(true);
      expect(looksLikeCoordinate(-180, "lng")).toBe(true);
      expect(looksLikeCoordinate(180, "lng")).toBe(true);
    });

    it("rejects invalid longitudes", () => {
      expect(looksLikeCoordinate(181, "lng")).toBe(false);
      expect(looksLikeCoordinate(-181, "lng")).toBe(false);
    });
  });

  it("rejects non-number values", () => {
    expect(looksLikeCoordinate("45.5", "lat")).toBe(false);
    expect(looksLikeCoordinate(null, "lat")).toBe(false);
    expect(looksLikeCoordinate(undefined, "lng")).toBe(false);
  });
});
