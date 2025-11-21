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

import { COLLECTION_NAMES, JOB_TYPES, PROCESSING_STAGE } from "@/lib/constants/import-constants";
import { logError, logger } from "@/lib/logger";
import type { Dataset } from "@/payload-types";

import type { DatasetDetectionJobInput } from "../types/job-inputs";
import type { JobHandlerContext } from "../utils/job-context";

interface SheetInfo {
  name: string;
  index: number;
  rowCount: number;
  columnCount?: number;
  headers?: string[];
}

// Extract file processing functions
const processCSVFile = (filePath: string): { sheets: SheetInfo[]; workbook: unknown } => {
  logger.info("Processing CSV file", { filePath });
  const csvContent = fs.readFileSync(filePath, "utf8");

  const parseResult = Papa.parse(csvContent, {
    header: false,
    skipEmptyLines: true,
    dynamicTyping: true,
  });

  const rows = parseResult.data as string[][];
  if (rows.length === 0) {
    throw new Error("No data rows found in file");
  }

  const sheets: SheetInfo[] = [
    {
      name: "CSV Data",
      index: 0,
      rowCount: rows.length - 1,
      columnCount: rows[0]?.length ?? 0,
      headers: rows[0] ?? [],
    },
  ];

  const workbook = {
    SheetNames: ["Sheet1"],
    Sheets: {
      Sheet1: utils.aoa_to_sheet(rows),
    },
  };

  return { sheets, workbook };
};

const processExcelFile = (filePath: string): { sheets: SheetInfo[]; workbook: unknown } => {
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

  return { sheets, workbook };
};

const handleSingleSheet = async (
  payload: Payload,
  importFile: { id: string | number; originalName?: string | null; metadata?: unknown },
  _sheet: SheetInfo,
  catalogId?: string,
  datasetMapping?: { mappingType: string; singleDataset?: unknown }
) => {
  let dataset;

  if (datasetMapping?.mappingType === "single" && datasetMapping.singleDataset) {
    const datasetId =
      typeof datasetMapping.singleDataset === "object" && datasetMapping.singleDataset != null
        ? (datasetMapping.singleDataset as { id: string }).id
        : (datasetMapping.singleDataset as string);

    dataset = await payload.findByID({
      collection: COLLECTION_NAMES.DATASETS,
      id: datasetId,
    });

    if (!dataset) {
      throw new Error(`Configured dataset not found: ${datasetId}`);
    }
  } else {
    const resolvedCatalogId = await getOrCreateCatalog(payload, catalogId);
    dataset = await findOrCreateDataset(payload, resolvedCatalogId, importFile.originalName ?? "Imported Data");
  }

  return payload.create({
    collection: COLLECTION_NAMES.IMPORT_JOBS,
    data: {
      importFile: typeof importFile.id === "string" ? parseInt(importFile.id, 10) : importFile.id,
      dataset: dataset.id,
      sheetIndex: 0,
      stage: PROCESSING_STAGE.ANALYZE_DUPLICATES,
      progress: {
        stages: {},
        overallPercentage: 0,
        estimatedCompletionTime: null,
      },
    },
  });
};

const handleMultipleSheets = async (
  payload: Payload,
  importFile: { id: string | number },
  sheets: SheetInfo[],
  catalogId?: string,
  datasetMapping?: { mappingType: string; sheetMappings?: unknown[] }
) => {
  const createdJobs = [];

  for (const sheet of sheets) {
    const sheetName = sheet.name?.toString() ?? `Sheet_${sheet.index?.toString() ?? "Unknown"}`;
    const job = await processSheetWithMapping(payload, importFile, sheet, sheetName, catalogId, datasetMapping);

    if (job) {
      createdJobs.push(job);
    }
  }

  return createdJobs;
};

const processSheetWithMapping = async (
  payload: Payload,
  importFile: { id: string | number },
  sheet: SheetInfo,
  sheetName: string,
  catalogId?: string,
  datasetMapping?: { mappingType: string; sheetMappings?: unknown[] }
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
      const datasetId = typeof mapping.dataset === "object" ? (mapping.dataset as { id: string }).id : mapping.dataset;

      dataset = await payload.findByID({
        collection: COLLECTION_NAMES.DATASETS,
        id: datasetId as string,
      });

      if (!dataset) {
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
    const resolvedCatalogId = await getOrCreateCatalog(payload, catalogId);
    dataset = await findOrCreateDataset(payload, resolvedCatalogId, sheetName);
  }

  if (skipSheet || !dataset) {
    return null;
  }

  return payload.create({
    collection: COLLECTION_NAMES.IMPORT_JOBS,
    data: {
      importFile: typeof importFile.id === "string" ? parseInt(importFile.id, 10) : importFile.id,
      dataset: dataset.id,
      sheetIndex: sheet.index,
      stage: PROCESSING_STAGE.ANALYZE_DUPLICATES,
      progress: {
        stages: {},
        overallPercentage: 0,
        estimatedCompletionTime: null,
      },
    },
  });
};

export const datasetDetectionJob = {
  slug: JOB_TYPES.DATASET_DETECTION,
  handler: async (context: JobHandlerContext) => {
    const payload = (context.req?.payload ?? context.payload) as Payload;
    const input = (context.input ?? context.job?.input) as DatasetDetectionJobInput["input"];
    const { importFileId, catalogId } = input;
    const jobId = String(context.job?.id ?? "unknown");

    logger.info("Starting dataset detection job", { jobId, importFileId, catalogId });

    try {
      const importFile = await payload.findByID({
        collection: COLLECTION_NAMES.IMPORT_FILES,
        id: String(importFileId),
      });

      if (!importFile) {
        throw new Error("Import file not found");
      }

      const uploadDir = path.resolve(process.cwd(), process.env.UPLOAD_DIR_IMPORT_FILES!);
      const filePath = path.join(uploadDir, importFile.filename ?? "");

      if (!fs.existsSync(filePath)) {
        throw new Error(`Cannot access file ${filePath}`);
      }

      const fileExtension = path.extname(filePath).toLowerCase();
      const { sheets } = fileExtension === ".csv" ? processCSVFile(filePath) : processExcelFile(filePath);

      if (sheets.length === 0) {
        throw new Error("No valid sheets found in file");
      }

      logger.info("Detected sheets", {
        importFileId,
        sheetCount: sheets.length,
        sheets: sheets.map((s) => ({ name: s.name, rows: s.rowCount })),
      });

      await payload.update({
        collection: COLLECTION_NAMES.IMPORT_FILES,
        id: importFileId,
        data: {
          datasetsCount: sheets.length,
          sheetMetadata: sheets,
        },
      });

      const datasetMapping = (importFile.metadata as Record<string, unknown>)?.datasetMapping as
        | { mappingType: string; singleDataset?: unknown; sheetMappings?: unknown[] }
        | undefined;

      const createdJobs =
        sheets.length === 1
          ? [await handleSingleSheet(payload, importFile, sheets[0]!, catalogId, datasetMapping)]
          : await handleMultipleSheets(payload, importFile, sheets, catalogId, datasetMapping);

      logger.info("Created import jobs", {
        importFileId,
        jobCount: createdJobs.length,
        jobIds: createdJobs.map((j) => j.id),
      });

      return {
        output: {
          sheetsDetected: sheets.length,
          importJobsCreated: createdJobs.length,
        },
      };
    } catch (error) {
      logError(error, "Dataset detection failed", { jobId, importFileId });

      await payload.update({
        collection: COLLECTION_NAMES.IMPORT_FILES,
        id: importFileId,
        data: {
          status: "failed",
          errorLog: error instanceof Error ? error.message : "Unknown error",
        },
      });

      throw error;
    }
  },
};

// Helper function to get or create catalog
const getOrCreateCatalog = async (payload: Payload, catalogId?: string): Promise<string> => {
  if (catalogId) {
    return catalogId;
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
    },
  });

  return String(newCatalog.id);
};

// Helper function to find or create dataset
const findOrCreateDataset = async (payload: Payload, catalogId: string, datasetName: string): Promise<Dataset> => {
  // Try to find existing dataset in catalog
  const existingDatasets = await payload.find({
    collection: COLLECTION_NAMES.DATASETS,
    where: {
      catalog: { equals: parseInt(catalogId, 10) },
      name: { equals: datasetName },
    },
    limit: 1,
  });

  if (existingDatasets.docs.length > 0 && existingDatasets.docs[0]) {
    logger.info("Found existing dataset", {
      datasetId: existingDatasets.docs[0].id,
      name: datasetName,
    });
    return existingDatasets.docs[0];
  }

  // Create new dataset if not found
  const newDataset = await payload.create({
    collection: COLLECTION_NAMES.DATASETS,
    data: {
      name: datasetName,
      catalog: parseInt(catalogId, 10),
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
      deduplicationConfig: {
        enabled: true,
        strategy: "skip",
      },
      schemaConfig: {
        autoGrow: true,
        autoApproveNonBreaking: true,
        locked: false,
        strictValidation: false,
        allowTransformations: true,
      },
      idStrategy: {
        type: "auto",
        duplicateStrategy: "skip",
      },
      _status: "published" as const,
    },
  });

  logger.info("Created new dataset", {
    datasetId: newDataset.id,
    name: datasetName,
    catalogId,
  });

  return newDataset;
};
