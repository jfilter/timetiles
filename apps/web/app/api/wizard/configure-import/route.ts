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

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import type { Payload } from "payload";
import { getPayload } from "payload";

import { createLogger } from "@/lib/logger";
import { badRequest, unauthorized } from "@/lib/utils/api-response";
import config from "@/payload.config";
import type { User } from "@/payload-types";

const logger = createLogger("api-wizard-configure-import");

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
  endDateField: string | null;
  idField: string | null;
  idStrategy: "external" | "computed" | "auto" | "hybrid";
  locationField: string | null;
  latitudeField: string | null;
  longitudeField: string | null;
}

interface ConfigureImportRequest {
  previewId: string;
  catalogId: number | "new";
  newCatalogName?: string;
  sheetMappings: SheetMapping[];
  fieldMappings: FieldMapping[];
  deduplicationStrategy: "skip" | "update" | "version";
  geocodingEnabled: boolean;
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
}

// Helper functions
const getPreviewDir = (): string => {
  return path.join(os.tmpdir(), "timetiles-wizard-preview");
};

const loadPreviewMetadata = (previewId: string): PreviewMetadata | null => {
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
  const datasetIdMap = new Map<number, number>();
  const datasetMappingEntries: DatasetMappingEntry[] = [];

  for (const sheetMapping of sheetMappings) {
    const fieldMapping = fieldMappings.find((fm) => fm.sheetIndex === sheetMapping.sheetIndex);
    const datasetId = await processDataset(
      payload,
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
    data: { name: newCatalogName },
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
export const POST = async (req: NextRequest) => {
  try {
    const payload = await getPayload({ config });
    const { user } = await payload.auth({ headers: req.headers });

    if (!user) {
      return unauthorized();
    }

    const body = (await req.json()) as ConfigureImportRequest;
    const previewMeta = loadPreviewMetadata(body.previewId);

    // Validate request
    const validationError = validateRequest(body, previewMeta, user);
    if (validationError) return validationError;

    // Get or create catalog
    const finalCatalogId = await getOrCreateCatalog(payload, req, body.catalogId, body.newCatalogName, user.id);
    if (finalCatalogId === null) {
      return badRequest("New catalog name is required");
    }

    // Process sheet mappings and create/update datasets
    const { datasetIdMap, datasetMappingEntries } = await processSheetMappings(
      payload,
      body.sheetMappings,
      body.fieldMappings,
      finalCatalogId,
      body.deduplicationStrategy,
      body.geocodingEnabled
    );

    // Read file and create import file record
    const fileBuffer = fs.readFileSync(previewMeta!.filePath);
    const datasetMapping = buildDatasetMapping(body.sheetMappings, datasetMappingEntries);

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

    cleanupPreview(body.previewId);

    return NextResponse.json({
      success: true,
      importFileId: importFile.id,
      catalogId: finalCatalogId,
      datasets: Object.fromEntries(datasetIdMap),
    });
  } catch (error) {
    logger.error("Failed to configure import", { error });
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
};
