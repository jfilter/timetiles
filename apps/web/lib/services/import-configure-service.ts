/**
 * Service functions for the import configuration workflow.
 *
 * Extracts Payload-dependent orchestration logic from the configure-import
 * API route into a testable service layer.
 *
 * @module
 * @category Services
 */
import fs from "node:fs";

import type { NextRequest } from "next/server";
import type { Payload } from "payload";

import type {
  ConfigureImportRequest,
  CreateScheduleConfig,
  DatasetMappingEntry,
  FieldMapping,
  PreviewMetadata,
  SheetMapping,
} from "@/app/api/import/configure/helpers";
import { buildDatasetMapping, processDataset, translateSchemaMode } from "@/app/api/import/configure/helpers";
import { AppError } from "@/lib/api";
import { QUOTA_TYPES } from "@/lib/constants/quota-constants";
import { createLogger } from "@/lib/logger";
import { getQuotaService, QuotaExceededError } from "@/lib/services/quota-service";
import type { User } from "@/payload-types";

const logger = createLogger("import-configure-service");

/**
 * Process all sheet mappings and return dataset mapping entries.
 * Bug 28 fix: process sequentially instead of in parallel to prevent race conditions
 * when multiple sheets target the same dataset.
 */
export const processSheetMappings = async (
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
      logger.info(
        { datasetId: entry.dataset, schemaMode: scheduleConfig.schemaMode, schemaConfig },
        "Updated dataset schema config for schedule"
      );
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
