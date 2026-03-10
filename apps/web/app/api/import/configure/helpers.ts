/**
 * Helper functions and types for the configure-import endpoint.
 *
 * @module
 * @category API Routes
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import type { NextRequest } from "next/server";
import type { NextResponse } from "next/server";
import type { Payload } from "payload";

import { createLogger } from "@/lib/logger";
import { badRequest, unauthorized } from "@/lib/utils/api-response";
import type { User } from "@/payload-types";

const logger = createLogger("api-wizard-configure-import");

// UUID v4 format validation regex
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const isValidUUID = (id: string): boolean => UUID_REGEX.test(id);

export interface SheetMapping {
  sheetIndex: number;
  datasetId: number | "new";
  newDatasetName: string;
}

export interface FieldMapping {
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
export interface AuthConfig {
  type: "none" | "api-key" | "bearer" | "basic";
  apiKey?: string;
  apiKeyHeader?: string;
  bearerToken?: string;
  username?: string;
  password?: string;
  customHeaders?: string | Record<string, string>;
}

/** Schedule creation configuration */
export interface CreateScheduleConfig {
  enabled: boolean;
  sourceUrl: string;
  name: string;
  scheduleType: "frequency" | "cron";
  frequency?: "hourly" | "daily" | "weekly" | "monthly";
  cronExpression?: string;
  schemaMode: "strict" | "additive" | "flexible";
  authConfig?: AuthConfig;
}

export interface ConfigureImportRequest {
  previewId: string;
  catalogId: number | "new";
  newCatalogName?: string;
  sheetMappings: SheetMapping[];
  fieldMappings: FieldMapping[];
  deduplicationStrategy: "skip" | "update" | "version";
  geocodingEnabled: boolean;
  createSchedule?: CreateScheduleConfig;
}

export interface DatasetMappingEntry {
  sheetIdentifier: string;
  dataset: number;
  skipIfMissing: boolean;
}

export interface PreviewMetadata {
  previewId: string;
  userId: number;
  originalName: string;
  filePath: string;
  mimeType: string;
  fileSize: number;
  createdAt: string;
  expiresAt: string;
  sourceUrl?: string;
  authConfig?: AuthConfig;
}

// Helper functions
const getPreviewDir = (): string => {
  return path.join(os.tmpdir(), "timetiles-wizard-preview");
};

export const loadPreviewMetadata = (previewId: string): PreviewMetadata | null => {
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

export const cleanupPreview = (previewId: string) => {
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
export const buildFieldMappingOverrides = (fieldMapping: FieldMapping | undefined) => {
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
export const processDataset = async (
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

// Validate request body
export const validateRequest = (
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
