/**
 * Unit tests for import configure service pure helpers.
 *
 * @module
 * @category Tests
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import type { Payload } from "payload";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/logger", () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

vi.mock("@/lib/services/quota-service", () => ({ createQuotaService: vi.fn() }));

import {
  buildDatasetMapping,
  buildFieldMappingOverrides,
  buildGeoFieldDetection,
  buildIdStrategy,
  buildWizardProcessingOptions,
  createIngestFileRecord,
  translateSchemaMode,
} from "@/lib/ingest/configure-service";
import type {
  ConfigureIngestRequest,
  CreateScheduleConfig,
  FieldMapping,
  PreviewMetadata,
  SheetMapping,
} from "@/lib/ingest/types/wizard";
import type { User } from "@/payload-types";

const fullFieldMapping: FieldMapping = {
  sheetIndex: 0,
  titleField: "Title",
  descriptionField: "Description",
  locationNameField: "Venue",
  dateField: "Date",
  endDateField: null,
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
  endDateField: null,
  idField: null,
  idStrategy: "content-hash",
  locationField: null,
  latitudeField: null,
  longitudeField: null,
};

describe("import-configure-service", () => {
  describe("buildFieldMappingOverrides", () => {
    it("returns empty object for undefined input", () => {
      expect(buildFieldMappingOverrides(undefined)).toEqual({});
    });

    it("maps all fields including endTimestampPath and locationNamePath", () => {
      expect(buildFieldMappingOverrides(fullFieldMapping)).toEqual({
        titlePath: "Title",
        descriptionPath: "Description",
        locationNamePath: "Venue",
        timestampPath: "Date",
        endTimestampPath: null,
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
        endTimestampPath: null,
        latitudePath: null,
        longitudePath: null,
        locationPath: null,
      });
    });
  });

  describe("buildIdStrategy", () => {
    it("returns auto strategy when fieldMapping is undefined", () => {
      expect(buildIdStrategy(undefined, "skip")).toEqual({ type: "content-hash", duplicateStrategy: "skip" });
    });

    it("uses fieldMapping idStrategy and idField", () => {
      expect(buildIdStrategy(fullFieldMapping, "update")).toEqual({
        type: "external",
        externalIdPath: "ExternalId",
        duplicateStrategy: "update",
      });
    });

    it("passes through each deduplication strategy", () => {
      for (const strategy of ["skip", "update"] as const) {
        expect(buildIdStrategy(undefined, strategy)).toMatchObject({ duplicateStrategy: strategy });
      }
    });

    it("maps removed 'version' strategy to 'skip'", () => {
      expect(buildIdStrategy(undefined, "version" as any)).toMatchObject({ duplicateStrategy: "skip" });
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

    it("translates flexible mode (same dataset-fallback shape as additive)", () => {
      // Flexible's mode-specific permissiveness lives in `evaluateSchemaMode`,
      // not in the dataset-level fallback config. At the dataset config layer,
      // flexible must look identical to additive — otherwise a missing
      // `processingOptions.schemaMode` escalates harmlessly compatible runs
      // to "needs review" via `checkRequiresApproval`.
      expect(translateSchemaMode("flexible")).toEqual({ locked: false, autoGrow: true, autoApproveNonBreaking: true });
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

  describe("buildWizardProcessingOptions", () => {
    const baseSchedule: CreateScheduleConfig = {
      enabled: true,
      sourceUrl: "https://example.com/data.csv",
      name: "Daily refresh",
      scheduleType: "frequency",
      frequency: "daily",
      schemaMode: "flexible",
    };

    it("returns undefined when scheduleConfig is undefined (one-off upload)", () => {
      expect(buildWizardProcessingOptions(undefined)).toBeUndefined();
    });

    it("returns undefined when scheduling is disabled", () => {
      expect(buildWizardProcessingOptions({ ...baseSchedule, enabled: false })).toBeUndefined();
    });

    it("propagates flexible schemaMode when scheduling is enabled", () => {
      expect(buildWizardProcessingOptions(baseSchedule)).toEqual({
        skipDuplicateChecking: false,
        autoApproveSchema: false,
        schemaMode: "flexible",
      });
    });

    it("propagates strict schemaMode when scheduling is enabled", () => {
      expect(buildWizardProcessingOptions({ ...baseSchedule, schemaMode: "strict" })).toEqual({
        skipDuplicateChecking: false,
        autoApproveSchema: false,
        schemaMode: "strict",
      });
    });

    it("propagates additive schemaMode when scheduling is enabled", () => {
      expect(buildWizardProcessingOptions({ ...baseSchedule, schemaMode: "additive" })).toEqual({
        skipDuplicateChecking: false,
        autoApproveSchema: false,
        schemaMode: "additive",
      });
    });
  });

  // sequential because the spies/payload stub are reassigned in beforeEach;
  // the global vitest config runs tests concurrently within a describe.
  describe.sequential("createIngestFileRecord", () => {
    let tmpDir: string;
    let tmpFilePath: string;
    let mockPayload: Payload;
    let createSpy: ReturnType<typeof vi.fn>;

    const user = { id: 7, email: "wizard@example.com" } as User;

    const buildPreviewMeta = (originalName: string, filePath: string): PreviewMetadata => ({
      previewId: "11111111-1111-4111-8111-111111111111",
      userId: user.id,
      originalName,
      filePath,
      mimeType: "text/csv",
      fileSize: 0,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    });

    const buildBody = (createSchedule?: ConfigureIngestRequest["createSchedule"]): ConfigureIngestRequest => ({
      previewId: "11111111-1111-4111-8111-111111111111",
      catalogId: 1,
      sheetMappings: [{ sheetIndex: 0, datasetId: 1, newDatasetName: "" }],
      fieldMappings: [],
      deduplicationStrategy: "skip",
      geocodingEnabled: true,
      createSchedule,
    });

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ingest-configure-test-"));
      tmpFilePath = path.join(tmpDir, "data.csv");
      fs.writeFileSync(tmpFilePath, "id,title\n1,Test\n");

      createSpy = vi.fn().mockResolvedValue({ id: 555 });
      mockPayload = { create: createSpy } as unknown as Payload;
    });

    afterEach(() => {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it("first-run with scheduling enabled persists schemaMode='flexible' on processingOptions", async () => {
      const previewMeta = buildPreviewMeta("data.csv", tmpFilePath);
      const body = buildBody({
        enabled: true,
        sourceUrl: "https://example.com/data.csv",
        name: "Daily",
        scheduleType: "frequency",
        frequency: "daily",
        schemaMode: "flexible",
      });

      await createIngestFileRecord(mockPayload, user, previewMeta, body, 1, new Map([[0, 42]]), [
        { sheetIdentifier: "0", dataset: 42, skipIfMissing: false },
      ]);

      expect(createSpy).toHaveBeenCalledTimes(1);
      const call = createSpy.mock.calls[0]?.[0];
      expect(call.collection).toBe("ingest-files");
      expect(call.data.processingOptions).toEqual({
        skipDuplicateChecking: false,
        autoApproveSchema: false,
        schemaMode: "flexible",
      });
    });

    it("first-run without scheduling does not set processingOptions", async () => {
      const previewMeta = buildPreviewMeta("data.csv", tmpFilePath);
      const body = buildBody();

      await createIngestFileRecord(mockPayload, user, previewMeta, body, 1, new Map([[0, 42]]), [
        { sheetIdentifier: "0", dataset: 42, skipIfMissing: false },
      ]);

      const call = createSpy.mock.calls[0]?.[0];
      expect(call.data.processingOptions).toBeUndefined();
    });

    it("first-run with scheduling disabled does not set processingOptions", async () => {
      const previewMeta = buildPreviewMeta("data.csv", tmpFilePath);
      const body = buildBody({
        enabled: false,
        sourceUrl: "",
        name: "Off",
        scheduleType: "frequency",
        frequency: "daily",
        schemaMode: "flexible",
      });

      await createIngestFileRecord(mockPayload, user, previewMeta, body, 1, new Map([[0, 42]]), [
        { sheetIdentifier: "0", dataset: 42, skipIfMissing: false },
      ]);

      const call = createSpy.mock.calls[0]?.[0];
      expect(call.data.processingOptions).toBeUndefined();
    });

    it("propagates strict schemaMode through to the persisted ingest-file", async () => {
      const previewMeta = buildPreviewMeta("data.csv", tmpFilePath);
      const body = buildBody({
        enabled: true,
        sourceUrl: "https://example.com/data.csv",
        name: "Strict",
        scheduleType: "frequency",
        frequency: "daily",
        schemaMode: "strict",
      });

      await createIngestFileRecord(mockPayload, user, previewMeta, body, 1, new Map([[0, 42]]), [
        { sheetIdentifier: "0", dataset: 42, skipIfMissing: false },
      ]);

      const call = createSpy.mock.calls[0]?.[0];
      expect(call.data.processingOptions.schemaMode).toBe("strict");
    });
  });
});
