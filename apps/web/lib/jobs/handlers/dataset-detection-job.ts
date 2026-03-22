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

import Papa from "papaparse";
import type { Payload } from "payload";
import { read, utils } from "xlsx";

import { COLLECTION_NAMES, JOB_TYPES, PROCESSING_STAGE } from "@/lib/constants/ingest-constants";
import { logError, logger } from "@/lib/logger";
import { parseStrictInteger } from "@/lib/utils/event-params";
import { extractRelationId, requireRelationId } from "@/lib/utils/relation-id";
import type { Dataset } from "@/payload-types";

import type { DatasetDetectionJobInput } from "../types/job-inputs";
import type { JobHandlerContext, TaskCallbackArgs } from "../utils/job-context";
import { getIngestFilePath } from "../utils/upload-path";

interface SheetInfo {
  name: string;
  index: number;
  rowCount: number;
  columnCount?: number;
  headers?: string[];
}

const normalizeIngestFileRelationId = (ingestFileId: string | number): number => {
  const normalizedIngestFileId = typeof ingestFileId === "number" ? ingestFileId : parseStrictInteger(ingestFileId);
  if (normalizedIngestFileId == null) {
    throw new Error("Invalid import file ID");
  }
  return normalizedIngestFileId;
};

// Extract file processing functions
const processCSVFile = (filePath: string): SheetInfo[] => {
  logger.info("Processing CSV file", { filePath });
  const csvContent = fs.readFileSync(filePath, "utf8");

  const parseResult = Papa.parse(csvContent, { header: false, skipEmptyLines: true, dynamicTyping: true });

  const rows = parseResult.data as string[][];
  if (rows.length === 0) {
    throw new Error("No data rows found in file");
  }

  return [
    {
      name: "CSV Data",
      index: 0,
      rowCount: rows.length - 1,
      columnCount: rows[0]?.length ?? 0,
      headers: rows[0] ?? [],
    },
  ];
};

const processExcelFile = (filePath: string): SheetInfo[] => {
  logger.info("Processing Excel file", { filePath });
  const fileBuffer = fs.readFileSync(filePath);
  const workbook = read(fileBuffer, { type: "buffer" });
  const sheets: SheetInfo[] = [];

  for (let i = 0; i < workbook.SheetNames.length; i++) {
    const sheetName = workbook.SheetNames[i];
    const worksheet = workbook.Sheets[sheetName!];
    if (!worksheet) continue;

    const jsonData = utils.sheet_to_json(worksheet, { header: 1 });
    if (jsonData.length > 0 && jsonData[0]) {
      sheets.push({
        name: sheetName ?? `Sheet${i}`,
        index: i,
        rowCount: jsonData.length - 1,
        columnCount: Array.isArray(jsonData[0]) ? jsonData[0].length : 0,
        headers: Array.isArray(jsonData[0]) ? jsonData[0] : [],
      });
    }
  }

  return sheets;
};

/**
 * Build minimal SheetInfo from wizard metadata, skipping file I/O.
 * Returns null if metadata is incomplete (falls through to normal parsing).
 */
const buildSheetsFromWizardMetadata = (metadata: Record<string, unknown>): SheetInfo[] | null => {
  if (metadata.source !== "import-wizard") return null;

  const datasetMapping = metadata.datasetMapping as
    | { mappingType: string; singleDataset?: unknown; sheetMappings?: unknown[] }
    | undefined;
  if (!datasetMapping) return null;

  if (datasetMapping.mappingType === "single") {
    return [{ name: "Sheet 1", index: 0, rowCount: 0 }];
  }

  const wizardConfig = metadata.wizardConfig as
    | { sheetMappings?: Array<{ sheetIndex: number; newDatasetName?: string }> }
    | undefined;

  if (datasetMapping.mappingType === "multiple" && wizardConfig?.sheetMappings?.length) {
    return wizardConfig.sheetMappings.map((sm) => ({
      name: sm.newDatasetName ?? `Sheet ${sm.sheetIndex + 1}`,
      index: sm.sheetIndex,
      rowCount: 0,
    }));
  }

  return null;
};

/** Build an immutable config snapshot from a dataset for the import job record. */
const buildConfigSnapshot = (dataset: Dataset) => ({
  fieldMappingOverrides: dataset.fieldMappingOverrides ?? null,
  idStrategy: dataset.idStrategy ?? null,
  deduplicationConfig: dataset.deduplicationConfig ?? null,
  geoFieldDetection: dataset.geoFieldDetection ?? null,
  schemaConfig: dataset.schemaConfig ?? null,
  ingestTransforms: dataset.ingestTransforms ?? [],
});

/**
 * Validates that a user has access to the dataset's catalog.
 * Throws if the user does not own the catalog and it is not public.
 */
const validateDatasetAccessForUser = async (
  payload: Payload,
  dataset: Dataset,
  userId: number | undefined
): Promise<void> => {
  if (!userId) return;

  const catalogId = extractRelationId(dataset.catalog);
  if (!catalogId) return;

  const catalog = await payload.findByID({ collection: "catalogs", id: catalogId, overrideAccess: true });

  const catalogOwnerId = extractRelationId(catalog?.createdBy);
  const isPublicCatalog = catalog?.isPublic ?? false;

  if (catalogOwnerId !== userId && !isPublicCatalog) {
    throw new Error(
      `Ingest file owner does not have access to the target dataset (dataset ${dataset.id} in catalog ${catalogId})`
    );
  }
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
    { name: "success", type: "checkbox" as const, required: true },
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

      const filePath = getIngestFilePath(ingestFile.filename ?? "");

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
        const fileExtension = path.extname(filePath).toLowerCase();
        // xlsx library handles .xls, .xlsx, and .ods files
        sheets = fileExtension === ".csv" ? processCSVFile(filePath) : processExcelFile(filePath);
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
          success: true,
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

      return { output: { success: false, reason: error instanceof Error ? error.message : "Unknown error" } };
    }
  },
};

// Helper function to get or create catalog
const getOrCreateCatalog = async (payload: Payload, catalogId?: string | number, userId?: number): Promise<number> => {
  if (typeof catalogId === "number") {
    return catalogId;
  }

  if (catalogId) {
    const parsedCatalogId = parseStrictInteger(catalogId);
    if (parsedCatalogId == null) {
      throw new Error("Invalid catalog ID");
    }

    return parsedCatalogId;
  }

  // Create new catalog for this import
  const newCatalog = await payload.create({
    collection: COLLECTION_NAMES.CATALOGS,
    data: {
      name: `Import Catalog ${new Date().toISOString().split("T")[0]}`,
      description: {
        root: {
          type: "root",
          children: [
            {
              type: "paragraph",
              version: 1,
              children: [{ type: "text", version: 1, text: "Auto-generated catalog for imported data" }],
            },
          ],
          direction: "ltr",
          format: "",
          indent: 0,
          version: 1,
        },
      },
      _status: "published",
      ...(userId ? { createdBy: userId } : {}),
    },
  });

  if (typeof newCatalog.id === "number") {
    return newCatalog.id;
  }

  const parsedCatalogId = parseStrictInteger(String(newCatalog.id));
  if (parsedCatalogId == null) {
    throw new Error("Invalid catalog ID");
  }

  return parsedCatalogId;
};

// Helper function to find or create dataset
const findOrCreateDataset = async (
  payload: Payload,
  catalogId: number,
  datasetName: string,
  userId?: number
): Promise<Dataset> => {
  // Try to find existing dataset in catalog
  const existingDatasets = await payload.find({
    collection: COLLECTION_NAMES.DATASETS,
    where: { catalog: { equals: catalogId }, name: { equals: datasetName } },
    limit: 1,
  });

  if (existingDatasets.docs.length > 0 && existingDatasets.docs[0]) {
    logger.info("Found existing dataset", { datasetId: existingDatasets.docs[0].id, name: datasetName });
    return existingDatasets.docs[0];
  }

  // Create new dataset if not found
  const newDataset = await payload.create({
    collection: COLLECTION_NAMES.DATASETS,
    data: {
      name: datasetName,
      catalog: catalogId,
      description: {
        root: {
          type: "root",
          children: [
            {
              type: "paragraph",
              version: 1,
              children: [{ type: "text", version: 1, text: `Auto-created dataset for ${datasetName}` }],
            },
          ],
          direction: "ltr",
          format: "",
          indent: 0,
          version: 1,
        },
      },
      language: "eng",
      // Use default configurations
      deduplicationConfig: { enabled: true, strategy: "skip" },
      schemaConfig: {
        autoGrow: true,
        autoApproveNonBreaking: true,
        locked: false,
        strictValidation: false,
        allowTransformations: true,
      },
      idStrategy: { type: "auto", duplicateStrategy: "skip" },
      _status: "published" as const,
      ...(userId ? { createdBy: userId } : {}),
    },
  });

  logger.info("Created new dataset", { datasetId: newDataset.id, name: datasetName, catalogId });

  return newDataset;
};
