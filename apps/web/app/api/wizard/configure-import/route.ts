/**
 * API endpoint for configuring and starting an import.
 *
 * POST /api/wizard/configure-import - Configure import and start processing
 *
 * Takes the wizard configuration and starts the import process.
 *
 * @module
 * @category API Routes
 */
/* eslint-disable sonarjs/max-lines-per-function -- Import configuration requires many sequential setup steps */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import type { Payload } from "payload";
import { getPayload } from "payload";

import { createLogger } from "@/lib/logger";
import { type AuthenticatedRequest, withAuth } from "@/lib/middleware/auth";
import { badRequest, unauthorized } from "@/lib/utils/api-response";
import config from "@/payload.config";
import type { User } from "@/payload-types";

const logger = createLogger("api-wizard-configure-import");

// UUID v4 format validation regex
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const isValidUUID = (id: string): boolean => UUID_REGEX.test(id);

interface SheetMapping {
  sheetIndex: number;
  datasetId: number | "new";
  newDatasetName: string;
}

interface FieldMapping {
  sheetIndex: number;
  titleField: string | null;
  descriptionField: string | null;
  dateField: string | null;
  idField: string | null;
  idStrategy: "external" | "computed" | "auto" | "hybrid";
  locationField: string | null;
  latitudeField: string | null;
  longitudeField: string | null;
}

/** Auth configuration for scheduled imports (matches ScheduledImport authConfig structure) */
interface AuthConfig {
  type: "none" | "api-key" | "bearer" | "basic";
  apiKey?: string;
  apiKeyHeader?: string;
  bearerToken?: string;
  username?: string;
  password?: string;
  customHeaders?: string | Record<string, string>;
}

/** Schedule creation configuration */
interface CreateScheduleConfig {
  enabled: boolean;
  sourceUrl: string;
  name: string;
  scheduleType: "frequency" | "cron";
  frequency?: "hourly" | "daily" | "weekly" | "monthly";
  cronExpression?: string;
  schemaMode: "strict" | "additive" | "flexible";
  authConfig?: AuthConfig;
}

interface ConfigureImportRequest {
  previewId: string;
  catalogId: number | "new";
  newCatalogName?: string;
  sheetMappings: SheetMapping[];
  fieldMappings: FieldMapping[];
  deduplicationStrategy: "skip" | "update" | "version";
  geocodingEnabled: boolean;
  createSchedule?: CreateScheduleConfig;
}

interface DatasetMappingEntry {
  sheetIdentifier: string;
  dataset: number;
  skipIfMissing: boolean;
}

interface PreviewMetadata {
  previewId: string;
  userId: number;
  originalName: string;
  filePath: string;
  mimeType: string;
  fileSize: number;
  createdAt: string;
  expiresAt: string;
  sourceUrl?: string; // Present if preview was from URL
  authConfig?: AuthConfig; // Auth config if URL source had authentication
}

// Helper functions
const getPreviewDir = (): string => {
  return path.join(os.tmpdir(), "timetiles-wizard-preview");
};

const loadPreviewMetadata = (previewId: string): PreviewMetadata | null => {
  // Security: Validate previewId is a valid UUID to prevent path traversal
  if (!isValidUUID(previewId)) {
    return null;
  }

  const previewDir = getPreviewDir();
  const metaPath = path.join(previewDir, `${previewId}.meta.json`);

  if (!fs.existsSync(metaPath)) {
    return null;
  }

  try {
    const content = fs.readFileSync(metaPath, "utf-8");
    return JSON.parse(content) as PreviewMetadata;
  } catch {
    return null;
  }
};

const cleanupPreview = (previewId: string) => {
  const previewDir = getPreviewDir();
  const metaPath = path.join(previewDir, `${previewId}.meta.json`);
  if (fs.existsSync(metaPath)) {
    fs.unlinkSync(metaPath);
  }
};

// Build field mapping overrides from wizard configuration
const buildFieldMappingOverrides = (fieldMapping: FieldMapping | undefined) => {
  if (!fieldMapping) return {};
  return {
    titlePath: fieldMapping.titleField,
    descriptionPath: fieldMapping.descriptionField,
    timestampPath: fieldMapping.dateField,
    latitudePath: fieldMapping.latitudeField,
    longitudePath: fieldMapping.longitudeField,
    locationPath: fieldMapping.locationField,
  };
};

// Build ID strategy configuration
const buildIdStrategy = (
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
const buildGeoFieldDetection = (fieldMapping: FieldMapping | undefined, geocodingEnabled: boolean) => ({
  autoDetect: geocodingEnabled,
  latitudePath: fieldMapping?.latitudeField ?? undefined,
  longitudePath: fieldMapping?.longitudeField ?? undefined,
});

// Create or update dataset with wizard configuration
const processDataset = async (
  payload: Payload,
  sheetMapping: SheetMapping,
  fieldMapping: FieldMapping | undefined,
  catalogId: number,
  deduplicationStrategy: ConfigureImportRequest["deduplicationStrategy"],
  geocodingEnabled: boolean
): Promise<number> => {
  const fieldMappingOverrides = buildFieldMappingOverrides(fieldMapping);
  const idStrategy = buildIdStrategy(fieldMapping, deduplicationStrategy);
  const deduplicationConfig = { enabled: true, strategy: deduplicationStrategy };
  const geoFieldDetection = buildGeoFieldDetection(fieldMapping, geocodingEnabled);

  // Auto-approve non-breaking schema changes for wizard imports
  // since the user already configured field mappings
  const schemaConfig = { autoApproveNonBreaking: true };

  if (sheetMapping.datasetId === "new") {
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
      },
    });

    logger.info("Created new dataset with wizard config", {
      datasetId: newDataset.id,
      name: sheetMapping.newDatasetName,
      sheetIndex: sheetMapping.sheetIndex,
    });

    return newDataset.id;
  }

  await payload.update({
    collection: "datasets",
    id: sheetMapping.datasetId,
    data: { fieldMappingOverrides, idStrategy, deduplicationConfig, geoFieldDetection, schemaConfig },
  });

  logger.info("Updated existing dataset with wizard config", {
    datasetId: sheetMapping.datasetId,
    sheetIndex: sheetMapping.sheetIndex,
  });

  return sheetMapping.datasetId;
};

// Process all sheet mappings and return dataset mapping entries
const processSheetMappings = async (
  payload: Payload,
  sheetMappings: SheetMapping[],
  fieldMappings: FieldMapping[],
  catalogId: number,
  deduplicationStrategy: ConfigureImportRequest["deduplicationStrategy"],
  geocodingEnabled: boolean
): Promise<{ datasetIdMap: Map<number, number>; datasetMappingEntries: DatasetMappingEntry[] }> => {
  // Process all sheet mappings in parallel for better performance
  const results = await Promise.all(
    sheetMappings.map(async (sheetMapping) => {
      const fieldMapping = fieldMappings.find((fm) => fm.sheetIndex === sheetMapping.sheetIndex);
      const datasetId = await processDataset(
        payload,
        sheetMapping,
        fieldMapping,
        catalogId,
        deduplicationStrategy,
        geocodingEnabled
      );

      return {
        sheetIndex: sheetMapping.sheetIndex,
        datasetId,
        entry: {
          sheetIdentifier: String(sheetMapping.sheetIndex),
          dataset: datasetId,
          skipIfMissing: false,
        } as DatasetMappingEntry,
      };
    })
  );

  // Build maps from parallel results
  const datasetIdMap = new Map<number, number>();
  const datasetMappingEntries: DatasetMappingEntry[] = [];

  for (const result of results) {
    datasetIdMap.set(result.sheetIndex, result.datasetId);
    datasetMappingEntries.push(result.entry);
  }

  return { datasetIdMap, datasetMappingEntries };
};

// Build dataset mapping metadata for the import job
const buildDatasetMapping = (sheetMappings: SheetMapping[], datasetMappingEntries: DatasetMappingEntry[]) => {
  if (sheetMappings.length === 1) {
    return { mappingType: "single", singleDataset: datasetMappingEntries[0]?.dataset };
  }
  return { mappingType: "multiple", sheetMappings: datasetMappingEntries };
};

/**
 * Translate user-friendly schema mode to dataset schemaConfig fields.
 */
const translateSchemaMode = (mode: CreateScheduleConfig["schemaMode"]) => {
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

/**
 * Create scheduled import from wizard configuration.
 */
const createScheduledImport = async (
  payload: Payload,
  scheduleConfig: CreateScheduleConfig,
  catalogId: number,
  datasetMappingEntries: DatasetMappingEntry[],
  userId: number,
  importFileId: number,
  previewMeta: PreviewMetadata
): Promise<number | null> => {
  if (!scheduleConfig.enabled || !scheduleConfig.sourceUrl) {
    return null;
  }

  // Determine if single or multi-sheet
  const isSingleSheet = datasetMappingEntries.length === 1;
  const firstDatasetId = datasetMappingEntries[0]?.dataset;

  // Build auth config for scheduled import (use from schedule config or fall back to preview auth)
  const authConfig = scheduleConfig.authConfig ?? previewMeta.authConfig ?? { type: "none" as const };

  // Update datasets with schema config based on schema mode
  // Use Promise.all for parallel execution (performance optimization)
  const schemaConfig = translateSchemaMode(scheduleConfig.schemaMode);
  await Promise.all(
    datasetMappingEntries.map(async (entry) => {
      await payload.update({
        collection: "datasets",
        id: entry.dataset,
        data: { schemaConfig },
      });
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
    createdBy: userId,
    enabled: true,
    scheduleType: scheduleConfig.scheduleType,
    schemaMode: scheduleConfig.schemaMode,
    sourceImportFile: importFileId,
    authConfig,
    // Set frequency or cron based on schedule type
    frequency: scheduleConfig.scheduleType === "frequency" ? scheduleConfig.frequency : undefined,
    cronExpression: scheduleConfig.scheduleType === "cron" ? scheduleConfig.cronExpression : undefined,
    // Set dataset reference (single sheet case)
    dataset: isSingleSheet && firstDatasetId ? firstDatasetId : undefined,
    // Set multi-sheet config if needed
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

  const scheduledImport = await payload.create({
    collection: "scheduled-imports",
    data: baseData,
  });

  logger.info("Created scheduled import from wizard", {
    scheduledImportId: scheduledImport.id,
    name: scheduleConfig.name,
    sourceUrl: scheduleConfig.sourceUrl,
    schemaMode: scheduleConfig.schemaMode,
    scheduleType: scheduleConfig.scheduleType,
    frequency: scheduleConfig.frequency,
    catalogId,
    datasetIds: datasetMappingEntries.map((e) => e.dataset),
  });

  return scheduledImport.id;
};

// Create catalog if needed
const getOrCreateCatalog = async (
  payload: Payload,
  req: NextRequest,
  catalogId: number | "new",
  newCatalogName: string | undefined,
  userId: number
): Promise<number | null> => {
  if (catalogId !== "new") {
    return catalogId;
  }

  if (!newCatalogName) {
    return null;
  }

  const newCatalog = await payload.create({
    collection: "catalogs",
    data: {
      name: newCatalogName,
      isPublic: true, // Default to public for wizard imports
    },
    req,
  });

  logger.info("Created new catalog", { catalogId: newCatalog.id, name: newCatalogName, userId });
  return newCatalog.id;
};

// Validate request body
const validateRequest = (
  body: ConfigureImportRequest,
  previewMeta: PreviewMetadata | null,
  user: User
): NextResponse | null => {
  if (!body.previewId) {
    return badRequest("Preview ID is required");
  }

  if (!body.catalogId) {
    return badRequest("Catalog selection is required");
  }

  if (!body.sheetMappings?.length) {
    return badRequest("Sheet mappings are required");
  }

  if (!body.fieldMappings?.length) {
    return badRequest("Field mappings are required");
  }

  if (!previewMeta) {
    return badRequest("Preview not found or expired. Please upload the file again.");
  }

  if (previewMeta.userId !== user.id) {
    return unauthorized("You do not have access to this preview");
  }

  if (!fs.existsSync(previewMeta.filePath)) {
    return badRequest("Preview file not found. Please upload the file again.");
  }

  return null;
};

/**
 * Configure and start import.
 *
 * Takes the wizard configuration (previewId, catalog, datasets, field mappings)
 * and creates the import file record to start processing.
 */

export const POST = withAuth(async (req: AuthenticatedRequest) => {
  logger.debug("Configure import request received");

  try {
    const payload = await getPayload({ config });
    logger.debug("Payload initialized");

    const user = req.user!;
    logger.debug("Auth check complete", { userId: user.id });

    const body = (await req.json()) as ConfigureImportRequest;
    logger.debug("Request body parsed", {
      previewId: body.previewId,
      catalogId: body.catalogId,
      sheetMappingsCount: body.sheetMappings?.length,
      fieldMappingsCount: body.fieldMappings?.length,
      deduplicationStrategy: body.deduplicationStrategy,
      geocodingEnabled: body.geocodingEnabled,
    });

    const previewMeta = loadPreviewMetadata(body.previewId);
    logger.debug("Preview metadata loaded", {
      found: !!previewMeta,
      filePath: previewMeta?.filePath,
      fileExists: previewMeta?.filePath ? fs.existsSync(previewMeta.filePath) : false,
    });

    // Validate request
    const validationError = validateRequest(body, previewMeta, user);
    if (validationError) {
      logger.debug("Validation failed");
      return validationError;
    }
    logger.debug("Validation passed");

    // Get or create catalog
    logger.debug("Getting or creating catalog", { catalogId: body.catalogId, newCatalogName: body.newCatalogName });
    const finalCatalogId = await getOrCreateCatalog(payload, req, body.catalogId, body.newCatalogName, user.id);
    if (finalCatalogId === null) {
      return badRequest("New catalog name is required");
    }
    logger.debug("Catalog ready", { finalCatalogId });

    // Process sheet mappings and create/update datasets
    logger.debug("Processing sheet mappings", { sheetMappings: body.sheetMappings });
    const { datasetIdMap, datasetMappingEntries } = await processSheetMappings(
      payload,
      body.sheetMappings,
      body.fieldMappings,
      finalCatalogId,
      body.deduplicationStrategy,
      body.geocodingEnabled
    );
    logger.debug("Sheet mappings processed", {
      datasetIds: Array.from(datasetIdMap.values()),
      datasetMappingEntries,
    });

    // Read file and create import file record
    logger.debug("Reading preview file", { filePath: previewMeta!.filePath });
    const fileBuffer = fs.readFileSync(previewMeta!.filePath);
    logger.debug("File read complete", { fileSize: fileBuffer.length });

    const datasetMapping = buildDatasetMapping(body.sheetMappings, datasetMappingEntries);
    logger.debug("Dataset mapping built", { datasetMapping });

    logger.debug("Creating import file record");
    const importFile = await payload.create({
      collection: "import-files",
      user,
      data: {
        user: user.id,
        catalog: finalCatalogId,
        originalName: previewMeta!.originalName,
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
        name: previewMeta!.originalName,
        mimetype: previewMeta!.mimeType,
        size: previewMeta!.fileSize,
      },
    });

    logger.info("Import file created", {
      importFileId: importFile.id,
      originalName: previewMeta!.originalName,
      catalogId: finalCatalogId,
      userId: user.id,
    });

    // Create scheduled import if requested
    let scheduledImportId: number | null = null;
    if (body.createSchedule?.enabled) {
      logger.debug("Creating scheduled import", { createSchedule: body.createSchedule });
      scheduledImportId = await createScheduledImport(
        payload,
        body.createSchedule,
        finalCatalogId,
        datasetMappingEntries,
        user.id,
        importFile.id,
        previewMeta!
      );
    }

    cleanupPreview(body.previewId);

    return NextResponse.json({
      success: true,
      importFileId: importFile.id,
      catalogId: finalCatalogId,
      datasets: Object.fromEntries(datasetIdMap),
      scheduledImportId: scheduledImportId ?? undefined, // Include if schedule was created
    });
  } catch (error) {
    logger.error("Failed to configure import", {
      error,
      message: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : undefined,
    });
    // Include error details for debugging
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    const errorStack = error instanceof Error ? error.stack : undefined;
    return NextResponse.json(
      {
        error: "Failed to start import",
        details: errorMessage,
        stack: process.env.NODE_ENV !== "production" ? errorStack : undefined,
        code: "INTERNAL_ERROR",
      },
      { status: 500 }
    );
  }
});
