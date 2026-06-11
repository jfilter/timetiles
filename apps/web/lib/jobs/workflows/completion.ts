/**
 * IngestFile status update helpers for workflow completion.
 * Called from workflow handlers after all sheets are processed.
 * Replaces the hook-based handleJobCompletion which had transaction issues.
 * @module
 * @category Jobs
 */
import type { Payload } from "payload";

import { COLLECTION_NAMES } from "@/lib/constants/ingest-constants";
import { updateIngestFileStatusById, updateIngestFileStatusForJob } from "@/lib/ingest/ingest-file-status";
import { logger } from "@/lib/logger";
import { extractRelationId } from "@/lib/utils/relation-id";

import type { SheetInfo } from "../types/task-outputs";

// Status derivation lives in lib/ingest/ingest-file-status.ts (domain layer) so
// the ingest-jobs approval hook can also call it in-transaction.
export { updateIngestFileStatusForJob };

export const updateIngestFileStatus = async (payload: Payload, sheets: SheetInfo[]): Promise<void> => {
  if (sheets.length === 0) return;
  try {
    const firstSheet = sheets[0];
    if (!firstSheet) return;
    const firstJobId = firstSheet.ingestJobId;
    const firstJob = await payload.findByID({ collection: COLLECTION_NAMES.INGEST_JOBS, id: firstJobId });
    const ingestFileId = extractRelationId(firstJob?.ingestFile);
    if (!ingestFileId) return;
    await updateIngestFileStatusById(payload, ingestFileId);
  } catch (error) {
    logger.error("Failed to update ingest file status", { error, sheetCount: sheets.length });
  }
};
