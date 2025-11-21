/**
 * Common utility functions for loading job resources across job handlers.
 *
 * These functions eliminate code duplication by providing reusable loaders for:
 * - Import jobs, datasets, and import files
 * - File paths for import files
 * - Duplicate row extraction
 *
 * @module
 * @category Jobs/Utils
 */
import path from "node:path";

import type { Payload } from "payload";

import { COLLECTION_NAMES } from "@/lib/constants/import-constants";
import type { Dataset, ImportFile, ImportJob } from "@/payload-types";

/**
 * Load import job by ID
 */
export const loadImportJob = async (payload: Payload, importJobId: number | string): Promise<ImportJob> => {
  const job = await payload.findByID({
    collection: COLLECTION_NAMES.IMPORT_JOBS,
    id: importJobId,
  });

  if (!job) {
    throw new Error(`Import job not found: ${importJobId}`);
  }

  return job;
};

/**
 * Load dataset from job or by ID
 */
export const loadDataset = async (payload: Payload, datasetRef: number | string | Dataset): Promise<Dataset> => {
  const dataset =
    typeof datasetRef === "object"
      ? datasetRef
      : await payload.findByID({ collection: COLLECTION_NAMES.DATASETS, id: datasetRef });

  if (!dataset) {
    throw new Error("Dataset not found");
  }

  return dataset;
};

/**
 * Load import file from job or by ID
 */
export const loadImportFile = async (
  payload: Payload,
  importFileRef: number | string | ImportFile
): Promise<ImportFile> => {
  const importFile =
    typeof importFileRef === "object"
      ? importFileRef
      : await payload.findByID({ collection: COLLECTION_NAMES.IMPORT_FILES, id: importFileRef });

  if (!importFile) {
    throw new Error("Import file not found");
  }

  return importFile;
};

/**
 * Load all job resources (job, dataset, and import file)
 */
export const loadJobResources = async (
  payload: Payload,
  importJobId: string | number
): Promise<{ job: ImportJob; dataset: Dataset; importFile: ImportFile }> => {
  const job = await loadImportJob(payload, importJobId);
  const dataset = await loadDataset(payload, job.dataset);
  const importFile = await loadImportFile(payload, job.importFile);

  return { job, dataset, importFile };
};

/**
 * Load job and file path
 */
export const loadJobAndFilePath = async (
  payload: Payload,
  importJobId: number | string
): Promise<{ job: ImportJob; importFile: ImportFile; filePath: string }> => {
  const job = await loadImportJob(payload, importJobId);
  const importFile = await loadImportFile(payload, job.importFile);

  const uploadDir = path.resolve(process.cwd(), process.env.UPLOAD_DIR_IMPORT_FILES!);
  const filePath = path.join(uploadDir, importFile.filename ?? "");

  return { job, importFile, filePath };
};

/**
 * Extract duplicate row numbers from import job
 */
export const extractDuplicateRows = (job: ImportJob): Set<number> => {
  const duplicateRows = new Set<number>();

  // Handle the duplicates field which can be of various types
  const duplicates = job.duplicates;
  if (duplicates && typeof duplicates === "object" && !Array.isArray(duplicates)) {
    // Check for internal duplicates
    if (Array.isArray(duplicates.internal)) {
      duplicates.internal.forEach((d: unknown) => {
        if (typeof d === "object" && d !== null && "rowNumber" in d) {
          duplicateRows.add((d as { rowNumber: number }).rowNumber);
        }
      });
    }
    // Check for external duplicates
    if (Array.isArray(duplicates.external)) {
      duplicates.external.forEach((d: unknown) => {
        if (typeof d === "object" && d !== null && "rowNumber" in d) {
          duplicateRows.add((d as { rowNumber: number }).rowNumber);
        }
      });
    }
  }

  return duplicateRows;
};
