/**
 * Shared helper for creating ingest-files records in workflow-managed pipelines.
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

/** Parameters for creating an ingest file without starting a workflow. */
export interface CreateIngestFileParams {
  /** Payload instance. */
  payload: Payload;
  /** Data fields for the ingest-files record (originalName, catalog, metadata, etc.). */
  importFileData: Record<string, unknown>;
  /** File attachment (buffer + metadata). */
  file: IngestFileAttachment;
  /** Optional authenticated user to associate with the create call. */
  user?: User;
}

/** Result returned after the ingest file is created. */
export interface CreateIngestFileResult {
  /** ID of the newly created ingest-files record. */
  ingestFileId: number | string;
}

/**
 * Create an ingest-files record without queuing any workflow.
 *
 * Use this when the caller's workflow already handles the pipeline
 * (e.g. `scheduled-ingest` and `scraper-ingest` workflows run their
 * own `dataset-detection` task after this step).
 *
 * Sets request context flags so ingest-files hooks know this is a
 * programmatic file produced by another metered workflow. The hooks preserve
 * the caller-provided filename and skip FILE_UPLOADS_PER_DAY counting so URL
 * fetches and scraper runs are not double-charged as manual uploads.
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
    context: { skipIngestFileHooks: true, isUrlImport: true, skipFileUploadQuota: true },
  });

  return { ingestFileId: ingestFile.id };
};
