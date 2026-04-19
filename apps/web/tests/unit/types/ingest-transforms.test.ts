/**
 * Unit tests for import transform types and utilities.
 *
 * @module
 * @category Tests
 */
import { describe, expect, it, vi } from "vitest";

import type { IngestTransform } from "@/lib/ingest/types/transforms";
import {
  createTransform,
  DATE_FORMAT_OPTIONS,
  isTransformValid,
  TRANSFORM_TYPE_DESCRIPTIONS,
  TRANSFORM_TYPE_LABELS,
} from "@/lib/ingest/types/transforms";

// Mock crypto.randomUUID for deterministic tests
vi.stubGlobal("crypto", { randomUUID: () => "test-uuid" });

describe("import-transforms", () => {
  describe("isTransformValid", () => {
    it("should validate rename transform", () => {
      const valid: IngestTransform = {
        id: "1",
        type: "rename",
        from: "old_name",
        to: "new_name",
        active: true,
        autoDetected: false,
      };
      expect(isTransformValid(valid)).toBe(true);
    });

    it("should reject rename with missing from", () => {
      const invalid: IngestTransform = {
        id: "1",
        type: "rename",
        from: "",
        to: "new_name",
        active: true,
        autoDetected: false,
      };
      expect(isTransformValid(invalid)).toBe(false);
    });

    it("should reject rename with missing to", () => {
      const invalid: IngestTransform = {
        id: "1",
        type: "rename",
        from: "old_name",
        to: "",
        active: true,
        autoDetected: false,
      };
      expect(isTransformValid(invalid)).toBe(false);
    });

    it("should validate date-parse transform", () => {
      const valid: IngestTransform = {
        id: "1",
        type: "date-parse",
        from: "date_col",
        inputFormat: "DD/MM/YYYY",
        outputFormat: "YYYY-MM-DD",
        active: true,
        autoDetected: false,
      };
      expect(isTransformValid(valid)).toBe(true);
    });

    it("should reject date-parse with missing inputFormat", () => {
      const invalid: IngestTransform = {
        id: "1",
        type: "date-parse",
        from: "date_col",
        inputFormat: "",
        outputFormat: "YYYY-MM-DD",
        active: true,
        autoDetected: false,
      };
      expect(isTransformValid(invalid)).toBe(false);
    });

    it("should validate string-op transform", () => {
      const valid: IngestTransform = {
        id: "1",
        type: "string-op",
        from: "name",
        operation: "uppercase",
        active: true,
        autoDetected: false,
      };
      expect(isTransformValid(valid)).toBe(true);
    });

    it("should reject string-op with missing operation", () => {
      const invalid: IngestTransform = {
        id: "1",
        type: "string-op",
        from: "name",
        operation: "" as "uppercase",
        active: true,
        autoDetected: false,
      };
      expect(isTransformValid(invalid)).toBe(false);
    });

    it("should validate concatenate transform", () => {
      const valid: IngestTransform = {
        id: "1",
        type: "concatenate",
        fromFields: ["first", "last"],
        separator: " ",
        to: "full_name",
        active: true,
        autoDetected: false,
      };
      expect(isTransformValid(valid)).toBe(true);
    });

    it("should reject concatenate with fewer than 2 fields", () => {
      const invalid: IngestTransform = {
        id: "1",
        type: "concatenate",
        fromFields: ["first"],
        separator: " ",
        to: "full_name",
        active: true,
        autoDetected: false,
      };
      expect(isTransformValid(invalid)).toBe(false);
    });

    it("should reject concatenate with missing to", () => {
      const invalid: IngestTransform = {
        id: "1",
        type: "concatenate",
        fromFields: ["first", "last"],
        separator: " ",
        to: "",
        active: true,
        autoDetected: false,
      };
      expect(isTransformValid(invalid)).toBe(false);
    });

    it("should validate split transform", () => {
      const valid: IngestTransform = {
        id: "1",
        type: "split",
        from: "full_name",
        delimiter: " ",
        toFields: ["first", "last"],
        active: true,
        autoDetected: false,
      };
      expect(isTransformValid(valid)).toBe(true);
    });

    it("should reject split with empty delimiter", () => {
      const invalid: IngestTransform = {
        id: "1",
        type: "split",
        from: "full_name",
        delimiter: "",
        toFields: ["first"],
        active: true,
        autoDetected: false,
      };
      expect(isTransformValid(invalid)).toBe(false);
    });

    it("should reject split with no toFields", () => {
      const invalid: IngestTransform = {
        id: "1",
        type: "split",
        from: "full_name",
        delimiter: " ",
        toFields: [],
        active: true,
        autoDetected: false,
      };
      expect(isTransformValid(invalid)).toBe(false);
    });

    it("should validate string-op expression with expression field", () => {
      const valid: IngestTransform = {
        id: "1",
        type: "string-op",
        from: "amount",
        operation: "expression",
        expression: "toNumber(value)",
        active: true,
        autoDetected: false,
      };
      expect(isTransformValid(valid)).toBe(true);
    });

    it("should reject string-op expression with missing expression field", () => {
      const invalid: IngestTransform = {
        id: "1",
        type: "string-op",
        from: "amount",
        operation: "expression",
        active: true,
        autoDetected: false,
      };
      expect(isTransformValid(invalid)).toBe(false);
    });

    it("should return false for unknown type", () => {
      const invalid = { id: "1", type: "unknown", active: true, autoDetected: false } as unknown as IngestTransform;
      expect(isTransformValid(invalid)).toBe(false);
    });
  });

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
    it("should have labels for all transform types", () => {
      expect(Object.keys(TRANSFORM_TYPE_LABELS)).toHaveLength(8);
      expect(TRANSFORM_TYPE_LABELS.rename).toBe("Rename Field");
    });

    it("should have descriptions for all transform types", () => {
      expect(Object.keys(TRANSFORM_TYPE_DESCRIPTIONS)).toHaveLength(8);
    });

    it("should have date format options", () => {
      expect(DATE_FORMAT_OPTIONS.length).toBeGreaterThan(0);
      expect(DATE_FORMAT_OPTIONS[0].value).toBe("DD/MM/YYYY");
    });
  });
});
