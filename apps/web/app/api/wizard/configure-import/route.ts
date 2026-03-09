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
/* eslint-disable sonarjs/max-lines, sonarjs/max-lines-per-function -- Import configuration requires many sequential setup steps with security checks */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import type { Payload } from "payload";
import { getPayload } from "payload";

import { QUOTA_TYPES } from "@/lib/constants/quota-constants";
import { createLogger } from "@/lib/logger";
import { type AuthenticatedRequest, withAuth } from "@/lib/middleware/auth";
import { getQuotaService, QuotaExceededError } from "@/lib/services/quota-service";
import { badRequest, forbidden, unauthorized } from "@/lib/utils/api-response";
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

/** Known data file extensions that the preview may have created. */
const DATA_FILE_EXTENSIONS = [".csv", ".xls", ".xlsx", ".ods"];

const cleanupPreview = (previewId: string) => {
  // Security: previewId is already validated as a UUID before this is called
  const previewDir = getPreviewDir();

  // Remove the metadata file
  const metaPath = path.join(previewDir, `${previewId}.meta.json`);
  if (fs.existsSync(metaPath)) {
    fs.unlinkSync(metaPath);
  }

  // Remove any associated data files (Bug 26 fix: previously only meta was cleaned up)
  for (const ext of DATA_FILE_EXTENSIONS) {
    const dataPath = path.join(previewDir, `${previewId}${ext}`);
    if (fs.existsSync(dataPath)) {
      fs.unlinkSync(dataPath);
    }
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
  req: NextRequest,
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
      },
      req,
    });

    logger.info("Created new dataset with wizard config", {
      datasetId: newDataset.id,
      name: sheetMapping.newDatasetName,
      sheetIndex: sheetMapping.sheetIndex,
    });

    return newDataset.id;
  }

  // Bug 14 fix: pass req so Payload hooks and access control know the acting user
  await payload.update({
    collection: "datasets",
    id: sheetMapping.datasetId,
    data: { fieldMappingOverrides, idStrategy, deduplicationConfig, geoFieldDetection, schemaConfig },
    req,
  });

  logger.info("Updated existing dataset with wizard config", {
    datasetId: sheetMapping.datasetId,
    sheetIndex: sheetMapping.sheetIndex,
  });

  return sheetMapping.datasetId;
};

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
    createdBy: user.id,
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
    data: {
      name: newCatalogName,
      isPublic: true, // Default to public for wizard imports
    },
    req,
  });

  logger.info("Created new catalog", { catalogId: newCatalog.id, name: newCatalogName, userId: user.id });
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

  // Bug 27 fix: reject expired previews
  if (previewMeta.expiresAt && new Date(previewMeta.expiresAt) < new Date()) {
    return badRequest("Preview has expired. Please upload the file again.");
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
    const finalCatalogId = await getOrCreateCatalog(payload, req, body.catalogId, body.newCatalogName, user);
    if (finalCatalogId === "forbidden") {
      return forbidden("You do not have access to this catalog");
    }
    if (finalCatalogId === null) {
      return badRequest("New catalog name is required");
    }
    logger.debug("Catalog ready", { finalCatalogId });

    // Process sheet mappings and create/update datasets
    logger.debug("Processing sheet mappings", { sheetMappings: body.sheetMappings });
    const { datasetIdMap, datasetMappingEntries } = await processSheetMappings(
      payload,
      req,
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
        user,
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
    // Bug 15: surface quota-exceeded as 429 rather than 500
    if (error instanceof QuotaExceededError) {
      return NextResponse.json({ error: error.message, code: "QUOTA_EXCEEDED" }, { status: error.statusCode });
    }

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
