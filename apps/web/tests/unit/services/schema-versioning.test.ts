import { beforeEach, describe, expect, it, vi } from "vitest";

import { SchemaVersioningService } from "@/lib/services/schema-versioning";
import type { Dataset, DatasetSchema } from "@/payload-types";

describe("SchemaVersioningService", () => {
  let mockPayload: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockPayload = {
      find: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    };
  });

  describe("getNextSchemaVersion", () => {
    it("should return 1 for first schema version when no existing schemas", async () => {
      mockPayload.find.mockResolvedValueOnce({ docs: [] });

      const result = await SchemaVersioningService.getNextSchemaVersion(mockPayload, 123);

      expect(result).toBe(1);
      expect(mockPayload.find).toHaveBeenCalledWith({
        collection: "dataset-schemas",
        where: {
          dataset: { equals: 123 },
        },
        sort: "-versionNumber",
        limit: 1,
      });
    });

    it("should return incremented version number when existing schemas exist", async () => {
      mockPayload.find.mockResolvedValueOnce({
        docs: [{ versionNumber: 3 }],
      });

      const result = await SchemaVersioningService.getNextSchemaVersion(mockPayload, 456);

      expect(result).toBe(4);
      expect(mockPayload.find).toHaveBeenCalledWith({
        collection: "dataset-schemas",
        where: {
          dataset: { equals: 456 },
        },
        sort: "-versionNumber",
        limit: 1,
      });
    });

    it("should handle string dataset ID by converting to number", async () => {
      mockPayload.find.mockResolvedValueOnce({
        docs: [{ versionNumber: 5 }],
      });

      const result = await SchemaVersioningService.getNextSchemaVersion(mockPayload, "789");

      expect(result).toBe(6);
      expect(mockPayload.find).toHaveBeenCalledWith({
        collection: "dataset-schemas",
        where: {
          dataset: { equals: 789 },
        },
        sort: "-versionNumber",
        limit: 1,
      });
    });

    it("should handle case when versionNumber is undefined", async () => {
      mockPayload.find.mockResolvedValueOnce({
        docs: [{ versionNumber: undefined }],
      });

      const result = await SchemaVersioningService.getNextSchemaVersion(mockPayload, 123);

      expect(result).toBe(1);
    });
  });

  describe("createSchemaVersion", () => {
    it("should create schema version with dataset object", async () => {
      // Mock getNextSchemaVersion to return predictable version
      vi.spyOn(SchemaVersioningService, "getNextSchemaVersion").mockResolvedValue(2);

      const mockDataset = { id: 123, name: "Test Dataset" } as Dataset;
      const mockSchema = {
        type: "object",
        properties: {
          id: { type: "string" },
          title: { type: "string" },
        },
        required: ["id", "title"],
      };

      const mockCreatedSchema = {
        id: 456,
        dataset: 123,
        versionNumber: 2,
        schema: mockSchema,
        fieldMetadata: {},
        updatedAt: "2023-01-01T00:00:00.000Z",
        createdAt: "2023-01-01T00:00:00.000Z",
      } as DatasetSchema;

      mockPayload.create.mockResolvedValueOnce(mockCreatedSchema);

      const result = await SchemaVersioningService.createSchemaVersion(mockPayload, {
        dataset: mockDataset,
        schema: mockSchema,
        autoApproved: true,
        approvedBy: 1,
      });

      expect(result).toEqual(mockCreatedSchema);
      expect(mockPayload.create).toHaveBeenCalledWith({
        collection: "dataset-schemas",
        data: {
          dataset: 123,
          versionNumber: 2,
          schema: mockSchema,
          fieldMetadata: {},
          autoApproved: true,
          approvedBy: 1,
          importSources: [],
          _status: "published",
        },
      });
    });

    it("should create schema version with string dataset ID", async () => {
      // Mock getNextSchemaVersion to return predictable version
      vi.spyOn(SchemaVersioningService, "getNextSchemaVersion").mockResolvedValue(2);

      const mockSchema = { type: "object", properties: {} };
      const mockFieldMetadata = {
        id: { occurrences: 100, uniqueValues: 100 },
        title: { occurrences: 100, uniqueValues: 95 },
      };

      const mockCreatedSchema = {
        id: 789,
        dataset: 456,
        versionNumber: 2,
        schema: mockSchema,
        fieldMetadata: mockFieldMetadata,
        updatedAt: "2023-01-01T00:00:00.000Z",
        createdAt: "2023-01-01T00:00:00.000Z",
      } as DatasetSchema;

      mockPayload.create.mockResolvedValueOnce(mockCreatedSchema);

      const result = await SchemaVersioningService.createSchemaVersion(mockPayload, {
        dataset: "456",
        schema: mockSchema,
        fieldMetadata: mockFieldMetadata,
        autoApproved: false,
        approvedBy: "2",
        importSources: [
          {
            import: "123",
            recordCount: 500,
            batchCount: 5,
          },
        ],
      });

      expect(result).toEqual(mockCreatedSchema);
      expect(mockPayload.create).toHaveBeenCalledWith({
        collection: "dataset-schemas",
        data: {
          dataset: 456,
          versionNumber: 2,
          schema: mockSchema,
          fieldMetadata: mockFieldMetadata,
          autoApproved: false,
          approvedBy: 2,
          importSources: [
            {
              import: 123,
              recordCount: 500,
              batchCount: 5,
            },
          ],
          _status: "published",
        },
      });
    });

    it("should create schema version with numeric dataset ID", async () => {
      // Reset all mocks before this test
      vi.clearAllMocks();

      // Mock getNextSchemaVersion to return predictable version
      vi.spyOn(SchemaVersioningService, "getNextSchemaVersion").mockResolvedValue(2);

      const mockSchema = { type: "object" };
      const mockCreatedSchema = {
        id: 123,
        dataset: 789,
        versionNumber: 2,
        schema: mockSchema,
        fieldMetadata: {},
        updatedAt: "2023-01-01T00:00:00.000Z",
        createdAt: "2023-01-01T00:00:00.000Z",
      } as DatasetSchema;

      mockPayload.create.mockResolvedValueOnce(mockCreatedSchema);

      const result = await SchemaVersioningService.createSchemaVersion(mockPayload, {
        dataset: 789,
        schema: mockSchema,
      });

      expect(result).toEqual(mockCreatedSchema);
      expect(mockPayload.create).toHaveBeenCalledWith({
        collection: "dataset-schemas",
        data: {
          dataset: 789,
          versionNumber: 2,
          schema: mockSchema,
          fieldMetadata: {},
          autoApproved: false,
          approvedBy: undefined,
          importSources: [],
          _status: "published",
        },
      });
    });

    it("should handle import sources with numeric import IDs", async () => {
      // Reset all mocks before this test
      vi.clearAllMocks();

      // Mock getNextSchemaVersion to return predictable version
      vi.spyOn(SchemaVersioningService, "getNextSchemaVersion").mockResolvedValue(2);

      const mockSchema = { type: "object" };
      const mockCreatedSchema = {
        id: 456,
        dataset: 111,
        versionNumber: 2,
        schema: mockSchema,
        fieldMetadata: {},
        updatedAt: "2023-01-01T00:00:00.000Z",
        createdAt: "2023-01-01T00:00:00.000Z",
      } as DatasetSchema;

      mockPayload.create.mockResolvedValueOnce(mockCreatedSchema);

      const result = await SchemaVersioningService.createSchemaVersion(mockPayload, {
        dataset: 111,
        schema: mockSchema,
        importSources: [
          {
            import: 222,
            recordCount: 1000,
          },
          {
            import: 333,
            batchCount: 10,
          },
        ],
      });

      expect(result).toEqual(mockCreatedSchema);
      expect(mockPayload.create).toHaveBeenCalledWith({
        collection: "dataset-schemas",
        data: {
          dataset: 111,
          versionNumber: 2,
          schema: mockSchema,
          fieldMetadata: {},
          autoApproved: false,
          approvedBy: undefined,
          importSources: [
            {
              import: 222,
              recordCount: 1000,
            },
            {
              import: 333,
              batchCount: 10,
            },
          ],
          _status: "published",
        },
      });
    });

    it("should handle null approvedBy value", async () => {
      // Reset all mocks before this test
      vi.clearAllMocks();

      // Mock getNextSchemaVersion to return predictable version
      vi.spyOn(SchemaVersioningService, "getNextSchemaVersion").mockResolvedValue(2);

      const mockSchema = { type: "object" };
      const mockCreatedSchema = {
        id: 789,
        dataset: 999,
        versionNumber: 2,
        schema: mockSchema,
        fieldMetadata: {},
        updatedAt: "2023-01-01T00:00:00.000Z",
        createdAt: "2023-01-01T00:00:00.000Z",
      } as DatasetSchema;

      mockPayload.create.mockResolvedValueOnce(mockCreatedSchema);

      const result = await SchemaVersioningService.createSchemaVersion(mockPayload, {
        dataset: 999,
        schema: mockSchema,
        approvedBy: null,
      });

      expect(result).toEqual(mockCreatedSchema);
      expect(mockPayload.create).toHaveBeenCalledWith({
        collection: "dataset-schemas",
        data: {
          dataset: 999,
          versionNumber: 2,
          schema: mockSchema,
          fieldMetadata: {},
          autoApproved: false,
          approvedBy: null,
          importSources: [],
          _status: "published",
        },
      });
    });
  });

  describe("linkImportToSchemaVersion", () => {
    it("should link import job to schema version with string IDs", async () => {
      mockPayload.update.mockResolvedValueOnce({});

      await SchemaVersioningService.linkImportToSchemaVersion(mockPayload, "123", "456");

      expect(mockPayload.update).toHaveBeenCalledWith({
        collection: "import-jobs",
        id: 123,
        data: {
          datasetSchemaVersion: 456,
        },
      });
    });

    it("should link import job to schema version with numeric IDs", async () => {
      mockPayload.update.mockResolvedValueOnce({});

      await SchemaVersioningService.linkImportToSchemaVersion(mockPayload, 789, 101112);

      expect(mockPayload.update).toHaveBeenCalledWith({
        collection: "import-jobs",
        id: 789,
        data: {
          datasetSchemaVersion: 101112,
        },
      });
    });

    it("should link import job to schema version with mixed ID types", async () => {
      mockPayload.update.mockResolvedValueOnce({});

      await SchemaVersioningService.linkImportToSchemaVersion(mockPayload, "555", 666);

      expect(mockPayload.update).toHaveBeenCalledWith({
        collection: "import-jobs",
        id: 555,
        data: {
          datasetSchemaVersion: 666,
        },
      });
    });

    it("should handle update operation errors gracefully", async () => {
      const mockError = new Error("Database update failed");
      mockPayload.update.mockRejectedValueOnce(mockError);

      await expect(SchemaVersioningService.linkImportToSchemaVersion(mockPayload, 123, 456)).rejects.toThrow(
        "Database update failed",
      );

      expect(mockPayload.update).toHaveBeenCalledWith({
        collection: "import-jobs",
        id: 123,
        data: {
          datasetSchemaVersion: 456,
        },
      });
    });
  });

  describe("Integration scenarios", () => {
    it("should handle complete schema versioning workflow", async () => {
      // Mock getNextSchemaVersion
      vi.spyOn(SchemaVersioningService, "getNextSchemaVersion").mockResolvedValue(3);

      const mockSchema = {
        type: "object",
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          createdAt: { type: "string" },
        },
        required: ["id", "name"],
      };

      const mockCreatedSchema = {
        id: 999,
        dataset: 888,
        versionNumber: 3,
        schema: mockSchema,
        fieldMetadata: {
          id: { occurrences: 200, uniqueValues: 200 },
          name: { occurrences: 200, uniqueValues: 180 },
          createdAt: { occurrences: 200, uniqueValues: 200 },
        },
        updatedAt: "2023-01-01T00:00:00.000Z",
        createdAt: "2023-01-01T00:00:00.000Z",
      } as DatasetSchema;

      mockPayload.create.mockResolvedValueOnce(mockCreatedSchema);
      mockPayload.update.mockResolvedValueOnce({});

      // Create schema version
      const schemaVersion = await SchemaVersioningService.createSchemaVersion(mockPayload, {
        dataset: 888,
        schema: mockSchema,
        fieldMetadata: {
          id: { occurrences: 200, uniqueValues: 200 },
          name: { occurrences: 200, uniqueValues: 180 },
          createdAt: { occurrences: 200, uniqueValues: 200 },
        },
        autoApproved: true,
        approvedBy: 1,
        importSources: [
          {
            import: 777,
            recordCount: 200,
            batchCount: 4,
          },
        ],
      });

      // Link import to schema version
      await SchemaVersioningService.linkImportToSchemaVersion(mockPayload, 777, schemaVersion.id);

      expect(schemaVersion).toEqual(mockCreatedSchema);
      expect(mockPayload.create).toHaveBeenCalledWith({
        collection: "dataset-schemas",
        data: {
          dataset: 888,
          versionNumber: 3,
          schema: mockSchema,
          fieldMetadata: {
            id: { occurrences: 200, uniqueValues: 200 },
            name: { occurrences: 200, uniqueValues: 180 },
            createdAt: { occurrences: 200, uniqueValues: 200 },
          },
          autoApproved: true,
          approvedBy: 1,
          importSources: [
            {
              import: 777,
              recordCount: 200,
              batchCount: 4,
            },
          ],
          _status: "published",
        },
      });

      expect(mockPayload.update).toHaveBeenCalledWith({
        collection: "import-jobs",
        id: 777,
        data: {
          datasetSchemaVersion: 999,
        },
      });
    });
  });
});
