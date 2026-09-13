/**
 * Unit tests for import transform types and utilities.
 *
 * @module
 * @category Tests
 */
import { describe, expect, it, vi } from "vitest";

import { DATE_FORMAT_OPTIONS, TRANSFORM_DEFINITIONS, TRANSFORM_TYPES } from "@/lib/definitions/transform-registry";
import { createTransform } from "@/lib/ingest/types/transforms";

// Mock crypto.randomUUID for deterministic tests
vi.stubGlobal("crypto", { randomUUID: () => "test-uuid" });

describe("import-transforms", () => {
  describe("createTransform", () => {
    it("should create rename transform", () => {
      const t = createTransform("rename");
      expect(t.type).toBe("rename");
      expect(t.active).toBe(true);
      expect(t.autoDetected).toBe(false);
      expect(t.id).toBe("test-uuid");
      if (t.type === "rename") {
        expect(t.from).toBe("");
        expect(t.to).toBe("");
      }
    });

    it("should create date-parse transform with default outputFormat", () => {
      const t = createTransform("date-parse");
      expect(t.type).toBe("date-parse");
      if (t.type === "date-parse") {
        expect(t.outputFormat).toBe("YYYY-MM-DD");
      }
    });

    it("should create string-op transform with default operation", () => {
      const t = createTransform("string-op");
      expect(t.type).toBe("string-op");
      if (t.type === "string-op") {
        expect(t.operation).toBe("uppercase");
      }
    });

    it("should create concatenate transform with default separator", () => {
      const t = createTransform("concatenate");
      expect(t.type).toBe("concatenate");
      if (t.type === "concatenate") {
        expect(t.separator).toBe(" ");
        expect(t.fromFields).toEqual([]);
      }
    });

    it("should create split transform with default delimiter", () => {
      const t = createTransform("split");
      expect(t.type).toBe("split");
      if (t.type === "split") {
        expect(t.delimiter).toBe(",");
        expect(t.toFields).toEqual([]);
      }
    });
  });

  describe("constants", () => {
    it("defines a label and description for every transform type", () => {
      expect(Object.keys(TRANSFORM_DEFINITIONS)).toHaveLength(TRANSFORM_TYPES.length);
      expect(Object.keys(TRANSFORM_DEFINITIONS)).toEqual(expect.arrayContaining([...TRANSFORM_TYPES]));
      expect(TRANSFORM_DEFINITIONS.rename.label).toBe("Rename Field");
      for (const type of TRANSFORM_TYPES) {
        expect(TRANSFORM_DEFINITIONS[type].label.trim()).not.toBe("");
        expect(TRANSFORM_DEFINITIONS[type].description.trim()).not.toBe("");
      }
    });

    it("should have date format options", () => {
      expect(DATE_FORMAT_OPTIONS.length).toBeGreaterThan(0);
      expect(DATE_FORMAT_OPTIONS[0].value).toBe("DD/MM/YYYY");
    });
  });
});
