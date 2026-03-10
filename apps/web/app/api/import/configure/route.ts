/**
 * API endpoint for configuring and starting an import.
 *
 * POST /api/import/configure - Configure import and start processing
 *
 * Takes the wizard configuration and starts the import process.
 *
 * @module
 * @category API Routes
 */
import fs from "node:fs";

import type { NextRequest } from "next/server";
import type { Payload } from "payload";

import { apiRoute, AppError, ForbiddenError, ValidationError } from "@/lib/api";
import { QUOTA_TYPES } from "@/lib/constants/quota-constants";
import { createLogger } from "@/lib/logger";
import { getQuotaService, QuotaExceededError } from "@/lib/services/quota-service";
import type { User } from "@/payload-types";

import type {
  ConfigureImportRequest,
  CreateScheduleConfig,
  DatasetMappingEntry,
  FieldMapping,
  PreviewMetadata,
  SheetMapping,
} from "./helpers";
import {
  buildDatasetMapping,
  cleanupPreview,
  ConfigureImportBodySchema,
  loadPreviewMetadata,
  processDataset,
  translateSchemaMode,
  validateRequest,
} from "./helpers";

const logger = createLogger("api-wizard-configure-import");

// Process all sheet mappings and return dataset mapping entries.
// Bug 28 fix: process sequentially instead of in parallel to prevent race conditions
// when multiple sheets target the same dataset.
const processSheetMappings = async (
  payload: Payload,
  req: NextRequest,
  sheetMappings: SheetMapping[],
  fieldMappings: FieldMapping[],
  catalogId: number,
  deduplicationStrategy: ConfigureImportRequest["deduplicationStrategy"],
  geocodingEnabled: boolean
): Promise<{ datasetIdMap: Map<number, number>; datasetMappingEntries: DatasetMappingEntry[] }> => {
  const datasetIdMap = new Map<number, number>();
  const datasetMappingEntries: DatasetMappingEntry[] = [];

  for (const sheetMapping of sheetMappings) {
    const fieldMapping = fieldMappings.find((fm) => fm.sheetIndex === sheetMapping.sheetIndex);
    const datasetId = await processDataset(
      payload,
      req,
      sheetMapping,
      fieldMapping,
      catalogId,
      deduplicationStrategy,
      geocodingEnabled
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
const createScheduledImport = async (
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
  const quotaService = getQuotaService(payload);
  await quotaService.validateQuota(user, QUOTA_TYPES.ACTIVE_SCHEDULES, 1);

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
      logger.info("Updated dataset schema config for schedule", {
        datasetId: entry.dataset,
        schemaMode: scheduleConfig.schemaMode,
        schemaConfig,
      });
    })
  );

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

  logger.info("Created scheduled import from wizard", {
    scheduledImportId: scheduledImport.id,
    name: scheduleConfig.name,
    sourceUrl: scheduleConfig.sourceUrl,
    catalogId,
    datasetIds: datasetMappingEntries.map((e) => e.dataset),
  });

  return scheduledImport.id;
};

// Create catalog if needed, verifying ownership for existing catalogs
const getOrCreateCatalog = async (
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

  logger.info("Created new catalog", { catalogId: newCatalog.id, name: newCatalogName, userId: user.id });
  return newCatalog.id;
};

// Create the import file record from preview metadata and wizard configuration
const createImportFileRecord = async (
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

  logger.info("Import file created", {
    importFileId: importFile.id,
    originalName: previewMeta.originalName,
    catalogId: finalCatalogId,
    userId: user.id,
  });

  return importFile;
};

/**
 * Convert QuotaExceededError to AppError so the framework handles it correctly.
 * Bug 15: surface quota-exceeded as 429 rather than 500.
 */
const rethrowQuotaError = (error: unknown): never => {
  if (error instanceof QuotaExceededError) {
    throw new AppError(error.statusCode, error.message, "QUOTA_EXCEEDED");
  }
  throw error;
};

/**
 * Configure and start import.
 *
 * Takes the wizard configuration (previewId, catalog, datasets, field mappings)
 * and creates the import file record to start processing.
 */
export const POST = apiRoute({
  auth: "required",
  body: ConfigureImportBodySchema,
  handler: async ({ body, req, user, payload }) => {
    try {
      logger.debug("Configure import request received", {
        previewId: body.previewId,
        catalogId: body.catalogId,
        sheetMappingsCount: body.sheetMappings.length,
        geocodingEnabled: body.geocodingEnabled,
      });

      const previewMeta = loadPreviewMetadata(body.previewId);

      // Validate business-logic constraints (preview exists, not expired, user owns it)
      const validationError = validateRequest(previewMeta, user);
      if (validationError) {
        return validationError;
      }

      // Get or create catalog
      const finalCatalogId = await getOrCreateCatalog(payload, req, body.catalogId, body.newCatalogName, user);
      if (finalCatalogId === "forbidden") {
        throw new ForbiddenError("You do not have access to this catalog");
      }
      if (finalCatalogId === null) {
        throw new ValidationError("New catalog name is required");
      }

      // Process sheet mappings and create/update datasets
      const { datasetIdMap, datasetMappingEntries } = await processSheetMappings(
        payload,
        req,
        body.sheetMappings,
        body.fieldMappings,
        finalCatalogId,
        body.deduplicationStrategy,
        body.geocodingEnabled
      );

      // Create the import file record
      const importFile = await createImportFileRecord(
        payload,
        user,
        previewMeta!,
        body,
        finalCatalogId,
        datasetIdMap,
        datasetMappingEntries
      );

      // Create scheduled import if requested
      let scheduledImportId: number | null = null;
      if (body.createSchedule?.enabled) {
        scheduledImportId = await createScheduledImport(
          payload,
          body.createSchedule,
          finalCatalogId,
          datasetMappingEntries,
          user,
          importFile.id,
          previewMeta!
        );
      }

      cleanupPreview(body.previewId);

      return Response.json({
        success: true,
        importFileId: importFile.id,
        catalogId: finalCatalogId,
        datasets: Object.fromEntries(datasetIdMap),
        scheduledImportId: scheduledImportId ?? undefined,
      });
    } catch (error) {
      // Bug 15: surface quota-exceeded as 429 rather than 500
      return rethrowQuotaError(error);
    }
  },
});
