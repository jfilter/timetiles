/**
 * Helper functions for import job processing.
 *
 * @module
 */
import type { Payload, PayloadRequest } from "payload";

import { COLLECTION_NAMES, PROCESSING_STAGE } from "@/lib/constants/ingest-constants";
import { logger } from "@/lib/logger";
import { requireRelationId } from "@/lib/utils/relation-id";
import type { IngestJob } from "@/payload-types";

export const isJobCompleted = (doc: IngestJob): boolean => {
  return doc.stage === PROCESSING_STAGE.COMPLETED || doc.stage === PROCESSING_STAGE.FAILED;
};

export const handleJobCompletion = async (payload: Payload, doc: IngestJob, req?: PayloadRequest): Promise<void> => {
  logger.info("handleJobCompletion called", { ingestJobId: doc.id, stage: doc.stage });

  // Extract ingest file ID, handling both relationship object and direct ID cases
  const ingestFileId = requireRelationId(doc.ingestFile, "ingestJob.ingestFile");

  // Check if all jobs for this ingest file are completed before marking file as completed.
  // Note: The current doc may not be committed yet (afterChange fires within the transaction),
  // so we query other jobs and use the current doc's stage directly.
  const otherJobs = await payload.find({
    collection: COLLECTION_NAMES.INGEST_JOBS,
    where: {
      ingestFile: { equals: ingestFileId },
      id: { not_equals: doc.id }, // Exclude current doc (use its live stage instead)
    },
    pagination: false,
  });

  const currentDocDone = doc.stage === PROCESSING_STAGE.COMPLETED || doc.stage === PROCESSING_STAGE.FAILED;
  const othersDone = otherJobs.docs.every(
    (job: IngestJob) => job.stage === PROCESSING_STAGE.COMPLETED || job.stage === PROCESSING_STAGE.FAILED
  );
  const allCompleted = currentDocDone && othersDone;

  if (allCompleted) {
    const hasFailures =
      doc.stage === PROCESSING_STAGE.FAILED ||
      otherJobs.docs.some((job: IngestJob) => job.stage === PROCESSING_STAGE.FAILED);

    await payload.update({
      collection: COLLECTION_NAMES.INGEST_FILES,
      id: ingestFileId,
      req,
      data: { status: hasFailures ? "failed" : "completed" },
      context: { ...req?.context, skipIngestFileHooks: true },
    });

    logger.info("Updated ingest file status", {
      ingestFileId,
      status: hasFailures ? "failed" : "completed",
      totalJobs: otherJobs.docs.length + 1,
    });
  }
};
