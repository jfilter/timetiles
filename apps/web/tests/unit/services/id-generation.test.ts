import { describe, expect, it } from "vitest";

import { IdGenerationService } from "../../../lib/services/id-generation";
import type { Dataset } from "../../../payload-types";

describe("IdGenerationService", () => {
  const mockDatasetId = 123;
  const mockImportId = "import-456";

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

        const result = IdGenerationService.generateEventId(data, mockDataset as Dataset, mockImportId);

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

        const result = IdGenerationService.generateEventId(data, datasetWithNestedPath as Dataset, mockImportId);

        expect(result.uniqueId).toBe("123:ext:uuid-789");
        expect(result.sourceId).toBe("uuid-789");
      });

      it("returns error for missing external ID", () => {
        const data = { name: "Test Event" }; // Missing 'id' field

        const result = IdGenerationService.generateEventId(data, mockDataset as Dataset, mockImportId);

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
          const result = IdGenerationService.generateEventId(data, mockDataset as Dataset, mockImportId);

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
          const result = IdGenerationService.generateEventId(testCase, mockDataset as Dataset, mockImportId);

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

        const result = IdGenerationService.generateEventId(data, mockDataset as Dataset, mockImportId);

        expect(result.uniqueId).toMatch(/^123:comp:[a-f0-9]{16}$/);
        expect(result.strategy).toBe("computed");
        expect(result.sourceId).toBeUndefined();
      });

      it("generates consistent hash for same values", () => {
        const data1 = { title: "Event", date: "2024-03-15" };
        const data2 = { title: "Event", date: "2024-03-15", extra: "ignored" };

        const result1 = IdGenerationService.generateEventId(data1, mockDataset as Dataset, mockImportId);
        const result2 = IdGenerationService.generateEventId(data2, mockDataset as Dataset, mockImportId);

        expect(result1.uniqueId).toBe(result2.uniqueId);
      });

      it("generates different hash for different values", () => {
        const data1 = { title: "Event1", date: "2024-03-15" };
        const data2 = { title: "Event2", date: "2024-03-15" };

        const result1 = IdGenerationService.generateEventId(data1, mockDataset as Dataset, mockImportId);
        const result2 = IdGenerationService.generateEventId(data2, mockDataset as Dataset, mockImportId);

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

        const result = IdGenerationService.generateEventId(data, datasetWithNestedFields as Dataset, mockImportId);

        expect(result.uniqueId).toMatch(/^123:comp:[a-f0-9]{16}$/);
        expect(result.error).toBeUndefined();
      });

      it("returns error for missing required fields", () => {
        const data = { title: "Test Event" }; // Missing 'date' field

        const result = IdGenerationService.generateEventId(data, mockDataset as Dataset, mockImportId);

        expect(result.uniqueId).toMatch(/^123:error:\d+$/);
        expect(result.error).toBe("Missing required fields for computed ID: date");
      });

      it("handles null and undefined values", () => {
        const data = { title: null, date: undefined };

        const result = IdGenerationService.generateEventId(data, mockDataset as Dataset, mockImportId);

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

        const result = IdGenerationService.generateEventId(data, mockDataset as Dataset, mockImportId);

        expect(result.uniqueId).toMatch(/^123:auto:\d+:[a-z0-9]{6}$/);
        expect(result.contentHash).toMatch(/^[a-f0-9]{64}$/); // SHA256 hash
        expect(result.strategy).toBe("auto");
      });

      it("generates consistent content hash for same data", () => {
        const data = { title: "Test", value: 123 };

        const result1 = IdGenerationService.generateEventId(data, mockDataset as Dataset, mockImportId);
        const result2 = IdGenerationService.generateEventId(data, mockDataset as Dataset, mockImportId);

        expect(result1.contentHash).toBe(result2.contentHash);
        expect(result1.uniqueId).not.toBe(result2.uniqueId); // Unique IDs differ
      });

      it("generates different content hash for different data", () => {
        const data1 = { title: "Event1" };
        const data2 = { title: "Event2" };

        const result1 = IdGenerationService.generateEventId(data1, mockDataset as Dataset, mockImportId);
        const result2 = IdGenerationService.generateEventId(data2, mockDataset as Dataset, mockImportId);

        expect(result1.contentHash).not.toBe(result2.contentHash);
      });

      it("normalizes object key order for consistent hashing", () => {
        const data1 = { b: 2, a: 1, c: 3 };
        const data2 = { a: 1, c: 3, b: 2 };

        const result1 = IdGenerationService.generateEventId(data1, mockDataset as Dataset, mockImportId);
        const result2 = IdGenerationService.generateEventId(data2, mockDataset as Dataset, mockImportId);

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

        const result = IdGenerationService.generateEventId(data, mockDataset as Dataset, mockImportId);

        expect(result.uniqueId).toBe("123:ext:ext-123");
        expect(result.strategy).toBe("external");
      });

      it("falls back to computed ID when external missing", () => {
        const data = {
          title: "Test Event",
          date: "2024-03-15",
        };

        const result = IdGenerationService.generateEventId(data, mockDataset as Dataset, mockImportId);

        expect(result.uniqueId).toMatch(/^123:comp:[a-f0-9]{16}$/);
        expect(result.strategy).toBe("computed");
      });

      it("returns error when both strategies fail", () => {
        const data = {
          title: "Test Event",
          // Missing both 'id' and 'date'
        };

        const result = IdGenerationService.generateEventId(data, mockDataset as Dataset, mockImportId);

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

        const result = IdGenerationService.generateEventId({ id: 1 }, mockDataset as Dataset, mockImportId);

        expect(result.uniqueId).toMatch(/^123:error:\d+$/);
        expect(result.error).toBe("Unknown ID strategy: unknown");
      });
    });

    describe("error handling", () => {
      it("catches and returns exceptions", () => {
        const mockDataset: Partial<Dataset> = {
          id: mockDatasetId,
          idStrategy: null as any, // Will cause error
        };

        const result = IdGenerationService.generateEventId({ id: 1 }, mockDataset as Dataset, mockImportId);

        expect(result.uniqueId).toMatch(/^123:auto:\d+$/);
        expect(result.strategy).toBe("auto");
        expect(result.error).toBeUndefined();
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

      expect(IdGenerationService.generateEventId(data, mockDataset as Dataset, mockImportId)).toMatchObject({
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

      expect(IdGenerationService.generateEventId(data, mockDataset as Dataset, mockImportId)).toMatchObject({
        sourceId: "first",
      });
    });
  });
});
