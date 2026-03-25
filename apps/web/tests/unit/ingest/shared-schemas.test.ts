/**
 * Unit tests for shared ingest Zod schemas.
 *
 * Verifies that the schemas extracted into shared-schemas.ts correctly
 * validate the same inputs as the original inline schemas, and that
 * the pagination field naming is consistent across create and update flows.
 *
 * @module
 * @category Tests
 */
import { describe, expect, it } from "vitest";

import {
  authConfigSchema,
  fieldMappingsSchema,
  jsonApiConfigSchema,
  jsonApiPaginationSchema,
  scheduleConfigSchema,
  sheetMappingsSchema,
  transformsSchema,
} from "@/lib/ingest/shared-schemas";

describe("shared-schemas", () => {
  describe("sheetMappingsSchema", () => {
    it("accepts valid sheet mappings", () => {
      const result = sheetMappingsSchema.safeParse([{ sheetIndex: 0, datasetId: "new", newDatasetName: "My Dataset" }]);
      expect(result.success).toBe(true);
    });

    it("rejects empty array", () => {
      const result = sheetMappingsSchema.safeParse([]);
      expect(result.success).toBe(false);
    });

    it("accepts numeric datasetId for existing datasets", () => {
      const result = sheetMappingsSchema.safeParse([{ sheetIndex: 0, datasetId: 42, newDatasetName: "Existing" }]);
      expect(result.success).toBe(true);
    });
  });

  describe("fieldMappingsSchema", () => {
    it("accepts valid field mappings", () => {
      const result = fieldMappingsSchema.safeParse([
        {
          sheetIndex: 0,
          titleField: "name",
          descriptionField: null,
          dateField: "date",
          idField: null,
          idStrategy: "content-hash",
          locationField: "address",
          latitudeField: null,
          longitudeField: null,
        },
      ]);
      expect(result.success).toBe(true);
    });

    it("defaults locationNameField to null", () => {
      const result = fieldMappingsSchema.safeParse([
        {
          sheetIndex: 0,
          titleField: "name",
          descriptionField: null,
          dateField: "date",
          idField: null,
          idStrategy: "content-hash",
          locationField: null,
          latitudeField: null,
          longitudeField: null,
        },
      ]);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data[0]!.locationNameField).toBeNull();
      }
    });
  });

  describe("jsonApiPaginationSchema — field naming consistency", () => {
    it("accepts limitParam and limitValue (not pageSizeParam/pageSize)", () => {
      const result = jsonApiPaginationSchema.safeParse({
        enabled: true,
        type: "offset",
        pageParam: "page",
        limitParam: "limit",
        limitValue: 100,
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toHaveProperty("limitParam", "limit");
        expect(result.data).toHaveProperty("limitValue", 100);
      }
    });

    it("rejects limitValue above 10000", () => {
      const result = jsonApiPaginationSchema.safeParse({ enabled: true, limitValue: 50000 });
      expect(result.success).toBe(false);
    });

    it("rejects limitValue below 1", () => {
      const result = jsonApiPaginationSchema.safeParse({ enabled: true, limitValue: 0 });
      expect(result.success).toBe(false);
    });

    it("rejects maxPages above 500", () => {
      const result = jsonApiPaginationSchema.safeParse({ enabled: true, maxPages: 1000 });
      expect(result.success).toBe(false);
    });

    it("does NOT accept pageSizeParam/pageSize (old field names)", () => {
      const result = jsonApiPaginationSchema.safeParse({ enabled: true, pageSizeParam: "page_size", pageSize: 25 });
      // Should parse successfully (extra fields are stripped), but the old fields should not appear
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).not.toHaveProperty("pageSizeParam");
        expect(result.data).not.toHaveProperty("pageSize");
      }
    });
  });

  describe("authConfigSchema", () => {
    it("accepts none type", () => {
      const result = authConfigSchema.safeParse({ type: "none" });
      expect(result.success).toBe(true);
    });

    it("accepts api-key with credentials", () => {
      const result = authConfigSchema.safeParse({ type: "api-key", apiKey: "my-key", apiKeyHeader: "X-API-Key" });
      expect(result.success).toBe(true);
    });

    it("is optional (undefined passes)", () => {
      const result = authConfigSchema.safeParse(undefined);
      expect(result.success).toBe(true);
    });
  });

  describe("scheduleConfigSchema", () => {
    it("accepts valid schedule config", () => {
      const result = scheduleConfigSchema.safeParse({
        name: "Daily Import",
        scheduleType: "frequency",
        frequency: "daily",
        schemaMode: "strict",
      });
      expect(result.success).toBe(true);
    });

    it("rejects empty name", () => {
      const result = scheduleConfigSchema.safeParse({ name: "", scheduleType: "frequency", schemaMode: "strict" });
      expect(result.success).toBe(false);
    });

    it("accepts cron schedule type", () => {
      const result = scheduleConfigSchema.safeParse({
        name: "Cron Import",
        scheduleType: "cron",
        cronExpression: "0 */6 * * *",
        schemaMode: "additive",
      });
      expect(result.success).toBe(true);
    });
  });

  describe("transformsSchema", () => {
    it("accepts valid transforms", () => {
      const result = transformsSchema.safeParse([
        {
          sheetIndex: 0,
          transforms: [{ id: "t1", type: "rename", active: true, autoDetected: false, from: "old", to: "new" }],
        },
      ]);
      expect(result.success).toBe(true);
    });

    it("is optional (undefined passes)", () => {
      const result = transformsSchema.safeParse(undefined);
      expect(result.success).toBe(true);
    });

    it("rejects invalid transform type", () => {
      const result = transformsSchema.safeParse([
        { sheetIndex: 0, transforms: [{ id: "t1", type: "invalid", active: true, autoDetected: false }] },
      ]);
      expect(result.success).toBe(false);
    });
  });

  describe("jsonApiConfigSchema", () => {
    it("accepts config with pagination", () => {
      const result = jsonApiConfigSchema.safeParse({
        recordsPath: "data.results",
        pagination: {
          enabled: true,
          type: "offset",
          pageParam: "page",
          limitParam: "limit",
          limitValue: 100,
          maxPages: 10,
        },
      });
      expect(result.success).toBe(true);
    });

    it("is optional (undefined passes)", () => {
      const result = jsonApiConfigSchema.safeParse(undefined);
      expect(result.success).toBe(true);
    });
  });
});
