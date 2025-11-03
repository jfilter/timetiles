/**
 * Unit tests for data parsing utility functions.
 *
 * Tests the safe object property accessors and file type routing.
 *
 * @module
 * @category Tests
 */
import fs from "node:fs";
import path from "node:path";

import os from "os";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  getObjectProperty,
  parseCSVFile,
  parseExcelFile,
  parseFileByType,
  setObjectProperty,
} from "../../../../lib/jobs/utils/data-parsing";
import { createJobLogger } from "../../../../lib/logger";

describe("Data Parsing Utilities", () => {
  let tempDir: string;
  let mockLogger: ReturnType<typeof createJobLogger>;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "data-parsing-test-"));
    mockLogger = createJobLogger("test-job", "test-123");
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe("setObjectProperty", () => {
    it("should set valid property", () => {
      const obj: Record<string, unknown> = {};
      setObjectProperty(obj, "name", "John");
      expect(obj.name).toBe("John");
    });

    it("should set property with various value types", () => {
      const obj: Record<string, unknown> = {};
      setObjectProperty(obj, "string", "value");
      setObjectProperty(obj, "number", 42);
      setObjectProperty(obj, "boolean", true);
      setObjectProperty(obj, "null", null);
      setObjectProperty(obj, "undefined", undefined);
      setObjectProperty(obj, "array", [1, 2, 3]);
      setObjectProperty(obj, "object", { nested: true });

      expect(obj.string).toBe("value");
      expect(obj.number).toBe(42);
      expect(obj.boolean).toBe(true);
      expect(obj.null).toBe(null);
      expect(obj.undefined).toBe(undefined);
      expect(obj.array).toEqual([1, 2, 3]);
      expect(obj.object).toEqual({ nested: true });
    });

    it("should reject prototype pollution (__proto__)", () => {
      const obj: Record<string, unknown> = {};
      setObjectProperty(obj, "__proto__", { polluted: true });
      expect((obj as any).__proto__.polluted).toBeUndefined();
      expect(Object.prototype.hasOwnProperty("polluted")).toBe(false);
    });

    it("should reject constructor property", () => {
      const obj: Record<string, unknown> = {};
      setObjectProperty(obj, "constructor", { malicious: true });
      // Constructor should not be modifiable through this function
      expect(obj.constructor).toBe(Object);
    });

    it("should reject toString property", () => {
      const obj: Record<string, unknown> = {};
      const originalToString = obj.toString;
      setObjectProperty(obj, "toString", "malicious");
      // toString should not be modifiable through this function
      expect(obj.toString).toBe(originalToString);
    });

    it("should reject empty key", () => {
      const obj: Record<string, unknown> = {};
      setObjectProperty(obj, "", "value");
      expect(obj[""]).toBeUndefined();
    });

    it("should accept valid keys with special characters", () => {
      const obj: Record<string, unknown> = {};
      setObjectProperty(obj, "key-with-dash", "value1");
      setObjectProperty(obj, "key_with_underscore", "value2");
      setObjectProperty(obj, "key.with.dot", "value3");
      setObjectProperty(obj, "key123", "value4");

      expect(obj["key-with-dash"]).toBe("value1");
      expect(obj["key_with_underscore"]).toBe("value2");
      expect(obj["key.with.dot"]).toBe("value3");
      expect(obj["key123"]).toBe("value4");
    });

    it("should overwrite existing property", () => {
      const obj: Record<string, unknown> = { name: "Old" };
      setObjectProperty(obj, "name", "New");
      expect(obj.name).toBe("New");
    });
  });

  describe("getObjectProperty", () => {
    it("should get valid property", () => {
      const obj = { name: "John", age: 30 };
      expect(getObjectProperty(obj, "name")).toBe("John");
      expect(getObjectProperty(obj, "age")).toBe(30);
    });

    it("should return undefined for missing key", () => {
      const obj = { name: "John" };
      expect(getObjectProperty(obj, "missing")).toBeUndefined();
    });

    it("should prevent prototype access", () => {
      const obj = { name: "John" };
      expect(getObjectProperty(obj, "__proto__")).toBeUndefined();
      expect(getObjectProperty(obj, "constructor")).toBeUndefined();
      expect(getObjectProperty(obj, "toString")).toBeUndefined();
    });

    it("should get various value types", () => {
      const obj = {
        string: "value",
        number: 42,
        boolean: true,
        null: null,
        undefined: undefined,
        array: [1, 2, 3],
        object: { nested: true },
      };

      expect(getObjectProperty(obj, "string")).toBe("value");
      expect(getObjectProperty(obj, "number")).toBe(42);
      expect(getObjectProperty(obj, "boolean")).toBe(true);
      expect(getObjectProperty(obj, "null")).toBe(null);
      expect(getObjectProperty(obj, "undefined")).toBe(undefined);
      expect(getObjectProperty(obj, "array")).toEqual([1, 2, 3]);
      expect(getObjectProperty(obj, "object")).toEqual({ nested: true });
    });

    it("should handle keys with special characters", () => {
      const obj = {
        "key-with-dash": "value1",
        key_with_underscore: "value2",
        "key.with.dot": "value3",
        key123: "value4",
      };

      expect(getObjectProperty(obj, "key-with-dash")).toBe("value1");
      expect(getObjectProperty(obj, "key_with_underscore")).toBe("value2");
      expect(getObjectProperty(obj, "key.with.dot")).toBe("value3");
      expect(getObjectProperty(obj, "key123")).toBe("value4");
    });

    it("should return undefined for empty string key", () => {
      const obj = { name: "John" };
      expect(getObjectProperty(obj, "")).toBeUndefined();
    });
  });

  describe("parseCSVFile", () => {
    it("should throw when file doesn't exist", () => {
      const nonExistentPath = path.join(tempDir, "nonexistent.csv");
      expect(() => parseCSVFile(nonExistentPath, mockLogger)).toThrow("File not found");
    });

    it("should parse valid CSV file", () => {
      const csvContent = `title,description,date
Event 1,Description 1,2024-03-15
Event 2,Description 2,2024-03-16`;
      const csvPath = path.join(tempDir, "valid.csv");
      fs.writeFileSync(csvPath, csvContent, "utf8");

      const result = parseCSVFile(csvPath, mockLogger);
      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({
        title: "Event 1",
        description: "Description 1",
        date: "2024-03-15",
      });
    });

    it("should handle empty CSV file", () => {
      const csvPath = path.join(tempDir, "empty.csv");
      fs.writeFileSync(csvPath, "", "utf8");

      const result = parseCSVFile(csvPath, mockLogger);
      expect(result).toHaveLength(0);
    });

    it("should trim header spaces", () => {
      const csvContent = `  title  ,  description  ,  date
Event 1,Desc 1,2024-03-15`;
      const csvPath = path.join(tempDir, "spaces.csv");
      fs.writeFileSync(csvPath, csvContent, "utf8");

      const result = parseCSVFile(csvPath, mockLogger);
      expect(result[0]).toHaveProperty("title");
      expect(result[0]).toHaveProperty("description");
      expect(result[0]).toHaveProperty("date");
    });
  });

  describe("parseExcelFile", () => {
    it("should throw when file doesn't exist", () => {
      const nonExistentPath = path.join(tempDir, "nonexistent.xlsx");
      expect(() => parseExcelFile(nonExistentPath, mockLogger)).toThrow("File not found");
    });

    // Note: "No worksheets found" error cannot be tested because xlsx.writeFile()
    // validates workbooks and throws "Workbook is empty" before writing.
    // The parseExcelFile function has the check for this case, but it's unreachable
    // with files created by the xlsx library.

    it("should handle empty worksheet", () => {
      const xlsx = require("xlsx");
      const workbook = xlsx.utils.book_new();
      const worksheet = xlsx.utils.aoa_to_sheet([]);
      xlsx.utils.book_append_sheet(workbook, worksheet, "Sheet1");
      const xlsxPath = path.join(tempDir, "empty-sheet.xlsx");
      xlsx.writeFile(workbook, xlsxPath);

      const result = parseExcelFile(xlsxPath, mockLogger);
      expect(result).toHaveLength(0);
    });

    it("should parse valid Excel file", () => {
      const xlsx = require("xlsx");
      const workbook = xlsx.utils.book_new();
      const data = [
        ["title", "description", "date"],
        ["Event 1", "Description 1", "2024-03-15"],
        ["Event 2", "Description 2", "2024-03-16"],
      ];
      const worksheet = xlsx.utils.aoa_to_sheet(data);
      xlsx.utils.book_append_sheet(workbook, worksheet, "Sheet1");
      const xlsxPath = path.join(tempDir, "valid.xlsx");
      xlsx.writeFile(workbook, xlsxPath);

      const result = parseExcelFile(xlsxPath, mockLogger);
      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({
        title: "Event 1",
        description: "Description 1",
        date: "2024-03-15",
      });
    });

    it("should handle missing headers", () => {
      const xlsx = require("xlsx");
      const workbook = xlsx.utils.book_new();
      const data = [
        ["", "description", ""],
        ["Event 1", "Description 1", "2024-03-15"],
      ];
      const worksheet = xlsx.utils.aoa_to_sheet(data);
      xlsx.utils.book_append_sheet(workbook, worksheet, "Sheet1");
      const xlsxPath = path.join(tempDir, "missing-headers.xlsx");
      xlsx.writeFile(workbook, xlsxPath);

      const result = parseExcelFile(xlsxPath, mockLogger);
      expect(result).toHaveLength(1);
      // Should have description and column_0, column_2 for empty headers
      // But empty header strings won't be set due to setObjectProperty's validation
      expect(result[0]).toHaveProperty("description");
      expect(result[0]?.description).toBe("Description 1");
    });
  });

  describe("parseFileByType", () => {
    it("should route to CSV parser", () => {
      const csvContent = `title,date
Event 1,2024-03-15`;
      const csvPath = path.join(tempDir, "test.csv");
      fs.writeFileSync(csvPath, csvContent, "utf8");

      const result = parseFileByType(csvPath, "csv", mockLogger);
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        title: "Event 1",
        date: "2024-03-15",
      });
    });

    it("should route to Excel parser", () => {
      const xlsx = require("xlsx");
      const workbook = xlsx.utils.book_new();
      const data = [
        ["title", "date"],
        ["Event 1", "2024-03-15"],
      ];
      const worksheet = xlsx.utils.aoa_to_sheet(data);
      xlsx.utils.book_append_sheet(workbook, worksheet, "Sheet1");
      const xlsxPath = path.join(tempDir, "test.xlsx");
      xlsx.writeFile(workbook, xlsxPath);

      const result = parseFileByType(xlsxPath, "xlsx", mockLogger);
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        title: "Event 1",
        date: "2024-03-15",
      });
    });

    it("should throw for unsupported type", () => {
      const filePath = path.join(tempDir, "test.txt");
      fs.writeFileSync(filePath, "some content", "utf8");

      expect(() => parseFileByType(filePath, "txt" as any, mockLogger)).toThrow("Unsupported file type: txt");
    });
  });
});
