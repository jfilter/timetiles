/**
 * Unit tests for JSON-to-CSV conversion utilities.
 *
 * Tests convertJsonToCsv, recordsToCsv, and flattenObject for correct
 * handling of top-level arrays, nested paths, auto-detection, flattening,
 * and error cases.
 *
 * @module
 * @category Tests
 */

// 1. Centralized logger mock (before source code)
import "@/tests/mocks/services/logger";

// 2. Vitest imports and source code
import { describe, expect, it } from "vitest";

import { convertJsonToCsv, extractRecordsFromJson, flattenObject, recordsToCsv } from "@/lib/ingest/json-to-csv";

/** Helper to create a JSON Buffer from a value. */
const toBuffer = (value: unknown): Buffer => Buffer.from(JSON.stringify(value), "utf-8");

/** Helper to parse the CSV string out of a Buffer result. */
const csvString = (buf: Buffer): string => buf.toString("utf-8");

describe("convertJsonToCsv", () => {
  describe("Record Detection", () => {
    it("should convert a top-level array to CSV with headers", () => {
      const json = [
        { name: "A", value: 1 },
        { name: "B", value: 2 },
      ];

      const result = convertJsonToCsv(toBuffer(json));

      expect(result.recordCount).toBe(2);
      expect(result.detectedPath).toBe("");
      const csv = csvString(result.csv);
      expect(csv).toContain("name");
      expect(csv).toContain("value");
      expect(csv).toContain("A");
      expect(csv).toContain("B");
    });

    it("should extract records using an explicit recordsPath", () => {
      const json = { data: { results: [{ name: "A" }] } };

      const result = convertJsonToCsv(toBuffer(json), { recordsPath: "data.results" });

      expect(result.recordCount).toBe(1);
      expect(result.detectedPath).toBe("data.results");
      const csv = csvString(result.csv);
      expect(csv).toContain("name");
      expect(csv).toContain("A");
    });

    it("should auto-detect a nested array when no recordsPath is given", () => {
      const json = { meta: { total: 2 }, items: [{ name: "A" }, { name: "B" }] };

      const result = convertJsonToCsv(toBuffer(json));

      expect(result.recordCount).toBe(2);
      expect(result.detectedPath).toBe("items");
      const csv = csvString(result.csv);
      expect(csv).toContain("A");
      expect(csv).toContain("B");
    });
  });

  describe("Flattening and Serialization", () => {
    it("should flatten nested objects into dot-separated columns", () => {
      const json = [{ user: { name: "John", age: 30 }, city: "NYC" }];

      const result = convertJsonToCsv(toBuffer(json));

      const csv = csvString(result.csv);
      expect(csv).toContain("user.name");
      expect(csv).toContain("user.age");
      expect(csv).toContain("city");
      expect(csv).toContain("John");
      expect(csv).toContain("30");
      expect(csv).toContain("NYC");
    });

    it("should serialize arrays as JSON strings", () => {
      const json = [{ tags: ["a", "b"], name: "X" }];

      const result = convertJsonToCsv(toBuffer(json));

      const csv = csvString(result.csv);
      expect(csv).toContain("tags");
      expect(csv).toContain("name");
      // Papa Parse escapes inner quotes by doubling them in CSV output
      expect(csv).toContain('[""a"",""b""]');
      expect(csv).toContain("X");
    });
  });

  describe("Edge Cases", () => {
    it("should handle an empty array at recordsPath", () => {
      const json = { data: [] };

      const result = convertJsonToCsv(toBuffer(json), { recordsPath: "data" });

      expect(result.recordCount).toBe(0);
      expect(result.detectedPath).toBe("data");
      // Empty records produce an empty CSV (no headers, no rows)
      const csv = csvString(result.csv);
      expect(csv).toBe("");
    });
  });

  describe("Error Handling", () => {
    it("should throw when no array can be found and no recordsPath is given", () => {
      const json = { status: "ok" };

      expect(() => convertJsonToCsv(toBuffer(json))).toThrow("Could not find records array");
    });

    it("should throw when recordsPath does not resolve to an array", () => {
      const json = { data: { items: [] } };

      expect(() => convertJsonToCsv(toBuffer(json), { recordsPath: "data.results" })).toThrow(
        'recordsPath "data.results" did not resolve to an array'
      );
    });

    it("should throw when top-level array contains primitives", () => {
      const json = [1, 2, 3];

      expect(() => convertJsonToCsv(toBuffer(json))).toThrow("Could not find records array");
    });

    it("should throw when top-level array is empty", () => {
      const json: unknown[] = [];

      expect(() => convertJsonToCsv(toBuffer(json))).toThrow("Could not find records array");
    });
  });
});

describe("recordsToCsv", () => {
  it("should convert an array of records directly to a CSV buffer", () => {
    const records = [
      { id: 1, title: "Event A" },
      { id: 2, title: "Event B" },
    ];

    const result = recordsToCsv(records);

    expect(Buffer.isBuffer(result)).toBe(true);
    const csv = result.toString("utf-8");
    expect(csv).toContain("id");
    expect(csv).toContain("title");
    expect(csv).toContain("Event A");
    expect(csv).toContain("Event B");
  });
});

describe("flattenObject", () => {
  it("should flatten nested objects with dot-separated keys", () => {
    const result = flattenObject({ user: { name: "John", age: 30 }, city: "NYC" });

    expect(result).toEqual({ "user.name": "John", "user.age": 30, city: "NYC" });
  });

  it("should serialize arrays as JSON strings", () => {
    const result = flattenObject({ tags: ["a", "b"], name: "X" });

    expect(result).toEqual({ tags: '["a","b"]', name: "X" });
  });

  it("should handle deeply nested objects", () => {
    const result = flattenObject({ a: { b: { c: "deep" } } });

    expect(result).toEqual({ "a.b.c": "deep" });
  });

  it("should handle null and primitive values", () => {
    const result = flattenObject({ a: null, b: 42, c: true, d: "str" });

    expect(result).toEqual({ a: null, b: 42, c: true, d: "str" });
  });
});

describe("extractRecordsFromJson", () => {
  it("should return records and detected path for nested array", () => {
    const json = { meta: { total: 1 }, items: [{ id: 1, name: "A" }] };

    const result = extractRecordsFromJson(json);

    expect(result.records).toEqual([{ id: 1, name: "A" }]);
    expect(result.detectedPath).toBe("items");
  });

  it("should return empty path for top-level array", () => {
    const json = [{ id: 1 }, { id: 2 }];

    const result = extractRecordsFromJson(json);

    expect(result.records).toEqual([{ id: 1 }, { id: 2 }]);
    expect(result.detectedPath).toBe("");
  });
});
