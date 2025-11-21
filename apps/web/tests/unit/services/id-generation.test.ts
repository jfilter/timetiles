/**
 * @module
 */
import { describe, expect, it } from "vitest";

import { generateUniqueId, IdGenerationService } from "../../../lib/services/id-generation";
import type { Dataset } from "../../../payload-types";

describe("IdGenerationService", () => {
  const mockDatasetId = 123;

  describe("generateEventId", () => {
    describe("external ID strategy", () => {
      const mockDataset: Partial<Dataset> = {
        id: mockDatasetId,
        idStrategy: {
          type: "external",
          externalIdPath: "id",
          duplicateStrategy: "skip",
        },
      };

      it("generates ID from external field", () => {
        const data = { id: "ext-123", name: "Test Event" };

        const result = IdGenerationService.generateEventId(data, mockDataset as Dataset);

        expect(result.uniqueId).toBe("123:ext:ext-123");
        expect(result.sourceId).toBe("ext-123");
        expect(result.strategy).toBe("external");
        expect(result.error).toBeUndefined();
      });

      it("handles nested external ID path", () => {
        const datasetWithNestedPath: Partial<Dataset> = {
          ...mockDataset,
          idStrategy: {
            type: "external",
            externalIdPath: "metadata.uuid",
            duplicateStrategy: "skip",
          },
        };

        const data = {
          name: "Test",
          metadata: { uuid: "uuid-789" },
        };

        const result = IdGenerationService.generateEventId(data, datasetWithNestedPath as Dataset);

        expect(result.uniqueId).toBe("123:ext:uuid-789");
        expect(result.sourceId).toBe("uuid-789");
      });

      it("returns error for missing external ID", () => {
        const data = { name: "Test Event" }; // Missing 'id' field

        const result = IdGenerationService.generateEventId(data, mockDataset as Dataset);

        expect(result.uniqueId).toMatch(/^123:error:\d+$/);
        expect(result.error).toBe("Missing external ID at path: id");
      });

      it("sanitizes external IDs", () => {
        const testCases = [
          { input: "valid-id_123", expected: "valid-id_123" },
          { input: "id.with.dots", expected: "id.with.dots" },
          { input: "id:with:colons", expected: "id:with:colons" },
          { input: " trimmed ", expected: "trimmed" },
        ];

        for (const testCase of testCases) {
          const data = { id: testCase.input };
          const result = IdGenerationService.generateEventId(data, mockDataset as Dataset);

          expect(result.sourceId).toBe(testCase.expected);
        }
      });

      it("rejects invalid ID formats", () => {
        const invalidCases = [
          { id: "", error: "Missing external ID at path: id" }, // Empty string is treated as missing
          { id: "a".repeat(256), error: "Invalid ID length: 256" },
          { id: "id with spaces", error: "Invalid ID format" },
          { id: "id@with#special$chars", error: "Invalid ID format" },
        ];

        for (const testCase of invalidCases) {
          const result = IdGenerationService.generateEventId(testCase, mockDataset as Dataset);

          expect(result.uniqueId).toMatch(/^123:error:\d+$/);
          expect(result.error).toContain(testCase.error);
        }
      });
    });

    describe("computed ID strategy", () => {
      const mockDataset: Partial<Dataset> = {
        id: mockDatasetId,
        idStrategy: {
          type: "computed",
          computedIdFields: [{ fieldPath: "title" }, { fieldPath: "date" }],
          duplicateStrategy: "skip",
        },
      };

      it("generates hash from specified fields", () => {
        const data = {
          title: "Test Event",
          date: "2024-03-15",
          description: "Should not be included",
        };

        const result = IdGenerationService.generateEventId(data, mockDataset as Dataset);

        expect(result.uniqueId).toMatch(/^123:comp:[a-f0-9]{16}$/);
        expect(result.strategy).toBe("computed");
        expect(result.sourceId).toBeUndefined();
      });

      it("generates consistent hash for same values", () => {
        const data1 = { title: "Event", date: "2024-03-15" };
        const data2 = { title: "Event", date: "2024-03-15", extra: "ignored" };

        const result1 = IdGenerationService.generateEventId(data1, mockDataset as Dataset);
        const result2 = IdGenerationService.generateEventId(data2, mockDataset as Dataset);

        expect(result1.uniqueId).toBe(result2.uniqueId);
      });

      it("generates different hash for different values", () => {
        const data1 = { title: "Event1", date: "2024-03-15" };
        const data2 = { title: "Event2", date: "2024-03-15" };

        const result1 = IdGenerationService.generateEventId(data1, mockDataset as Dataset);
        const result2 = IdGenerationService.generateEventId(data2, mockDataset as Dataset);

        expect(result1.uniqueId).not.toBe(result2.uniqueId);
      });

      it("handles nested field paths", () => {
        const datasetWithNestedFields: Partial<Dataset> = {
          id: mockDatasetId,
          idStrategy: {
            type: "computed",
            computedIdFields: [{ fieldPath: "metadata.id" }, { fieldPath: "location.name" }],
            duplicateStrategy: "skip",
          },
        };

        const data = {
          metadata: { id: "meta-123" },
          location: { name: "NYC" },
        };

        const result = IdGenerationService.generateEventId(data, datasetWithNestedFields as Dataset);

        expect(result.uniqueId).toMatch(/^123:comp:[a-f0-9]{16}$/);
        expect(result.error).toBeUndefined();
      });

      it("returns error for missing required fields", () => {
        const data = { title: "Test Event" }; // Missing 'date' field

        const result = IdGenerationService.generateEventId(data, mockDataset as Dataset);

        expect(result.uniqueId).toMatch(/^123:error:\d+$/);
        expect(result.error).toBe("Missing required fields for computed ID: date");
      });

      it("handles null and undefined values", () => {
        const data = { title: null, date: undefined };

        const result = IdGenerationService.generateEventId(data, mockDataset as Dataset);

        expect(result.error).toContain("Missing required fields");
      });
    });

    describe("auto ID strategy", () => {
      const mockDataset: Partial<Dataset> = {
        id: mockDatasetId,
        idStrategy: {
          type: "auto",
          duplicateStrategy: "skip",
        },
      };

      it("generates unique auto ID with content hash", () => {
        const data = { title: "Test Event", date: "2024-03-15" };

        const result = IdGenerationService.generateEventId(data, mockDataset as Dataset);

        expect(result.uniqueId).toMatch(/^123:auto:\d+:[a-f0-9]{8}$/); // 4 bytes = 8 hex chars
        expect(result.contentHash).toMatch(/^[a-f0-9]{64}$/); // SHA256 hash
        expect(result.strategy).toBe("auto");
      });

      it("generates consistent content hash for same data", () => {
        const data = { title: "Test", value: 123 };

        const result1 = IdGenerationService.generateEventId(data, mockDataset as Dataset);
        const result2 = IdGenerationService.generateEventId(data, mockDataset as Dataset);

        expect(result1.contentHash).toBe(result2.contentHash);
        expect(result1.uniqueId).not.toBe(result2.uniqueId); // Unique IDs differ
      });

      it("generates different content hash for different data", () => {
        const data1 = { title: "Event1" };
        const data2 = { title: "Event2" };

        const result1 = IdGenerationService.generateEventId(data1, mockDataset as Dataset);
        const result2 = IdGenerationService.generateEventId(data2, mockDataset as Dataset);

        expect(result1.contentHash).not.toBe(result2.contentHash);
      });

      it("normalizes object key order for consistent hashing", () => {
        const data1 = { b: 2, a: 1, c: 3 };
        const data2 = { a: 1, c: 3, b: 2 };

        const result1 = IdGenerationService.generateEventId(data1, mockDataset as Dataset);
        const result2 = IdGenerationService.generateEventId(data2, mockDataset as Dataset);

        expect(result1.contentHash).toBe(result2.contentHash);
      });
    });

    describe("hybrid ID strategy", () => {
      const mockDataset: Partial<Dataset> = {
        id: mockDatasetId,
        idStrategy: {
          type: "hybrid",
          externalIdPath: "id",
          computedIdFields: [{ fieldPath: "title" }, { fieldPath: "date" }],
          duplicateStrategy: "skip",
        },
      };

      it("uses external ID when available", () => {
        const data = {
          id: "ext-123",
          title: "Test Event",
          date: "2024-03-15",
        };

        const result = IdGenerationService.generateEventId(data, mockDataset as Dataset);

        expect(result.uniqueId).toBe("123:ext:ext-123");
        expect(result.strategy).toBe("external");
      });

      it("falls back to computed ID when external missing", () => {
        const data = {
          title: "Test Event",
          date: "2024-03-15",
        };

        const result = IdGenerationService.generateEventId(data, mockDataset as Dataset);

        expect(result.uniqueId).toMatch(/^123:comp:[a-f0-9]{16}$/);
        expect(result.strategy).toBe("computed");
      });

      it("returns error when both strategies fail", () => {
        const data = {
          title: "Test Event",
          // Missing both 'id' and 'date'
        };

        const result = IdGenerationService.generateEventId(data, mockDataset as Dataset);

        expect(result.uniqueId).toMatch(/^123:error:\d+$/);
        expect(result.error).toContain("Hybrid ID generation failed");
        expect(result.error).toContain("External:");
        expect(result.error).toContain("Computed:");
      });
    });

    describe("unknown strategy", () => {
      it("returns error for unknown strategy", () => {
        const mockDataset: Partial<Dataset> = {
          id: mockDatasetId,
          idStrategy: {
            type: "unknown" as any,
            duplicateStrategy: "skip",
          },
        };

        const result = IdGenerationService.generateEventId({ id: 1 }, mockDataset as Dataset);

        expect(result.uniqueId).toMatch(/^123:error:\d+$/);
        expect(result.error).toBe("Unknown ID strategy: unknown");
      });
    });

    describe("error handling", () => {
      it("throws error when idStrategy is null or undefined", () => {
        const mockDataset: Partial<Dataset> = {
          id: mockDatasetId,
          idStrategy: null as any,
        };

        expect(() => IdGenerationService.generateEventId({ id: 1 }, mockDataset as Dataset)).toThrow(
          "Dataset idStrategy is required but was undefined"
        );
      });
    });
  });

  describe("helper methods", () => {
    it("extracts nested field values correctly", () => {
      const data = {
        level1: {
          level2: {
            level3: "value",
          },
        },
      };

      // This would be a private method, but we can test through the public API
      const mockDataset: Partial<Dataset> = {
        id: mockDatasetId,
        idStrategy: {
          type: "external",
          externalIdPath: "level1.level2.level3",
          duplicateStrategy: "skip",
        },
      };

      expect(IdGenerationService.generateEventId(data, mockDataset as Dataset)).toMatchObject({
        sourceId: "value",
      });
    });

    it("handles array notation in paths", () => {
      const data = {
        items: [{ id: "first" }, { id: "second" }],
      };

      const mockDataset: Partial<Dataset> = {
        id: mockDatasetId,
        idStrategy: {
          type: "external",
          externalIdPath: "items.0.id",
          duplicateStrategy: "skip",
        },
      };

      expect(IdGenerationService.generateEventId(data, mockDataset as Dataset)).toMatchObject({
        sourceId: "first",
      });
    });
  });

  describe("generateUniqueId wrapper", () => {
    it("throws error when external ID is missing", () => {
      const data = { name: "Test Event" }; // Missing external ID field
      const idStrategy = {
        type: "external" as const,
        externalIdPath: "id",
        duplicateStrategy: "skip" as const,
      };

      expect(() => generateUniqueId(data, idStrategy)).toThrow(
        "Failed to generate unique ID: Missing external ID at path: id"
      );
    });

    it("throws error when external ID is empty string", () => {
      const data = { id: "" }; // Empty string
      const idStrategy = {
        type: "external" as const,
        externalIdPath: "id",
        duplicateStrategy: "skip" as const,
      };

      expect(() => generateUniqueId(data, idStrategy)).toThrow(
        "Failed to generate unique ID: Missing external ID at path: id"
      );
    });

    it("throws error when external ID is null", () => {
      const data = { id: null };
      const idStrategy = {
        type: "external" as const,
        externalIdPath: "id",
        duplicateStrategy: "skip" as const,
      };

      expect(() => generateUniqueId(data, idStrategy)).toThrow(
        "Failed to generate unique ID: Missing external ID at path: id"
      );
    });

    it("throws error when computed ID fields are missing", () => {
      const data = { title: "Test" }; // Missing 'date' field
      const idStrategy = {
        type: "computed" as const,
        computedIdFields: [{ fieldPath: "title" }, { fieldPath: "date" }],
        duplicateStrategy: "skip" as const,
      };

      expect(() => generateUniqueId(data, idStrategy)).toThrow(
        "Failed to generate unique ID: Missing required fields for computed ID: date"
      );
    });

    it("succeeds when external ID is present", () => {
      const data = { id: "test-123", name: "Test Event" };
      const idStrategy = {
        type: "external" as const,
        externalIdPath: "id",
        duplicateStrategy: "skip" as const,
      };

      const result = generateUniqueId(data, idStrategy);
      expect(result).toMatch(/^undefined:ext:test-123$/);
    });

    it("succeeds with auto strategy", () => {
      const data = { name: "Test Event" };
      const idStrategy = {
        type: "auto" as const,
        duplicateStrategy: "skip" as const,
      };

      const result = generateUniqueId(data, idStrategy);
      expect(result).toMatch(/^undefined:auto:\d+:[a-f0-9]{8}$/);
    });
  });
});
