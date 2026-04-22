/**
 * Shared helper for creating import-files records.
 *
 * Provides two functions:
 * - `createIngestFile` — creates the record only (for workflow-managed pipelines)
 * - `createIngestFileAndQueueDetection` — creates record + queues manual-ingest
 *
 * @module
 * @category Import
 */

import type { Payload } from "payload";

import { COLLECTION_NAMES } from "@/lib/constants/ingest-constants";
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
 * Create an import-files record without queuing any workflow.
 *
 * Use this when the caller's workflow already handles the pipeline
 * (e.g. `scheduled-ingest` and `scraper-ingest` workflows run their
 * own `dataset-detection` task after this step).
 *
 * Sets `isUrlImport: true` on the request context so the ingest-files
 * beforeOperation hook preserves the caller-provided `url-import-…`
 * filename instead of applying the usual uniquifier. Relying on this
 * context flag (rather than sniffing the filename prefix) prevents
 * users from bypassing the uniquifier by uploading files named
 * `url-import-…`.
 */
export const createIngestFile = async ({
  payload,
  importFileData,
  file,
  user,
}: CreateIngestFileParams): Promise<CreateIngestFileResult> => {
  const ingestFile = await payload.create({
    collection: COLLECTION_NAMES.INGEST_FILES,
    data: importFileData as Omit<IngestFile, "id" | "createdAt" | "updatedAt">,
    file,
    ...(user ? { user } : {}),
    context: { skipIngestFileHooks: true, isUrlImport: true },
  });

  return { ingestFileId: ingestFile.id };
};

/**
 * Create an import-files record AND queue a `manual-ingest` workflow.
 *
 * Only use this when no parent workflow is managing the pipeline.
 */
export const createIngestFileAndQueueDetection = async (
  params: CreateIngestFileParams
): Promise<CreateIngestFileResult> => {
  const { ingestFileId } = await createIngestFile(params);

  const workflowJob = await params.payload.jobs.queue({
    workflow: "manual-ingest",
    input: { ingestFileId: String(ingestFileId) },
  });

  await params.payload.update({
    collection: COLLECTION_NAMES.INGEST_FILES,
    id: ingestFileId,
    data: { status: "parsing", jobId: String(workflowJob.id) },
    context: { skipIngestFileHooks: true },
  });

  return { ingestFileId };
};
