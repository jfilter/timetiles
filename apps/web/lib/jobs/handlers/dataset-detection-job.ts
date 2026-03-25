/**
 * Defines the job handler for detecting datasets within an uploaded file.
 *
 * This job is the first step in the import process after a file is uploaded. It performs the following actions:
 * - Reads the uploaded file (supports CSV and Excel formats).
 * - Identifies all the individual sheets (for Excel) or the single data table (for CSV).
 * - For each detected sheet, it creates a corresponding `import-jobs` document.
 * - It either matches the sheet to an existing dataset in the specified catalog or creates a new dataset.
 * - It populates the `import-jobs` with initial metadata like row count and sets the first processing stage to `DEDUPLICATION`.
 *
 * @module
 * @category Jobs
 */
import fs from "node:fs";
import path from "node:path";

import type { Payload } from "payload";

import { COLLECTION_NAMES, JOB_TYPES, PROCESSING_STAGE } from "@/lib/constants/ingest-constants";
import { logError, logger } from "@/lib/logger";
import { parseStrictInteger } from "@/lib/utils/event-params";
import { extractRelationId, requireRelationId } from "@/lib/utils/relation-id";

import type { DatasetDetectionJobInput } from "../types/job-inputs";
import type { JobHandlerContext, TaskCallbackArgs } from "../utils/job-context";
import { getIngestFilePath } from "../utils/upload-path";
import {
  buildConfigSnapshot,
  findOrCreateDataset,
  getOrCreateCatalog,
  validateDatasetAccessForUser,
} from "./dataset-detection/catalog-dataset-helpers";
import type { SheetInfo } from "./dataset-detection/parse-files";
import { buildSheetsFromWizardMetadata, processCSVFile, processExcelFile } from "./dataset-detection/parse-files";

/**
 * Convert GeoJSON or JSON files to CSV for pipeline processing.
 * Returns updated filePath and fileExtension, or null if no conversion needed.
 */
const convertToCsvIfNeeded = async (
  filePath: string,
  fileExtension: string
): Promise<{ filePath: string; fileExtension: string; logInfo: Record<string, unknown> } | null> => {
  if (fileExtension === ".geojson") {
    const { convertGeoJsonToCsv } = await import("@/lib/ingest/geojson-to-csv");
    const buffer = fs.readFileSync(filePath);
    const result = convertGeoJsonToCsv(buffer);
    const csvPath = filePath.replace(/\.geojson$/i, ".csv");
    fs.writeFileSync(csvPath, result.csv);
    return {
      filePath: csvPath,
      fileExtension: ".csv",
      logInfo: { format: "geojson", featureCount: result.featureCount },
    };
  }

  if (fileExtension === ".json") {
    const { isGeoJsonBuffer, convertGeoJsonToCsv } = await import("@/lib/ingest/geojson-to-csv");
    const buffer = fs.readFileSync(filePath);

    if (isGeoJsonBuffer(buffer)) {
      const result = convertGeoJsonToCsv(buffer);
      const csvPath = filePath.replace(/\.json$/i, ".csv");
      fs.writeFileSync(csvPath, result.csv);
      return {
        filePath: csvPath,
        fileExtension: ".csv",
        logInfo: { format: "geojson-json", featureCount: result.featureCount },
      };
    }

    const { convertJsonToCsv } = await import("@/lib/ingest/json-to-csv");
    const result = convertJsonToCsv(buffer);
    const csvPath = filePath.replace(/\.json$/i, ".csv");
    fs.writeFileSync(csvPath, result.csv);
    return { filePath: csvPath, fileExtension: ".csv", logInfo: { format: "json", recordCount: result.recordCount } };
  }

  return null;
};

const normalizeIngestFileRelationId = (ingestFileId: string | number): number => {
  const normalizedIngestFileId = typeof ingestFileId === "number" ? ingestFileId : parseStrictInteger(ingestFileId);
  if (normalizedIngestFileId == null) {
    throw new Error("Invalid import file ID");
  }
  return normalizedIngestFileId;
};

const handleSingleSheet = async (
  payload: Payload,
  ingestFile: { id: string | number; originalName?: string | null; metadata?: unknown },
  catalogId?: string | number,
  datasetMapping?: { mappingType: string; singleDataset?: unknown },
  userId?: number
) => {
  let dataset;

  if (datasetMapping?.mappingType === "single" && datasetMapping.singleDataset) {
    const datasetId = requireRelationId<string>(
      datasetMapping.singleDataset as { id: string } | string,
      "datasetMapping.singleDataset"
    );

    dataset = await payload.findByID({ collection: COLLECTION_NAMES.DATASETS, id: datasetId });

    if (!dataset) {
      throw new Error(`Configured dataset not found: ${datasetId}`);
    }

    // Validate the import-file owner has access to the target dataset's catalog
    await validateDatasetAccessForUser(payload, dataset, userId);
  } else {
    const resolvedCatalogId = await getOrCreateCatalog(payload, catalogId, userId);
    dataset = await findOrCreateDataset(payload, resolvedCatalogId, ingestFile.originalName ?? "Imported Data", userId);
  }

  return payload.create({
    collection: COLLECTION_NAMES.INGEST_JOBS,
    data: {
      ingestFile: normalizeIngestFileRelationId(ingestFile.id),
      dataset: dataset.id,
      sheetIndex: 0,
      stage: PROCESSING_STAGE.ANALYZE_DUPLICATES,
      progress: { stages: {}, overallPercentage: 0, estimatedCompletionTime: null },
      configSnapshot: buildConfigSnapshot(dataset),
    },
  });
};

const handleMultipleSheets = async (
  payload: Payload,
  ingestFile: { id: string | number },
  sheets: SheetInfo[],
  catalogId?: string | number,
  datasetMapping?: { mappingType: string; sheetMappings?: unknown[] },
  userId?: number
) => {
  const createdJobs = [];

  for (const sheet of sheets) {
    const sheetName = sheet.name?.toString() ?? `Sheet_${sheet.index?.toString() ?? "Unknown"}`;
    const job = await processSheetWithMapping(payload, ingestFile, sheet, sheetName, catalogId, datasetMapping, userId);

    if (job) {
      createdJobs.push(job);
    }
  }

  return createdJobs;
};

const processSheetWithMapping = async (
  payload: Payload,
  ingestFile: { id: string | number },
  sheet: SheetInfo,
  sheetName: string,
  catalogId?: string | number,
  datasetMapping?: { mappingType: string; sheetMappings?: unknown[] },
  userId?: number
) => {
  let dataset;
  let skipSheet = false;

  if (datasetMapping?.mappingType === "multiple" && datasetMapping.sheetMappings) {
    const sheetMappings = datasetMapping.sheetMappings as Array<{
      sheetIdentifier?: string;
      dataset?: unknown;
      skipIfMissing?: boolean;
    }>;
    const mapping = sheetMappings.find(
      (m) => m.sheetIdentifier === sheetName || m.sheetIdentifier === sheet.index?.toString()
    );

    if (mapping) {
      const datasetId = extractRelationId<string>(mapping.dataset as { id: string } | string);

      dataset = await payload.findByID({ collection: COLLECTION_NAMES.DATASETS, id: datasetId as string });

      if (dataset) {
        // Validate the import-file owner has access to the target dataset's catalog
        await validateDatasetAccessForUser(payload, dataset, userId);
      } else {
        if (!mapping.skipIfMissing) {
          throw new Error(`Configured dataset not found for sheet ${sheetName}`);
        }
        skipSheet = true;
      }
    } else {
      logger.info("No mapping found for sheet, skipping", { sheetName });
      return null;
    }
  } else {
    const resolvedCatalogId = await getOrCreateCatalog(payload, catalogId, userId);
    dataset = await findOrCreateDataset(payload, resolvedCatalogId, sheetName, userId);
  }

  if (skipSheet || !dataset) {
    return null;
  }

  return payload.create({
    collection: COLLECTION_NAMES.INGEST_JOBS,
    data: {
      ingestFile: normalizeIngestFileRelationId(ingestFile.id),
      dataset: dataset.id,
      sheetIndex: sheet.index,
      stage: PROCESSING_STAGE.ANALYZE_DUPLICATES,
      progress: { stages: {}, overallPercentage: 0, estimatedCompletionTime: null },
      configSnapshot: buildConfigSnapshot(dataset),
    },
  });
};

export const datasetDetectionJob = {
  slug: JOB_TYPES.DATASET_DETECTION,
  retries: 1,
  outputSchema: [
    { name: "sheetsDetected", type: "number" as const },
    { name: "ingestJobsCreated", type: "number" as const },
    { name: "sheets", type: "json" as const },
    { name: "reason", type: "text" as const },
  ],
  onFail: async (args: TaskCallbackArgs) => {
    const ingestFileId = (args.input as Record<string, unknown> | undefined)?.ingestFileId;
    if (typeof ingestFileId !== "string" && typeof ingestFileId !== "number") return;
    try {
      await args.req.payload.update({
        collection: COLLECTION_NAMES.INGEST_FILES,
        id: ingestFileId,
        data: {
          status: "failed",
          errorLog: typeof args.job.error === "string" ? args.job.error : "Task failed after all retries",
        },
      });
    } catch {
      // Best-effort — don't throw in onFail
    }
  },
  handler: async (context: JobHandlerContext) => {
    const { payload } = context.req;
    const input = (context.input ?? context.job?.input) as DatasetDetectionJobInput["input"];
    const { ingestFileId, catalogId } = input;
    const jobId = String(context.job?.id ?? "unknown");

    logger.info("Starting dataset detection job", { jobId, ingestFileId, catalogId });

    try {
      const ingestFile = await payload.findByID({
        collection: COLLECTION_NAMES.INGEST_FILES,
        id: String(ingestFileId),
      });

      if (!ingestFile) {
        throw new Error("Ingest file not found");
      }

      // Resolve catalogId: prefer explicit input, fall back to ingest file's catalog relation.
      // Workflows may not pass catalogId in their input, so this ensures dataset-detection
      // always knows which catalog to search for existing datasets.
      const resolvedCatalogId = catalogId ?? (extractRelationId(ingestFile.catalog) as string | undefined);

      let filePath = getIngestFilePath(ingestFile.filename ?? "");

      if (!fs.existsSync(filePath)) {
        throw new Error(`Cannot access file ${filePath}`);
      }

      // Fast-path: skip file I/O for wizard imports that already have complete metadata
      const wizardSheets = buildSheetsFromWizardMetadata((ingestFile.metadata as Record<string, unknown>) ?? {});

      let sheets: SheetInfo[];

      if (wizardSheets) {
        sheets = wizardSheets;
        logger.info("Using wizard metadata fast-path", { ingestFileId, sheetCount: sheets.length });
      } else {
        let fileExtension = path.extname(filePath).toLowerCase();

        // GeoJSON/JSON files need conversion to CSV before processing.
        // Write CSV alongside original and update the ingest-file record so downstream tasks
        // (analyze-duplicates, create-events, etc.) also read the converted CSV.
        const conversion = await convertToCsvIfNeeded(filePath, fileExtension);
        if (conversion) {
          filePath = conversion.filePath;
          fileExtension = conversion.fileExtension;

          await payload.update({
            collection: COLLECTION_NAMES.INGEST_FILES,
            id: ingestFileId,
            data: { filename: path.basename(conversion.filePath), mimeType: "text/csv" },
            overrideAccess: true,
          });

          logger.info("Converted file to CSV for dataset detection", { ingestFileId, ...conversion.logInfo });
        }

        // xlsx library handles .xls, .xlsx, and .ods files
        sheets = fileExtension === ".csv" ? await processCSVFile(filePath) : processExcelFile(filePath);
      }

      if (sheets.length === 0) {
        throw new Error("No valid sheets found in file");
      }

      logger.info("Detected sheets", {
        ingestFileId,
        sheetCount: sheets.length,
        sheets: sheets.map((s) => ({ name: s.name, rows: s.rowCount })),
      });

      await payload.update({
        collection: COLLECTION_NAMES.INGEST_FILES,
        id: ingestFileId,
        data: { ...(!wizardSheets && { datasetsCount: sheets.length }), sheetMetadata: sheets },
      });

      const datasetMapping = (ingestFile.metadata as Record<string, unknown>)?.datasetMapping as
        | { mappingType: string; singleDataset?: unknown; sheetMappings?: unknown[] }
        | undefined;

      // Extract userId from import file for setting createdBy on auto-created catalogs/datasets
      const userId = extractRelationId(ingestFile.user) as number;

      const createdJobs =
        sheets.length === 1
          ? [await handleSingleSheet(payload, ingestFile, resolvedCatalogId, datasetMapping, userId)]
          : await handleMultipleSheets(payload, ingestFile, sheets, resolvedCatalogId, datasetMapping, userId);

      logger.info("Created import jobs", {
        ingestFileId,
        jobCount: createdJobs.length,
        jobIds: createdJobs.map((j) => j.id),
      });

      return {
        output: {
          sheetsDetected: sheets.length,
          ingestJobsCreated: createdJobs.length,
          sheets: createdJobs.map((j, i) => ({
            index: i,
            ingestJobId: j.id,
            name: sheets[i]?.name ?? `Sheet ${i}`,
            rowCount: sheets[i]?.rowCount ?? 0,
          })),
        },
      };
    } catch (error) {
      logError(error, "Dataset detection failed", { jobId, ingestFileId });

      await payload.update({
        collection: COLLECTION_NAMES.INGEST_FILES,
        id: ingestFileId,
        data: { status: "failed", errorLog: error instanceof Error ? error.message : "Unknown error" },
      });

      // Throw — Payload marks workflow as failed; onFail updates ingest file status
      throw error;
    }
  },
};
