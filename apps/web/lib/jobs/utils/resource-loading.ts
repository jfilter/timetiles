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
import type { Payload } from "payload";

import { COLLECTION_NAMES, PROCESSING_STAGE } from "@/lib/constants/ingest-constants";
import type { Dataset, IngestFile, IngestJob } from "@/payload-types";

import { getIngestFilePath } from "./upload-path";

/**
 * Load import job by ID
 */
export const loadIngestJob = async (payload: Payload, ingestJobId: number | string): Promise<IngestJob> => {
  const job = await payload.findByID({ collection: COLLECTION_NAMES.INGEST_JOBS, id: ingestJobId });

  if (!job) {
    throw new Error(`Ingest job not found: ${ingestJobId}`);
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
export const loadIngestFile = async (
  payload: Payload,
  importFileRef: number | string | IngestFile
): Promise<IngestFile> => {
  const ingestFile =
    typeof importFileRef === "object"
      ? importFileRef
      : await payload.findByID({ collection: COLLECTION_NAMES.INGEST_FILES, id: importFileRef });

  if (!ingestFile) {
    throw new Error("Ingest file not found");
  }

  return ingestFile;
};

/**
 * Load all job resources (job, dataset, and import file)
 */
export const loadJobResources = async (
  payload: Payload,
  ingestJobId: string | number
): Promise<{ job: IngestJob; dataset: Dataset; ingestFile: IngestFile }> => {
  const job = await loadIngestJob(payload, ingestJobId);
  const dataset = await loadDataset(payload, job.dataset);
  const ingestFile = await loadIngestFile(payload, job.ingestFile);

  return { job, dataset, ingestFile };
};

/**
 * Load job and file path
 */
export const loadJobAndFilePath = async (
  payload: Payload,
  ingestJobId: number | string
): Promise<{ job: IngestJob; ingestFile: IngestFile; filePath: string }> => {
  const job = await loadIngestJob(payload, ingestJobId);
  const ingestFile = await loadIngestFile(payload, job.ingestFile);

  const filePath = getIngestFilePath(ingestFile.filename ?? "");

  return { job, ingestFile, filePath };
};

/**
 * Mark an import job as FAILED with a standardized error payload.
 *
 * Concentrates the repeated `payload.update({ stage: FAILED, ... })` pattern
 * from job handler catch blocks into one place.
 */
export const failIngestJob = async (
  payload: Payload,
  ingestJobId: string | number,
  error: unknown,
  context?: string
): Promise<void> => {
  const errorMessage = error instanceof Error ? error.message : String(error);

  await payload.update({
    collection: COLLECTION_NAMES.INGEST_JOBS,
    id: ingestJobId,
    data: { stage: PROCESSING_STAGE.FAILED, errorLog: { lastError: errorMessage, context: context ?? "unknown" } },
  });
};

/**
 * Extract duplicate row numbers from import job
 */
export const extractDuplicateRows = (job: IngestJob): Set<number> => {
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
