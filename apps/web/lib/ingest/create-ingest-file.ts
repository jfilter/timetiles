/**
 * Shared helper for creating an import-files record and queuing dataset detection.
 *
 * Both the url-fetch-job and scraper-execution-job follow the same three-step
 * pipeline after obtaining file data:
 *
 *   1. Create an import-files record with the attached file buffer.
 *   2. Queue a dataset-detection job for the new record.
 *   3. Update the record to status "parsing" with the queued job ID.
 *
 * This module extracts that pipeline into a single reusable function so changes
 * to the pipeline only need to be made in one place.
 *
 * @module
 * @category Import
 */

import type { Payload } from "payload";

import { COLLECTION_NAMES, JOB_TYPES } from "@/lib/constants/ingest-constants";
import type { IngestFile, User } from "@/payload-types";

/** The file buffer and its associated metadata. */
export interface IngestFileAttachment {
  /** Raw file content. */
  data: Buffer;
  /** MIME type of the file (e.g. "text/csv"). */
  mimetype: string;
  /** Generated filename to store on disk. */
  name: string;
  /** File size in bytes. */
  size: number;
}

/** Parameters for creating an import file and starting the detection pipeline. */
export interface CreateIngestFileParams {
  /** Payload instance. */
  payload: Payload;
  /** Data fields for the import-files record (originalName, catalog, metadata, etc.). */
  importFileData: Record<string, unknown>;
  /** File attachment (buffer + metadata). */
  file: IngestFileAttachment;
  /** Optional authenticated user to associate with the create call. */
  user?: User;
}

/** Result returned after the pipeline completes. */
export interface CreateIngestFileResult {
  /** ID of the newly created import-files record. */
  ingestFileId: number | string;
}

/**
 * Create an import-files record, queue dataset-detection, and mark the record
 * as "parsing". This is the shared pipeline used by url-fetch-job and
 * scraper-execution-job.
 */
export const createIngestFileAndQueueDetection = async ({
  payload,
  importFileData,
  file,
  user,
}: CreateIngestFileParams): Promise<CreateIngestFileResult> => {
  // Step 1: Create import-files record with attached file
  const ingestFile = await payload.create({
    collection: COLLECTION_NAMES.INGEST_FILES,
    data: importFileData as Omit<IngestFile, "id" | "createdAt" | "updatedAt">,
    file,
    ...(user ? { user } : {}),
    context: { skipIngestFileHooks: true },
  });

  // Step 2: Queue dataset detection job
  const detectionJob = await payload.jobs.queue({
    task: JOB_TYPES.DATASET_DETECTION,
    input: { ingestFileId: ingestFile.id },
  });

  // Step 3: Update status to "parsing" with the detection job ID
  await payload.update({
    collection: COLLECTION_NAMES.INGEST_FILES,
    id: ingestFile.id,
    data: { status: "parsing", jobId: String(detectionJob.id) },
    context: { skipIngestFileHooks: true },
  });

  return { ingestFileId: ingestFile.id };
};
