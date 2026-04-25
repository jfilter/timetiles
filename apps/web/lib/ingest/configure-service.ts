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
import path from "node:path";

import type { NextRequest } from "next/server";
import type { Payload } from "payload";

import { ValidationError } from "@/lib/api/errors";
import type { IngestTransform } from "@/lib/ingest/types/transforms";
import type {
  ConfigureIngestRequest,
  CreateScheduleConfig,
  DatasetMappingEntry,
  FieldMapping,
  PreviewMetadata,
  SheetInfo,
  SheetMapping,
} from "@/lib/ingest/types/wizard";
import { createLogger } from "@/lib/logger";
import { createQuotaService } from "@/lib/services/quota-service";
import type { Dataset, IngestFile, User } from "@/payload-types";

const logger = createLogger("import-configure-service");

/** Build field mapping overrides from wizard configuration. */
export const buildFieldMappingOverrides = (
  fieldMapping: FieldMapping | undefined
): Partial<
  Record<
    | "titlePath"
    | "descriptionPath"
    | "locationNamePath"
    | "timestampPath"
    | "endTimestampPath"
    | "latitudePath"
    | "longitudePath"
    | "locationPath",
    string | null
  >
> => {
  if (!fieldMapping) return {};
  return {
    titlePath: fieldMapping.titleField,
    descriptionPath: fieldMapping.descriptionField,
    locationNamePath: fieldMapping.locationNameField,
    timestampPath: fieldMapping.dateField,
    endTimestampPath: fieldMapping.endDateField,
    latitudePath: fieldMapping.latitudeField,
    longitudePath: fieldMapping.longitudeField,
    locationPath: fieldMapping.locationField,
  };
};

/** Build ID strategy configuration. */
export const buildIdStrategy = (
  fieldMapping: FieldMapping | undefined,
  deduplicationStrategy: ConfigureIngestRequest["deduplicationStrategy"]
): NonNullable<Dataset["idStrategy"]> => {
  // Map API deduplication strategy to dataset-level duplicate strategy
  // "version" is an API-level concept that maps to "skip" at the dataset level
  const duplicateStrategy: NonNullable<Dataset["idStrategy"]>["duplicateStrategy"] =
    deduplicationStrategy === "version" ? "skip" : deduplicationStrategy;

  if (!fieldMapping) {
    return { type: "content-hash", duplicateStrategy };
  }
  return { type: fieldMapping.idStrategy, externalIdPath: fieldMapping.idField, duplicateStrategy };
};

/** Build geo field detection config. */
export const buildGeoFieldDetection = (
  fieldMapping: FieldMapping | undefined,
  geocodingEnabled: boolean
): { autoDetect: boolean; latitudePath: string | undefined; longitudePath: string | undefined } => ({
  autoDetect: geocodingEnabled,
  latitudePath: fieldMapping?.latitudeField ?? undefined,
  longitudePath: fieldMapping?.longitudeField ?? undefined,
});

/** Build dataset mapping metadata for the import job. */
export const buildDatasetMapping = (
  sheetMappings: SheetMapping[],
  datasetMappingEntries: DatasetMappingEntry[]
): { mappingType: string; singleDataset?: number; sheetMappings?: DatasetMappingEntry[] } => {
  if (sheetMappings.length === 1) {
    return { mappingType: "single", singleDataset: datasetMappingEntries[0]?.dataset };
  }
  return { mappingType: "multiple", sheetMappings: datasetMappingEntries };
};

/**
 * Translate user-friendly schema mode to dataset schemaConfig fields.
 *
 * The dataset-level config is the *fallback* when validate-schema-job has no
 * explicit `processingOptions.schemaMode` to consult — it must therefore
 * encode the most permissive interpretation of each mode so a missing
 * processingOptions.schemaMode doesn't escalate harmlessly compatible runs
 * into "needs review". Mode-specific finer points (e.g. flexible's
 * "auto-approve high-confidence transforms" behaviour, which additive does
 * not allow) live in `evaluateSchemaMode` and only fire when
 * processingOptions.schemaMode is set.
 */
export const translateSchemaMode = (
  mode: CreateScheduleConfig["schemaMode"]
): { locked: boolean; autoGrow: boolean; autoApproveNonBreaking: boolean } => {
  switch (mode) {
    case "strict":
      return { locked: true, autoGrow: false, autoApproveNonBreaking: false };
    case "additive":
    case "flexible":
      // Flexible is strictly *more* permissive than additive at the mode
      // layer; at the dataset-fallback layer the two should look identical
      // (both: schema may grow, non-breaking changes auto-approve).
      return { locked: false, autoGrow: true, autoApproveNonBreaking: true };
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
  deduplicationStrategy: ConfigureIngestRequest["deduplicationStrategy"],
  geocodingEnabled: boolean,
  transforms?: IngestTransform[]
): Promise<number> => {
  const fieldMappingOverrides = buildFieldMappingOverrides(fieldMapping);
  const idStrategy = buildIdStrategy(fieldMapping, deduplicationStrategy);
  const deduplicationConfig = { enabled: true };
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
        // IngestTransform (discriminated union with Date, required booleans, typed arrays)
        // vs Dataset["ingestTransforms"] (flat type with string dates, optional nullables, loose arrays).
        // The double cast bridges these structural differences; Payload handles serialization at write time.
        ...(transforms && transforms.length > 0
          ? { ingestTransforms: transforms as unknown as NonNullable<Dataset["ingestTransforms"]> }
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
    // Same IngestTransform vs Dataset["ingestTransforms"] mismatch — see comment above.
    ...(transforms ? { ingestTransforms: transforms } : {}),
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

/** Keys of FieldMapping that carry a column-name path and must exist in the detected schema. */
const FIELD_MAPPING_PATH_KEYS = [
  "titleField",
  "descriptionField",
  "locationNameField",
  "dateField",
  "endDateField",
  "idField",
  "locationField",
  "latitudeField",
  "longitudeField",
] as const satisfies readonly (keyof FieldMapping)[];

type FieldMappingPathKey = (typeof FIELD_MAPPING_PATH_KEYS)[number];

/**
 * Collect every path produced by a transform chain (rename `to`, concatenate `to`,
 * split `toFields`, string-op `to`, extract `to`, etc.). Treat these as valid
 * field paths even if they are not present in the raw headers — they will be
 * materialized at import time.
 */
const collectTransformOutputPaths = (transforms: IngestTransform[] | undefined): Set<string> => {
  const outputs = new Set<string>();
  if (!transforms) return outputs;

  for (const t of transforms) {
    switch (t.type) {
      case "rename":
      case "concatenate":
      case "extract":
        if (t.to) outputs.add(t.to);
        break;
      case "string-op":
      case "parse-json-array":
      case "split-to-array":
        if (t.to) outputs.add(t.to);
        // These can write back to `from` when `to` is omitted — `from` is already
        // a raw-header path, so no extra output needs registering.
        break;
      case "split":
        for (const to of t.toFields ?? []) {
          if (to) outputs.add(to);
        }
        break;
      case "date-parse":
        // Rewrites the value in-place on `from`; no new output path.
        break;
    }
  }

  return outputs;
};

/**
 * Validate that every user-supplied field-mapping path exists in the detected
 * schema for the matching sheet, or is produced by a transform. Throws a
 * ValidationError listing any invalid paths so downstream jobs don't fail
 * with opaque errors.
 */
export const validateFieldMappingPaths = (
  sheets: SheetInfo[],
  sheetMappings: SheetMapping[],
  fieldMappings: FieldMapping[],
  transformsBySheet?: Array<{ sheetIndex: number; transforms: IngestTransform[] }>
): void => {
  const invalid: Array<{ sheetIndex: number; field: FieldMappingPathKey; path: string }> = [];

  for (const sheetMapping of sheetMappings) {
    const fieldMapping = fieldMappings.find((fm) => fm.sheetIndex === sheetMapping.sheetIndex);
    if (!fieldMapping) continue;

    const sheet = sheets.find((s) => s.index === sheetMapping.sheetIndex);
    if (!sheet) {
      throw new ValidationError(
        `Field mapping references sheet ${sheetMapping.sheetIndex}, but that sheet was not found in the preview`
      );
    }

    const transforms = transformsBySheet?.find((t) => t.sheetIndex === sheetMapping.sheetIndex)?.transforms;
    const transformOutputs = collectTransformOutputPaths(transforms);

    // Valid paths = detected headers + paths produced by transforms on this sheet
    const validPaths = new Set<string>([...sheet.headers, ...transformOutputs]);

    for (const key of FIELD_MAPPING_PATH_KEYS) {
      const path = fieldMapping[key];
      if (typeof path !== "string" || path.length === 0) continue;
      if (!validPaths.has(path)) {
        invalid.push({ sheetIndex: sheetMapping.sheetIndex, field: key, path });
      }
    }
  }

  if (invalid.length > 0) {
    const summary = invalid.map((x) => `sheet ${x.sheetIndex}.${x.field}="${x.path}"`).join(", ");
    throw new ValidationError(
      `Field mapping references paths not present in the detected schema: ${summary}. ` +
        `Re-upload the file or update the mapping to a detected column.`,
      { invalid }
    );
  }
};

/**
 * Process all sheet mappings and return dataset mapping entries.
 * Bug 28 fix: process sequentially instead of in parallel to prevent race conditions
 * when multiple sheets target the same dataset.
 *
 * Validates user-supplied field-mapping paths against the preview's detected
 * schema before any dataset is persisted — invalid paths would otherwise be
 * saved and cause opaque downstream job failures.
 */
/* oxlint-disable-next-line max-params -- Transform support requires an additional parameter */
export const processSheetMappings = async (
  payload: Payload,
  req: NextRequest,
  sheetMappings: SheetMapping[],
  fieldMappings: FieldMapping[],
  catalogId: number,
  deduplicationStrategy: ConfigureIngestRequest["deduplicationStrategy"],
  geocodingEnabled: boolean,
  transformsBySheet?: Array<{ sheetIndex: number; transforms: IngestTransform[] }>,
  previewSheets?: SheetInfo[]
): Promise<{ datasetIdMap: Map<number, number>; datasetMappingEntries: DatasetMappingEntry[] }> => {
  // Validate field-mapping paths against the detected schema BEFORE persisting
  // any datasets. Callers that skip passing previewSheets (legacy callers or
  // tests) fall through without validation — this preserves backwards
  // compatibility while opting the main route into validation.
  if (previewSheets) {
    validateFieldMappingPaths(previewSheets, sheetMappings, fieldMappings, transformsBySheet);
  }

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
 * Create scheduled ingest from wizard configuration.
 * Checks the active-schedules quota before creation to prevent bypass (Bug 15).
 */
export const createScheduledIngest = async (
  payload: Payload,
  scheduleConfig: CreateScheduleConfig,
  catalogId: number,
  datasetMappingEntries: DatasetMappingEntry[],
  user: User,
  ingestFileId: number,
  previewMeta: PreviewMetadata
): Promise<number | null> => {
  if (!scheduleConfig.enabled || !scheduleConfig.sourceUrl) {
    return null;
  }

  // Bug 15 fix: enforce scheduled-ingest quota before creation
  const quotaService = createQuotaService(payload);
  await quotaService.validateQuota(user, "ACTIVE_SCHEDULES", 1);

  // Determine if single or multi-sheet
  const isSingleSheet = datasetMappingEntries.length === 1;
  const firstDatasetId = datasetMappingEntries[0]?.dataset;

  // Build auth config for scheduled ingest (use from schedule config or fall back to preview auth)
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

  // Build base scheduled ingest data
  const baseData = {
    name: scheduleConfig.name,
    sourceUrl: scheduleConfig.sourceUrl,
    catalog: catalogId,
    createdBy: user.id,
    enabled: true,
    scheduleType: scheduleConfig.scheduleType,
    schemaMode: scheduleConfig.schemaMode,
    sourceIngestFile: ingestFileId,
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

  const scheduledIngest = await payload.create({ collection: "scheduled-ingests", data: baseData });

  logger.info(
    {
      scheduledIngestId: scheduledIngest.id,
      name: scheduleConfig.name,
      sourceUrl: scheduleConfig.sourceUrl,
      catalogId,
      datasetIds: datasetMappingEntries.map((e) => e.dataset),
    },
    "Created scheduled ingest from wizard"
  );

  return scheduledIngest.id;
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
export const createIngestFileRecord = async (
  payload: Payload,
  user: User,
  previewMeta: PreviewMetadata,
  body: ConfigureIngestRequest,
  finalCatalogId: number,
  datasetIdMap: Map<number, number>,
  datasetMappingEntries: DatasetMappingEntry[]
): Promise<IngestFile> => {
  const fileBuffer = fs.readFileSync(previewMeta.filePath);
  const datasetMapping = buildDatasetMapping(body.sheetMappings, datasetMappingEntries);

  // Ensure the file name Payload stores has an extension matching the actual content.
  // The preview step may convert files (JSON/GeoJSON → CSV) or fetch URLs without
  // file extensions. The original name is preserved in `originalName` for display;
  // here we only fix the storage name so downstream tasks read the correct format.
  const previewExt = path.extname(previewMeta.filePath).toLowerCase();
  const originalExt = path.extname(previewMeta.originalName).toLowerCase();
  let fileName = previewMeta.originalName;
  let fileMimeType = previewMeta.mimeType;
  if (previewExt && previewExt !== originalExt) {
    // Extension mismatch: converted (e.g. .json→.csv) or URL without extension
    fileName = originalExt
      ? previewMeta.originalName.replace(new RegExp(`\\${originalExt}$`, "i"), previewExt)
      : `${previewMeta.originalName}${previewExt}`;
    fileMimeType = previewExt === ".csv" ? "text/csv" : previewMeta.mimeType;
  }

  const ingestFile = await payload.create({
    collection: "ingest-files",
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
    file: { data: fileBuffer, name: fileName, mimetype: fileMimeType, size: fileBuffer.length },
  });

  logger.info(
    { ingestFileId: ingestFile.id, originalName: previewMeta.originalName, catalogId: finalCatalogId, userId: user.id },
    "Ingest file created"
  );

  return ingestFile;
};
