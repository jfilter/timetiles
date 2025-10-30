/**
 * Unit tests for data validation and normalization utilities.
 *
 * Tests validation, date parsing, string extraction, and tag parsing.
 *
 * @module
 * @category Tests
 */
import { beforeEach, describe, expect, it } from "vitest";

import {
  hasValidProperty,
  parseDate,
  parseTagsFromRow,
  safeStringValue,
  validateRequiredFields,
} from "../../../../lib/jobs/utils/data-validation";
import { createJobLogger } from "../../../../lib/logger";

describe("Data Validation Utilities", () => {
  let mockLogger: ReturnType<typeof createJobLogger>;

  beforeEach(() => {
    mockLogger = createJobLogger("test-job", "test-123");
  });

  describe("validateRequiredFields", () => {
    it("should validate data with valid structure", () => {
      const data = [
        { name: "Alice", age: 30, city: "NYC" },
        { name: "Bob", age: 25, city: "SF" },
      ];

      const result = validateRequiredFields(data, mockLogger);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("should reject empty data array", () => {
      const data: Record<string, unknown>[] = [];

      const result = validateRequiredFields(data, mockLogger);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain("No data rows found in file");
    });

    it("should reject all empty rows", () => {
      const data = [
        { name: "", age: null, city: "" },
        { name: null, age: null, city: null },
        { name: "", age: "", city: "" },
      ];

      const result = validateRequiredFields(data, mockLogger);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain("All data rows appear to be empty");
    });

    it("should accept data with at least one non-empty value", () => {
      const data = [
        { name: "", age: null, city: "" },
        { name: "Alice", age: null, city: "" },
      ];

      const result = validateRequiredFields(data, mockLogger);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("should reject data with no column headers", () => {
      const data = [{}];

      const result = validateRequiredFields(data, mockLogger);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain("No column headers detected");
    });

    it("should detect inconsistent column structure", () => {
      const data = [
        { name: "Alice", age: 30, city: "NYC", country: "USA" },
        { name: "Bob", age: 25 }, // Missing 2 of 4 columns (50%)
        { name: "Charlie" }, // Missing 3 of 4 columns (75%)
        { title: "Different" }, // Completely different structure
        { random: "Data" }, // Completely different structure
        { other: "Values" }, // Completely different structure
        { more: "Data" }, // Completely different structure
        { even: "More" }, // Completely different structure
        { test: "Data" }, // Completely different structure
        { final: "Row" }, // Completely different structure
        { extra: "Content" }, // Completely different structure
        { last: "One" }, // Completely different structure (12 of 13 rows = 92% > 10%)
      ];

      const result = validateRequiredFields(data, mockLogger);
      expect(result.isValid).toBe(false);
      expect(result.errors.some((err) => err.includes("inconsistent column structure"))).toBe(true);
    });

    it("should allow minor inconsistencies (< 10% rows)", () => {
      const data = [
        { name: "Alice", age: 30, city: "NYC" },
        { name: "Bob", age: 25, city: "SF" },
        { name: "Charlie", age: 35, city: "LA" },
        { name: "Dave", age: 40, city: "Seattle" },
        { name: "Eve", age: 28, city: "Boston" },
        { name: "Frank", age: 32, city: "Chicago" },
        { name: "Grace", age: 29, city: "Austin" },
        { name: "Henry", age: 31, city: "Denver" },
        { name: "Ivy", age: 27, city: "Portland" },
        { name: "Jack", age: 33, city: "Miami" },
        { different: "structure" }, // Only 1 of 11 rows (9% < 10%)
      ];

      const result = validateRequiredFields(data, mockLogger);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("should handle rows with at least 50% of columns present", () => {
      const data = [
        { name: "Alice", age: 30, city: "NYC", country: "USA" },
        { name: "Bob", age: 25, city: "SF" }, // 3 of 4 columns (75% > 50%)
        { name: "Charlie", age: 35 }, // 2 of 4 columns (50% = 50%)
      ];

      const result = validateRequiredFields(data, mockLogger);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe("parseDate", () => {
    it("should parse Date object", () => {
      const date = new Date("2024-03-15T10:30:00.000Z");
      const result = parseDate(date);
      expect(result).toBe("2024-03-15T10:30:00.000Z");
    });

    it("should parse timestamp number", () => {
      const timestamp = new Date("2024-03-15T10:30:00.000Z").getTime();
      const result = parseDate(timestamp);
      expect(result).toBe("2024-03-15T10:30:00.000Z");
    });

    it("should parse ISO date string", () => {
      const result = parseDate("2024-03-15T10:30:00.000Z");
      expect(result).toBe("2024-03-15T10:30:00.000Z");
    });

    it("should parse various date string formats", () => {
      // Common formats
      expect(parseDate("2024-03-15")).toContain("2024-03-15");
      expect(parseDate("03/15/2024")).toContain("2024");
      expect(parseDate("March 15, 2024")).toContain("2024");
      expect(parseDate("15 Mar 2024")).toContain("2024");
    });

    it("should return current date for empty string", () => {
      const before = new Date();
      const result = parseDate("");
      const after = new Date();

      const resultDate = new Date(result);
      expect(resultDate.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(resultDate.getTime()).toBeLessThanOrEqual(after.getTime());
    });

    it("should return current date for whitespace-only string", () => {
      const before = new Date();
      const result = parseDate("   ");
      const after = new Date();

      const resultDate = new Date(result);
      expect(resultDate.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(resultDate.getTime()).toBeLessThanOrEqual(after.getTime());
    });

    it("should return current date for invalid date string", () => {
      const before = new Date();
      const result = parseDate("not a date");
      const after = new Date();

      const resultDate = new Date(result);
      expect(resultDate.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(resultDate.getTime()).toBeLessThanOrEqual(after.getTime());
    });

    it("should handle dates with time zones", () => {
      const result = parseDate("2024-03-15T10:30:00+05:00");
      expect(result).toContain("2024-03-15");
      expect(new Date(result).getUTCHours()).toBe(5); // UTC time = 10:30-05:00 = 05:30
    });

    it("should trim whitespace from date strings", () => {
      const result = parseDate("  2024-03-15T10:30:00.000Z  ");
      expect(result).toBe("2024-03-15T10:30:00.000Z");
    });
  });

  describe("safeStringValue", () => {
    it("should extract valid string value", () => {
      const row = { name: "Alice", age: 30 };
      expect(safeStringValue(row, "name")).toBe("Alice");
    });

    it("should convert number to string", () => {
      const row = { age: 30 };
      expect(safeStringValue(row, "age")).toBe("30");
    });

    it("should convert boolean to string", () => {
      const row = { active: true, inactive: false };
      expect(safeStringValue(row, "active")).toBe("true");
      expect(safeStringValue(row, "inactive")).toBe("false");
    });

    it("should return null for missing key", () => {
      const row = { name: "Alice" };
      expect(safeStringValue(row, "missing")).toBeNull();
    });

    it("should return null for null value", () => {
      const row = { name: null };
      expect(safeStringValue(row, "name")).toBeNull();
    });

    it("should return null for empty string", () => {
      const row = { name: "" };
      expect(safeStringValue(row, "name")).toBeNull();
    });

    it("should trim whitespace from string values", () => {
      const row = { name: "  Alice  " };
      expect(safeStringValue(row, "name")).toBe("Alice");
    });

    it("should return empty string for whitespace-only string", () => {
      const row = { name: "   " };
      // Function checks value === "" before trimming, so "   " passes the check
      // Then trim() is called, resulting in an empty string ""
      const result = safeStringValue(row, "name");
      expect(result).toBe("");
    });

    it("should prevent prototype pollution", () => {
      const row = { name: "Alice" };
      expect(safeStringValue(row, "__proto__")).toBeNull();
      expect(safeStringValue(row, "constructor")).toBeNull();
      expect(safeStringValue(row, "toString")).toBeNull();
    });

    it("should handle object values", () => {
      const row = { data: { nested: true } };
      const result = safeStringValue(row, "data");
      // String(object) returns "[object Object]"
      expect(result).toBe("[object Object]");
    });

    it("should handle array values", () => {
      const row = { tags: ["tag1", "tag2"] };
      const result = safeStringValue(row, "tags");
      // String(array) returns comma-separated values
      expect(result).toBe("tag1,tag2");
    });
  });

  describe("hasValidProperty", () => {
    it("should return true for valid string property", () => {
      const obj = { name: "Alice" };
      expect(hasValidProperty(obj, "name")).toBe(true);
    });

    it("should return true for valid number property", () => {
      const obj = { age: 30 };
      expect(hasValidProperty(obj, "age")).toBe(true);
    });

    it("should return true for zero", () => {
      const obj = { count: 0 };
      expect(hasValidProperty(obj, "count")).toBe(true);
    });

    it("should return true for false boolean", () => {
      const obj = { active: false };
      expect(hasValidProperty(obj, "active")).toBe(true);
    });

    it("should return false for null value", () => {
      const obj = { name: null };
      expect(hasValidProperty(obj, "name")).toBe(false);
    });

    it("should return false for undefined value", () => {
      const obj = { name: undefined };
      expect(hasValidProperty(obj, "name")).toBe(false);
    });

    it("should return false for empty string", () => {
      const obj = { name: "" };
      expect(hasValidProperty(obj, "name")).toBe(false);
    });

    it("should return false for missing key", () => {
      const obj = { name: "Alice" };
      expect(hasValidProperty(obj, "missing")).toBe(false);
    });

    it("should return true for whitespace-only string", () => {
      const obj = { name: "   " };
      expect(hasValidProperty(obj, "name")).toBe(true);
    });

    it("should prevent prototype pollution", () => {
      const obj = { name: "Alice" };
      expect(hasValidProperty(obj, "__proto__")).toBe(false);
      expect(hasValidProperty(obj, "constructor")).toBe(false);
      expect(hasValidProperty(obj, "toString")).toBe(false);
    });
  });

  describe("parseTagsFromRow", () => {
    it("should parse tags from 'tags' field", () => {
      const row = { tags: "tag1, tag2, tag3" };
      const result = parseTagsFromRow(row);
      expect(result).toEqual(["tag1", "tag2", "tag3"]);
    });

    it("should parse tags from 'categories' field", () => {
      const row = { categories: "cat1, cat2" };
      const result = parseTagsFromRow(row);
      expect(result).toEqual(["cat1", "cat2"]);
    });

    it("should parse tags from 'keywords' field", () => {
      const row = { keywords: "key1, key2" };
      const result = parseTagsFromRow(row);
      expect(result).toEqual(["key1", "key2"]);
    });

    it("should parse tags from 'labels' field", () => {
      const row = { labels: "label1, label2" };
      const result = parseTagsFromRow(row);
      expect(result).toEqual(["label1", "label2"]);
    });

    it("should prioritize 'tags' field over other fields", () => {
      const row = {
        tags: "tag1, tag2",
        categories: "cat1, cat2",
        keywords: "key1, key2",
      };
      const result = parseTagsFromRow(row);
      expect(result).toEqual(["tag1", "tag2"]);
    });

    it("should split by comma separator", () => {
      const row = { tags: "tag1,tag2,tag3" };
      const result = parseTagsFromRow(row);
      expect(result).toEqual(["tag1", "tag2", "tag3"]);
    });

    it("should split by semicolon separator", () => {
      const row = { tags: "tag1;tag2;tag3" };
      const result = parseTagsFromRow(row);
      expect(result).toEqual(["tag1", "tag2", "tag3"]);
    });

    it("should split by pipe separator", () => {
      const row = { tags: "tag1|tag2|tag3" };
      const result = parseTagsFromRow(row);
      expect(result).toEqual(["tag1", "tag2", "tag3"]);
    });

    it("should handle mixed separators", () => {
      const row = { tags: "tag1, tag2; tag3| tag4" };
      const result = parseTagsFromRow(row);
      expect(result).toEqual(["tag1", "tag2", "tag3", "tag4"]);
    });

    it("should trim whitespace from tags", () => {
      const row = { tags: "  tag1  ,  tag2  ,  tag3  " };
      const result = parseTagsFromRow(row);
      expect(result).toEqual(["tag1", "tag2", "tag3"]);
    });

    it("should filter out empty tags", () => {
      const row = { tags: "tag1, , tag2, , tag3" };
      const result = parseTagsFromRow(row);
      expect(result).toEqual(["tag1", "tag2", "tag3"]);
    });

    it("should remove duplicate tags", () => {
      const row = { tags: "tag1, tag2, tag1, tag3, tag2" };
      const result = parseTagsFromRow(row);
      expect(result).toEqual(["tag1", "tag2", "tag3"]);
    });

    it("should limit to 10 tags", () => {
      const row = {
        tags: "tag1, tag2, tag3, tag4, tag5, tag6, tag7, tag8, tag9, tag10, tag11, tag12",
      };
      const result = parseTagsFromRow(row);
      expect(result).toHaveLength(10);
      expect(result).toEqual(["tag1", "tag2", "tag3", "tag4", "tag5", "tag6", "tag7", "tag8", "tag9", "tag10"]);
    });

    it("should return empty array when no tag fields present", () => {
      const row = { name: "Event", description: "Description" };
      const result = parseTagsFromRow(row);
      expect(result).toEqual([]);
    });

    it("should return empty array for null tag field", () => {
      const row = { tags: null };
      const result = parseTagsFromRow(row);
      expect(result).toEqual([]);
    });

    it("should return empty array for empty string tag field", () => {
      const row = { tags: "" };
      const result = parseTagsFromRow(row);
      expect(result).toEqual([]);
    });

    it("should return empty array for whitespace-only tag field", () => {
      const row = { tags: "   " };
      const result = parseTagsFromRow(row);
      expect(result).toEqual([]);
    });

    it("should handle single tag without separators", () => {
      const row = { tags: "single-tag" };
      const result = parseTagsFromRow(row);
      expect(result).toEqual(["single-tag"]);
    });
  });
});
