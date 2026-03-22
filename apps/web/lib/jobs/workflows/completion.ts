/**
 * IngestFile status update helpers for workflow completion.
 * Called from workflow handlers after all sheets are processed.
 * Replaces the hook-based handleJobCompletion which had transaction issues.
 * @module
 * @category Jobs
 */
import type { Payload } from "payload";

import { COLLECTION_NAMES, PROCESSING_STAGE } from "@/lib/constants/ingest-constants";
import { logger } from "@/lib/logger";
import { extractRelationId } from "@/lib/utils/relation-id";

import type { SheetInfo } from "../types/task-outputs";

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

export const updateIngestFileStatusForJob = async (payload: Payload, ingestJobId: string | number): Promise<void> => {
  try {
    const job = await payload.findByID({ collection: COLLECTION_NAMES.INGEST_JOBS, id: ingestJobId });
    const ingestFileId = extractRelationId(job?.ingestFile);
    if (!ingestFileId) return;
    await updateIngestFileStatusById(payload, ingestFileId);
  } catch (error) {
    logger.error("Failed to update ingest file status for job", { error, ingestJobId });
  }
};

const updateIngestFileStatusById = async (payload: Payload, ingestFileId: string | number): Promise<void> => {
  const allJobs = await payload.find({
    collection: COLLECTION_NAMES.INGEST_JOBS,
    where: { ingestFile: { equals: ingestFileId } },
    pagination: false,
  });
  if (allJobs.docs.length === 0) return;

  const allDone = allJobs.docs.every(
    (j) =>
      j.stage === PROCESSING_STAGE.COMPLETED ||
      j.stage === PROCESSING_STAGE.FAILED ||
      j.stage === PROCESSING_STAGE.NEEDS_REVIEW
  );
  if (!allDone) return;

  const hasReview = allJobs.docs.some((j) => j.stage === PROCESSING_STAGE.NEEDS_REVIEW);
  if (hasReview) return;

  const hasFailures = allJobs.docs.some((j) => j.stage === PROCESSING_STAGE.FAILED);
  const newStatus = hasFailures ? "failed" : "completed";

  await payload.update({
    collection: COLLECTION_NAMES.INGEST_FILES,
    id: ingestFileId,
    data: { status: newStatus },
    context: { skipIngestFileHooks: true },
  });

  logger.info("Updated ingest file status", { ingestFileId, status: newStatus, totalJobs: allJobs.docs.length });
};
