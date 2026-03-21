/**
 * Service functions for the import configuration workflow.
 *
 * Extracts Payload-dependent orchestration logic from the configure-import
 * API route into a testable service layer. Also contains pure helper functions
 * for building dataset mappings, field mapping overrides, ID strategies, and
 * geo field detection config used during import configuration.
 *
 * @module
 * @category Services
 */
import fs from "node:fs";

import type { NextRequest } from "next/server";
import type { Payload } from "payload";

import { AppError } from "@/lib/api";
import { createLogger } from "@/lib/logger";
import { createQuotaService, QuotaExceededError } from "@/lib/services/quota-service";
import type { ImportTransform } from "@/lib/types/import-transforms";
import type {
  ConfigureImportRequest,
  CreateScheduleConfig,
  DatasetMappingEntry,
  FieldMapping,
  PreviewMetadata,
  SheetMapping,
} from "@/lib/types/import-wizard";
import type { Dataset, User } from "@/payload-types";

const logger = createLogger("import-configure-service");

// Build field mapping overrides from wizard configuration
export const buildFieldMappingOverrides = (fieldMapping: FieldMapping | undefined) => {
  if (!fieldMapping) return {};
  return {
    titlePath: fieldMapping.titleField,
    descriptionPath: fieldMapping.descriptionField,
    locationNamePath: fieldMapping.locationNameField,
    timestampPath: fieldMapping.dateField,
    latitudePath: fieldMapping.latitudeField,
    longitudePath: fieldMapping.longitudeField,
    locationPath: fieldMapping.locationField,
  };
};

// Build ID strategy configuration
export const buildIdStrategy = (
  fieldMapping: FieldMapping | undefined,
  deduplicationStrategy: ConfigureImportRequest["deduplicationStrategy"]
) => {
  if (!fieldMapping) {
    return { type: "auto" as const, duplicateStrategy: deduplicationStrategy };
  }
  return {
    type: fieldMapping.idStrategy,
    externalIdPath: fieldMapping.idField,
    duplicateStrategy: deduplicationStrategy,
  };
};

// Build geo field detection config
export const buildGeoFieldDetection = (fieldMapping: FieldMapping | undefined, geocodingEnabled: boolean) => ({
  autoDetect: geocodingEnabled,
  latitudePath: fieldMapping?.latitudeField ?? undefined,
  longitudePath: fieldMapping?.longitudeField ?? undefined,
});

// Build dataset mapping metadata for the import job
export const buildDatasetMapping = (sheetMappings: SheetMapping[], datasetMappingEntries: DatasetMappingEntry[]) => {
  if (sheetMappings.length === 1) {
    return { mappingType: "single", singleDataset: datasetMappingEntries[0]?.dataset };
  }
  return { mappingType: "multiple", sheetMappings: datasetMappingEntries };
};

/**
 * Translate user-friendly schema mode to dataset schemaConfig fields.
 */
export const translateSchemaMode = (mode: CreateScheduleConfig["schemaMode"]) => {
  switch (mode) {
    case "strict":
      return { locked: true, autoGrow: false, autoApproveNonBreaking: false };
    case "additive":
      return { locked: false, autoGrow: true, autoApproveNonBreaking: true };
    case "flexible":
      return { locked: false, autoGrow: true, autoApproveNonBreaking: false };
    default:
      return { locked: false, autoGrow: true, autoApproveNonBreaking: true };
  }
};

// Create or update dataset with wizard configuration
/* oxlint-disable-next-line max-params -- Transform support requires an additional parameter */
export const processDataset = async (
  payload: Payload,
  req: NextRequest,
  sheetMapping: SheetMapping,
  fieldMapping: FieldMapping | undefined,
  catalogId: number,
  deduplicationStrategy: ConfigureImportRequest["deduplicationStrategy"],
  geocodingEnabled: boolean,
  transforms?: ImportTransform[]
): Promise<number> => {
  const fieldMappingOverrides = buildFieldMappingOverrides(fieldMapping);
  const idStrategy = buildIdStrategy(fieldMapping, deduplicationStrategy);
  const deduplicationConfig = { enabled: true, strategy: deduplicationStrategy };
  const geoFieldDetection = buildGeoFieldDetection(fieldMapping, geocodingEnabled);

  // Auto-approve non-breaking schema changes for wizard imports
  // since the user already configured field mappings
  const schemaConfig = { autoApproveNonBreaking: true };

  if (sheetMapping.datasetId === "new") {
    // Bug 14 fix: pass req so Payload hooks and access control know the acting user
    const newDataset = await payload.create({
      collection: "datasets",
      data: {
        name: sheetMapping.newDatasetName,
        catalog: catalogId,
        language: "eng",
        isPublic: true, // Default to public for wizard imports
        fieldMappingOverrides,
        idStrategy,
        deduplicationConfig,
        geoFieldDetection,
        schemaConfig,
        ...(transforms && transforms.length > 0
          ? { importTransforms: transforms as unknown as NonNullable<Dataset["importTransforms"]> }
          : {}),
      },
      req,
    });

    logger.info(
      { datasetId: newDataset.id, name: sheetMapping.newDatasetName, sheetIndex: sheetMapping.sheetIndex },
      "Created new dataset with wizard config"
    );

    return newDataset.id;
  }

  // Check if dataset has events — if so, preserve existing idStrategy
  const eventCount = await payload.count({
    collection: "events",
    where: { dataset: { equals: sheetMapping.datasetId } },
  });

  const updateData: Record<string, unknown> = {
    fieldMappingOverrides,
    deduplicationConfig,
    geoFieldDetection,
    schemaConfig,
    ...(transforms ? { importTransforms: transforms as unknown as NonNullable<Dataset["importTransforms"]> } : {}),
  };

  // Only update idStrategy if dataset has no events yet
  if (eventCount.totalDocs === 0) {
    updateData.idStrategy = idStrategy;
  } else {
    logger.info(
      { datasetId: sheetMapping.datasetId, eventCount: eventCount.totalDocs },
      "Preserving existing idStrategy — dataset has events"
    );
  }

  // Bug 14 fix: pass req so Payload hooks and access control know the acting user
  await payload.update({ collection: "datasets", id: sheetMapping.datasetId, data: updateData, req });

  logger.info(
    { datasetId: sheetMapping.datasetId, sheetIndex: sheetMapping.sheetIndex },
    "Updated existing dataset with wizard config"
  );

  return sheetMapping.datasetId;
};

/**
 * Process all sheet mappings and return dataset mapping entries.
 * Bug 28 fix: process sequentially instead of in parallel to prevent race conditions
 * when multiple sheets target the same dataset.
 */
/* oxlint-disable-next-line max-params -- Transform support requires an additional parameter */
export const processSheetMappings = async (
  payload: Payload,
  req: NextRequest,
  sheetMappings: SheetMapping[],
  fieldMappings: FieldMapping[],
  catalogId: number,
  deduplicationStrategy: ConfigureImportRequest["deduplicationStrategy"],
  geocodingEnabled: boolean,
  transformsBySheet?: Array<{ sheetIndex: number; transforms: ImportTransform[] }>
): Promise<{ datasetIdMap: Map<number, number>; datasetMappingEntries: DatasetMappingEntry[] }> => {
  const datasetIdMap = new Map<number, number>();
  const datasetMappingEntries: DatasetMappingEntry[] = [];

  for (const sheetMapping of sheetMappings) {
    const fieldMapping = fieldMappings.find((fm) => fm.sheetIndex === sheetMapping.sheetIndex);
    const sheetTransforms = transformsBySheet?.find((t) => t.sheetIndex === sheetMapping.sheetIndex)?.transforms;
    const datasetId = await processDataset(
      payload,
      req,
      sheetMapping,
      fieldMapping,
      catalogId,
      deduplicationStrategy,
      geocodingEnabled,
      sheetTransforms
    );

    datasetIdMap.set(sheetMapping.sheetIndex, datasetId);
    datasetMappingEntries.push({
      sheetIdentifier: String(sheetMapping.sheetIndex),
      dataset: datasetId,
      skipIfMissing: false,
    });
  }

  return { datasetIdMap, datasetMappingEntries };
};

/**
 * Create scheduled import from wizard configuration.
 * Checks the active-schedules quota before creation to prevent bypass (Bug 15).
 */
export const createScheduledImport = async (
  payload: Payload,
  scheduleConfig: CreateScheduleConfig,
  catalogId: number,
  datasetMappingEntries: DatasetMappingEntry[],
  user: User,
  importFileId: number,
  previewMeta: PreviewMetadata
): Promise<number | null> => {
  if (!scheduleConfig.enabled || !scheduleConfig.sourceUrl) {
    return null;
  }

  // Bug 15 fix: enforce scheduled-import quota before creation
  const quotaService = createQuotaService(payload);
  await quotaService.validateQuota(user, "ACTIVE_SCHEDULES", 1);

  // Determine if single or multi-sheet
  const isSingleSheet = datasetMappingEntries.length === 1;
  const firstDatasetId = datasetMappingEntries[0]?.dataset;

  // Build auth config for scheduled import (use from schedule config or fall back to preview auth)
  const authConfig = scheduleConfig.authConfig ?? previewMeta.authConfig ?? { type: "none" as const };

  // Update datasets with schema config based on schema mode
  const schemaConfig = translateSchemaMode(scheduleConfig.schemaMode);
  await Promise.all(
    datasetMappingEntries.map(async (entry) => {
      await payload.update({ collection: "datasets", id: entry.dataset, data: { schemaConfig } });
      logger.info(
        { datasetId: entry.dataset, schemaMode: scheduleConfig.schemaMode, schemaConfig },
        "Updated dataset schema config for schedule"
      );
    })
  );

  // Build advanced options with JSON API config if present
  const advancedOptions = scheduleConfig.jsonApiConfig
    ? { responseFormat: "json" as const, jsonApiConfig: scheduleConfig.jsonApiConfig }
    : undefined;

  // Build base scheduled import data
  const baseData = {
    name: scheduleConfig.name,
    sourceUrl: scheduleConfig.sourceUrl,
    catalog: catalogId,
    createdBy: user.id,
    enabled: true,
    scheduleType: scheduleConfig.scheduleType,
    schemaMode: scheduleConfig.schemaMode,
    sourceImportFile: importFileId,
    authConfig,
    advancedOptions,
    frequency: scheduleConfig.scheduleType === "frequency" ? scheduleConfig.frequency : undefined,
    cronExpression: scheduleConfig.scheduleType === "cron" ? scheduleConfig.cronExpression : undefined,
    dataset: isSingleSheet && firstDatasetId ? firstDatasetId : undefined,
    multiSheetConfig:
      !isSingleSheet && datasetMappingEntries.length > 0
        ? {
            enabled: true,
            sheets: datasetMappingEntries.map((entry) => ({
              sheetIdentifier: entry.sheetIdentifier,
              dataset: entry.dataset,
              skipIfMissing: false,
            })),
          }
        : undefined,
  };

  const scheduledImport = await payload.create({ collection: "scheduled-imports", data: baseData });

  logger.info(
    {
      scheduledImportId: scheduledImport.id,
      name: scheduleConfig.name,
      sourceUrl: scheduleConfig.sourceUrl,
      catalogId,
      datasetIds: datasetMappingEntries.map((e) => e.dataset),
    },
    "Created scheduled import from wizard"
  );

  return scheduledImport.id;
};

/**
 * Create catalog if needed, verifying ownership for existing catalogs.
 * Returns the catalog ID, null if name is missing, or "forbidden" if access denied.
 */
export const getOrCreateCatalog = async (
  payload: Payload,
  req: NextRequest,
  catalogId: number | "new",
  newCatalogName: string | undefined,
  user: User
): Promise<number | null | "forbidden"> => {
  if (catalogId !== "new") {
    // Bug 13 fix: verify the user owns this catalog (admins bypass)
    if (user.role !== "admin") {
      const catalog = await payload.find({
        collection: "catalogs",
        where: { id: { equals: catalogId }, createdBy: { equals: user.id } },
        limit: 1,
      });
      if (catalog.docs.length === 0) {
        // Debug: fetch catalog without ownership filter to understand why access was denied
        const catalogWithoutFilter = await payload.find({
          collection: "catalogs",
          where: { id: { equals: catalogId } },
          limit: 1,
          overrideAccess: true,
          depth: 0,
        });
        const found = catalogWithoutFilter.docs[0];
        logger.debug(
          {
            catalogId,
            userId: user.id,
            userRole: user.role,
            catalogExists: catalogWithoutFilter.docs.length > 0,
            catalogCreatedBy: found?.createdBy ?? null,
            catalogName: found?.name ?? null,
          },
          "Catalog access denied — user does not own catalog"
        );
        return "forbidden";
      }
    }
    return catalogId;
  }

  if (!newCatalogName) {
    return null;
  }

  const newCatalog = await payload.create({
    collection: "catalogs",
    data: { name: newCatalogName, isPublic: true },
    req,
  });

  logger.info({ catalogId: newCatalog.id, name: newCatalogName, userId: user.id }, "Created new catalog");
  return newCatalog.id;
};

/**
 * Create the import file record from preview metadata and wizard configuration.
 */
export const createImportFileRecord = async (
  payload: Payload,
  user: User,
  previewMeta: PreviewMetadata,
  body: ConfigureImportRequest,
  finalCatalogId: number,
  datasetIdMap: Map<number, number>,
  datasetMappingEntries: DatasetMappingEntry[]
) => {
  const fileBuffer = fs.readFileSync(previewMeta.filePath);
  const datasetMapping = buildDatasetMapping(body.sheetMappings, datasetMappingEntries);
  const importFile = await payload.create({
    collection: "import-files",
    user,
    data: {
      user: user.id,
      catalog: finalCatalogId,
      originalName: previewMeta.originalName,
      status: "pending",
      datasets: Array.from(datasetIdMap.values()),
      datasetsCount: body.sheetMappings.length,
      metadata: {
        source: "import-wizard",
        datasetMapping,
        geocodingEnabled: body.geocodingEnabled,
        deduplicationStrategy: body.deduplicationStrategy,
        wizardConfig: { sheetMappings: body.sheetMappings, fieldMappings: body.fieldMappings },
      },
    },
    file: {
      data: fileBuffer,
      name: previewMeta.originalName,
      mimetype: previewMeta.mimeType,
      size: previewMeta.fileSize,
    },
  });

  logger.info(
    { importFileId: importFile.id, originalName: previewMeta.originalName, catalogId: finalCatalogId, userId: user.id },
    "Import file created"
  );

  return importFile;
};

/**
 * Convert QuotaExceededError to AppError so the framework handles it correctly.
 * Bug 15: surface quota-exceeded as 429 rather than 500.
 */
export const rethrowQuotaError = (error: unknown): never => {
  if (error instanceof QuotaExceededError) {
    throw new AppError(error.statusCode, error.message, "QUOTA_EXCEEDED");
  }
  throw error;
};
