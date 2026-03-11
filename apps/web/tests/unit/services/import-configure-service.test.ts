/**
 * Unit tests for import configure service pure helpers.
 *
 * @module
 * @category Tests
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/logger", () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

vi.mock("@/lib/api", () => ({
  AppError: class AppError extends Error {
    constructor(
      public statusCode: number,
      message: string,
      public code?: string
    ) {
      super(message);
    }
  },
}));

vi.mock("@/lib/services/quota-service", () => ({
  getQuotaService: vi.fn(),
  QuotaExceededError: class QuotaExceededError extends Error {},
}));

import {
  buildDatasetMapping,
  buildFieldMappingOverrides,
  buildGeoFieldDetection,
  buildIdStrategy,
  translateSchemaMode,
} from "@/lib/services/import-configure-service";
import type { FieldMapping, SheetMapping } from "@/lib/types/import-wizard";

const fullFieldMapping: FieldMapping = {
  sheetIndex: 0,
  titleField: "Title",
  descriptionField: "Description",
  locationNameField: "Venue",
  dateField: "Date",
  idField: "ExternalId",
  idStrategy: "external",
  locationField: "Address",
  latitudeField: "Lat",
  longitudeField: "Lng",
};

const nullFieldMapping: FieldMapping = {
  sheetIndex: 0,
  titleField: null,
  descriptionField: null,
  locationNameField: null,
  dateField: null,
  idField: null,
  idStrategy: "auto",
  locationField: null,
  latitudeField: null,
  longitudeField: null,
};

describe("import-configure-service", () => {
  describe("buildFieldMappingOverrides", () => {
    it("returns empty object for undefined input", () => {
      expect(buildFieldMappingOverrides(undefined)).toEqual({});
    });

    it("maps all fields including locationNamePath", () => {
      expect(buildFieldMappingOverrides(fullFieldMapping)).toEqual({
        titlePath: "Title",
        descriptionPath: "Description",
        locationNamePath: "Venue",
        timestampPath: "Date",
        latitudePath: "Lat",
        longitudePath: "Lng",
        locationPath: "Address",
      });
    });

    it("preserves null values for unmapped fields", () => {
      const result = buildFieldMappingOverrides(nullFieldMapping);
      expect(result).toEqual({
        titlePath: null,
        descriptionPath: null,
        locationNamePath: null,
        timestampPath: null,
        latitudePath: null,
        longitudePath: null,
        locationPath: null,
      });
    });
  });

  describe("buildIdStrategy", () => {
    it("returns auto strategy when fieldMapping is undefined", () => {
      expect(buildIdStrategy(undefined, "skip")).toEqual({ type: "auto", duplicateStrategy: "skip" });
    });

    it("uses fieldMapping idStrategy and idField", () => {
      expect(buildIdStrategy(fullFieldMapping, "update")).toEqual({
        type: "external",
        externalIdPath: "ExternalId",
        duplicateStrategy: "update",
      });
    });

    it("passes through each deduplication strategy", () => {
      for (const strategy of ["skip", "update", "version"] as const) {
        expect(buildIdStrategy(undefined, strategy)).toMatchObject({ duplicateStrategy: strategy });
      }
    });

    it("includes null idField as externalIdPath", () => {
      expect(buildIdStrategy(nullFieldMapping, "skip")).toMatchObject({ externalIdPath: null });
    });
  });

  describe("buildGeoFieldDetection", () => {
    it("sets autoDetect from geocodingEnabled", () => {
      expect(buildGeoFieldDetection(undefined, true)).toMatchObject({ autoDetect: true });
      expect(buildGeoFieldDetection(undefined, false)).toMatchObject({ autoDetect: false });
    });

    it("returns undefined paths when fieldMapping is undefined", () => {
      expect(buildGeoFieldDetection(undefined, true)).toEqual({
        autoDetect: true,
        latitudePath: undefined,
        longitudePath: undefined,
      });
    });

    it("passes through lat/lng fields from fieldMapping", () => {
      expect(buildGeoFieldDetection(fullFieldMapping, true)).toEqual({
        autoDetect: true,
        latitudePath: "Lat",
        longitudePath: "Lng",
      });
    });
  });

  describe("translateSchemaMode", () => {
    it("translates strict mode", () => {
      expect(translateSchemaMode("strict")).toEqual({ locked: true, autoGrow: false, autoApproveNonBreaking: false });
    });

    it("translates additive mode", () => {
      expect(translateSchemaMode("additive")).toEqual({ locked: false, autoGrow: true, autoApproveNonBreaking: true });
    });

    it("translates flexible mode", () => {
      expect(translateSchemaMode("flexible")).toEqual({ locked: false, autoGrow: true, autoApproveNonBreaking: false });
    });

    it("defaults to additive for unknown mode", () => {
      expect(translateSchemaMode(undefined as never)).toEqual({
        locked: false,
        autoGrow: true,
        autoApproveNonBreaking: true,
      });
    });
  });

  describe("buildDatasetMapping", () => {
    const singleSheet: SheetMapping[] = [{ sheetIndex: 0, datasetId: 1, newDatasetName: "" }];
    const multiSheet: SheetMapping[] = [
      { sheetIndex: 0, datasetId: 1, newDatasetName: "" },
      { sheetIndex: 1, datasetId: 2, newDatasetName: "" },
    ];

    it("returns single mapping for one sheet", () => {
      const entries = [{ sheetIdentifier: "0", dataset: 42, skipIfMissing: false }];
      expect(buildDatasetMapping(singleSheet, entries)).toEqual({ mappingType: "single", singleDataset: 42 });
    });

    it("returns multiple mapping for multiple sheets", () => {
      const entries = [
        { sheetIdentifier: "0", dataset: 42, skipIfMissing: false },
        { sheetIdentifier: "1", dataset: 43, skipIfMissing: false },
      ];
      expect(buildDatasetMapping(multiSheet, entries)).toEqual({ mappingType: "multiple", sheetMappings: entries });
    });
  });
});
