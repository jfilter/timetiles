/**
 * @module Defines the job handler for detecting datasets within an uploaded file.
 *
 * This job is the first step in the import process after a file is uploaded. It performs the following actions:
 * - Reads the uploaded file (supports CSV and Excel formats).
 * - Identifies all the individual sheets (for Excel) or the single data table (for CSV).
 * - For each detected sheet, it creates a corresponding `import-jobs` document.
 * - It either matches the sheet to an existing dataset in the specified catalog or creates a new dataset.
 * - It populates the `import-jobs` with initial metadata like row count and sets the first processing stage to `DEDUPLICATION`.
 */
import fs from "fs";
import Papa from "papaparse";
import path from "path";
import type { Payload } from "payload";
import { read, readFile, utils } from "xlsx";

import { COLLECTION_NAMES, IMPORT_STATUS, JOB_TYPES, PROCESSING_STAGE } from "@/lib/constants/import-constants";
import { logError, logger } from "@/lib/logger";
import { ProgressTrackingService } from "@/lib/services/progress-tracking";
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

export const datasetDetectionJob = {
  slug: JOB_TYPES.DATASET_DETECTION,
  handler: async (context: JobHandlerContext) => {
    const payload = (context.req?.payload ?? context.payload) as Payload;
    const input = (context.input ?? context.job?.input) as DatasetDetectionJobInput["input"];
    const { importFileId, catalogId } = input;

    const jobId = String(context.job?.id ?? "unknown");

    logger.info("Starting dataset detection job", {
      jobId,
      importFileId,
      catalogId,
    });

    try {
      // Get the import file
      const importFile = await payload.findByID({
        collection: "import-files",
        id: String(importFileId),
      });

      if (!importFile) {
        throw new Error("Import file not found");
      }

      // Get the actual file path
      const uploadDir = path.resolve(process.cwd(), process.env.UPLOAD_DIR_IMPORT_FILES!);
      const filePath = path.join(uploadDir, importFile.filename || "");

      // Debug file access
      logger.info("Attempting to access file", {
        filePath,
        filename: importFile.filename,
        uploadDir,
        fileExists: fs.existsSync(filePath),
      });

      // Check if file exists before processing
      if (!fs.existsSync(filePath)) {
        throw new Error(`Cannot access file ${filePath}`);
      }

      // Determine file type and parse accordingly
      const fileExtension = path.extname(filePath).toLowerCase();
      const sheets: SheetInfo[] = [];
      let workbook: any;

      if (fileExtension === ".csv") {
        // Handle CSV files with PapaParse
        logger.info("Processing CSV file", { filePath });

        const csvContent = fs.readFileSync(filePath, "utf8");

        // Parse CSV with PapaParse
        const parseResult = Papa.parse(csvContent, {
          header: false, // Keep as array of arrays for consistency
          skipEmptyLines: true,
          dynamicTyping: true,
        });

        const rows = parseResult.data as string[][];

        if (rows.length === 0) {
          throw new Error("No data rows found in file");
        }

        if (rows.length > 0) {
          sheets.push({
            name: "CSV Data",
            index: 0,
            rowCount: rows.length - 1, // Exclude header row
            columnCount: rows[0]?.length || 0,
            headers: rows[0] || [],
          });
        }

        // Create a mock workbook for consistency with Excel flow
        workbook = {
          SheetNames: ["Sheet1"],
          Sheets: {
            Sheet1: utils.aoa_to_sheet(rows),
          },
        };
      } else {
        // Handle Excel files with XLSX library
        logger.info("Processing Excel file", { filePath });
        const fileBuffer = fs.readFileSync(filePath);
        workbook = read(fileBuffer, { type: "buffer" }); // Use read with buffer and proper type
      }

      // For Excel files, process all sheets (CSV already processed above)
      if (fileExtension !== ".csv") {
        for (let i = 0; i < workbook.SheetNames.length; i++) {
          const sheetName = workbook.SheetNames[i];
          const worksheet = workbook.Sheets[sheetName!];
          if (!worksheet) continue;
          const jsonData = utils.sheet_to_json(worksheet, { header: 1 });

          if (jsonData.length > 0 && jsonData[0]) {
            sheets.push({
              name: sheetName || `Sheet${i}`,
              index: i,
              rowCount: jsonData.length - 1, // Exclude header
              columnCount: Array.isArray(jsonData[0]) ? jsonData[0].length : 0,
              headers: Array.isArray(jsonData[0]) ? jsonData[0] : [],
            });
          }
        }
      }

      if (sheets.length === 0) {
        throw new Error("No valid sheets found in file");
      }

      logger.info("Detected sheets", {
        importFileId,
        sheetCount: sheets.length,
        sheets: sheets.map((s) => ({ name: s.name, rows: s.rowCount })),
      });

      // Update import file with detected datasets
      await payload.update({
        collection: "import-files",
        id: importFileId,
        data: {
          datasetsCount: sheets.length,
          sheetMetadata: sheets,
        },
      });

      // Create import jobs for each sheet
      const createdJobs = [];

      if (sheets.length === 1) {
        // Single sheet - find dataset from catalog
        const resolvedCatalogId = await getOrCreateCatalog(payload, catalogId);
        const dataset = await findOrCreateDataset(
          payload,
          resolvedCatalogId,
          importFile.originalName || "Imported Data",
        );

        const importJob = await payload.create({
          collection: "import-jobs",
          data: {
            importFile: importFile.id,
            dataset: dataset.id,
            sheetIndex: 0,
            stage: PROCESSING_STAGE.ANALYZE_DUPLICATES,
            progress: ProgressTrackingService.createInitialProgress(sheets[0]!.rowCount),
          },
        });

        createdJobs.push(importJob);
      } else {
        // Multiple sheets - match by name or create new datasets
        for (const sheet of sheets) {
          const sheetName = sheet.name?.toString() ?? `Sheet_${sheet.index?.toString() ?? "Unknown"}`;
          const resolvedCatalogId = await getOrCreateCatalog(payload, catalogId);
          const dataset = await findOrCreateDataset(payload, resolvedCatalogId, sheetName);

          const importJob = await payload.create({
            collection: "import-jobs",
            data: {
              importFile: importFile.id,
              dataset: dataset.id,
              sheetIndex: sheet.index,
              stage: PROCESSING_STAGE.ANALYZE_DUPLICATES,
              progress: ProgressTrackingService.createInitialProgress(sheet.rowCount),
            },
          });

          createdJobs.push(importJob);
        }
      }

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
      logError(error, "Dataset detection failed", {
        jobId,
        importFileId,
      });

      // Update import file status to failed
      await payload.update({
        collection: "import-files",
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
    collection: "catalogs",
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
    collection: "datasets",
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
    collection: "datasets",
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

// Remove old createImportDataset function
const _unusedCreateImportDataset = async ({
  payload,
  importFileId,
  dataset,
  sheetInfo,
  filePath,
  userId,
  sessionId,
}: {
  payload: any;
  importFileId: string;
  dataset: Dataset;
  sheetInfo: SheetInfo;
  filePath: string;
  userId?: string;
  sessionId?: string;
}) => {
  return payload.create({
    collection: COLLECTION_NAMES.IMPORT_JOBS,
    data: {
      name: `${dataset.name} - ${sheetInfo.name}`,
      dataset: dataset.id,
      importFile: importFileId,
      status: IMPORT_STATUS.PENDING,
      processingStage: PROCESSING_STAGE.DETECT_SCHEMA,
      sheetName: sheetInfo.name,
      sheetIndex: sheetInfo.index,
      rowCount: sheetInfo.rowCount,
      columnCount: sheetInfo.columnCount,
      columnNames: sheetInfo.headers,
      filePath,
      user: userId || null,
      sessionId: sessionId || null,
      geocodingEnabled: false,
      validationEnabled: true,
      duplicateCheckEnabled: true,
    },
  });
};
