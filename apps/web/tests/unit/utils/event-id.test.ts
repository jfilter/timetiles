/**
 * @module
 */
import { describe, expect, it } from "vitest";

import {
  extractExternalIdValue,
  formatEventId,
  generateIdPreview,
  ID_PREFIXES,
  sanitizeId,
} from "../../../lib/utils/event-id";

describe("event-id utilities", () => {
  describe("ID_PREFIXES", () => {
    it("maps all three strategies", () => {
      expect(ID_PREFIXES.external).toBe("ext");
      expect(ID_PREFIXES["content-hash"]).toBe("hash");
      expect(ID_PREFIXES["auto-generate"]).toBe("auto");
    });
  });

  describe("formatEventId", () => {
    it("assembles datasetId:prefix:value", () => {
      expect(formatEventId("42", "ext", "my-id")).toBe("42:ext:my-id");
    });

    it("works with content-hash prefix", () => {
      expect(formatEventId("1", "hash", "abc123")).toBe("1:hash:abc123");
    });
  });

  describe("sanitizeId", () => {
    it("trims whitespace", () => {
      expect(sanitizeId("  hello  ")).toBe("hello");
    });

    it("accepts alphanumeric, dashes, underscores, colons, dots", () => {
      expect(sanitizeId("a-b_c:d.e")).toBe("a-b_c:d.e");
    });

    it("throws on empty string", () => {
      expect(() => sanitizeId("")).toThrow("Invalid ID length: 0");
    });

    it("throws on whitespace-only string", () => {
      expect(() => sanitizeId("   ")).toThrow("Invalid ID length: 0");
    });

    it("throws on string exceeding 255 characters", () => {
      expect(() => sanitizeId("a".repeat(256))).toThrow("Invalid ID length: 256");
    });

    it("throws on invalid characters", () => {
      expect(() => sanitizeId("hello world")).toThrow("Invalid ID format");
      expect(() => sanitizeId("id@123")).toThrow("Invalid ID format");
    });
  });

  describe("extractExternalIdValue", () => {
    it("extracts top-level field", () => {
      expect(extractExternalIdValue({ id: "abc" }, "id")).toBe("abc");
    });

    it("extracts nested field via dot-notation", () => {
      expect(extractExternalIdValue({ meta: { uuid: "x-1" } }, "meta.uuid")).toBe("x-1");
    });

    it("stringifies numeric values", () => {
      expect(extractExternalIdValue({ id: 42 }, "id")).toBe("42");
    });

    it("stringifies object values as JSON", () => {
      const data = { id: { nested: true } };
      expect(extractExternalIdValue(data, "id")).toBe('{"nested":true}');
    });

    it("returns null for missing path", () => {
      expect(extractExternalIdValue({ name: "test" }, "id")).toBeNull();
    });

    it("returns null for empty path", () => {
      expect(extractExternalIdValue({ id: "abc" }, "")).toBeNull();
    });

    it("returns null for null data", () => {
      expect(extractExternalIdValue(null, "id")).toBeNull();
    });
  });

  describe("generateIdPreview", () => {
    describe("external strategy", () => {
      it("returns sanitized field value", () => {
        const row = { myId: "event-123" };
        expect(generateIdPreview(row, "external", "myId")).toBe("event-123");
      });

      it("returns empty string when idField is null", () => {
        expect(generateIdPreview({ id: "x" }, "external", null)).toBe("");
      });

      it("returns empty string for missing field value", () => {
        expect(generateIdPreview({ name: "test" }, "external", "id")).toBe("");
      });

      it("returns empty string for invalid characters (graceful fallback)", () => {
        const row = { id: "hello world" };
        expect(generateIdPreview(row, "external", "id")).toBe("");
      });
    });

    describe("content-hash strategy", () => {
      it("returns the placeholder label", () => {
        const row = { name: "test" };
        expect(
          generateIdPreview(row, "content-hash", null, { contentHashPlaceholder: "Content hash of all fields" })
        ).toBe("Content hash of all fields");
      });

      it("returns empty string without placeholder", () => {
        expect(generateIdPreview({}, "content-hash", null)).toBe("");
      });
    });

    describe("auto-generate strategy", () => {
      it("returns auto-{index}", () => {
        expect(generateIdPreview({}, "auto-generate", null, { autoIndex: 3 })).toBe("auto-3");
      });

      it("defaults to auto-0 without index", () => {
        expect(generateIdPreview({}, "auto-generate", null)).toBe("auto-0");
      });
    });
  });
});
