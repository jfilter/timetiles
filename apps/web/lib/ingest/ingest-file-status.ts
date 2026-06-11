/**
 * Derives and persists the aggregate IngestFile status from its ingest jobs.
 *
 * Used by workflow completion (post-commit, no `req`) and by the ingest-jobs
 * approval hook (pre-commit — MUST pass `req` so the just-updated job stage is
 * visible inside the same transaction).
 *
 * @module
 * @category Ingest
 */
import type { Payload, PayloadRequest } from "payload";

import { COLLECTION_NAMES, PROCESSING_STAGE } from "@/lib/constants/ingest-constants";
import { logger } from "@/lib/logger";
import { extractRelationId } from "@/lib/utils/relation-id";

export const updateIngestFileStatusForJob = async (
  payload: Payload,
  ingestJobId: string | number,
  req?: PayloadRequest
): Promise<void> => {
  try {
    const job = await payload.findByID({ collection: COLLECTION_NAMES.INGEST_JOBS, id: ingestJobId, req });
    const ingestFileId = extractRelationId(job?.ingestFile);
    if (!ingestFileId) return;
    await updateIngestFileStatusById(payload, ingestFileId, req);
  } catch (error) {
    logger.error("Failed to update ingest file status for job", { error, ingestJobId });
  }
};

export const updateIngestFileStatusById = async (
  payload: Payload,
  ingestFileId: string | number,
  req?: PayloadRequest
): Promise<void> => {
  const allJobs = await payload.find({
    collection: COLLECTION_NAMES.INGEST_JOBS,
    where: { ingestFile: { equals: ingestFileId } },
    pagination: false,
    req,
  });
  if (allJobs.docs.length === 0) return;

  const terminalJobs = allJobs.docs.filter(
    (j) =>
      j.stage === PROCESSING_STAGE.COMPLETED ||
      j.stage === PROCESSING_STAGE.FAILED ||
      j.stage === PROCESSING_STAGE.NEEDS_REVIEW
  );

  const allDone = terminalJobs.length === allJobs.docs.length;
  if (!allDone) return;

  const hasReview = allJobs.docs.some((j) => j.stage === PROCESSING_STAGE.NEEDS_REVIEW);
  if (hasReview) {
    await payload.update({
      collection: COLLECTION_NAMES.INGEST_FILES,
      id: ingestFileId,
      data: { status: "processing", datasetsProcessed: terminalJobs.length },
      context: { skipIngestFileHooks: true },
      req,
    });
    return;
  }

  const hasFailures = allJobs.docs.some((j) => j.stage === PROCESSING_STAGE.FAILED);
  const newStatus = hasFailures ? "failed" : "completed";
  const completedAt = new Date().toISOString();

  await payload.update({
    collection: COLLECTION_NAMES.INGEST_FILES,
    id: ingestFileId,
    data: { status: newStatus, datasetsProcessed: terminalJobs.length, completedAt },
    context: { skipIngestFileHooks: true },
    req,
  });

  logger.info("Updated ingest file status", {
    ingestFileId,
    status: newStatus,
    datasetsProcessed: terminalJobs.length,
    totalJobs: allJobs.docs.length,
  });
};
