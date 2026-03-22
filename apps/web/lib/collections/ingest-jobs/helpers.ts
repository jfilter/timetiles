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
  // Extract ingest file ID, handling both relationship object and direct ID cases
  const ingestFileId = requireRelationId(doc.ingestFile, "ingestJob.ingestFile");

  // Check if all jobs for this ingest file are completed before marking file as completed
  const allJobs = await payload.find({
    collection: COLLECTION_NAMES.INGEST_JOBS,
    where: { ingestFile: { equals: ingestFileId } },
    pagination: false,
  });

  const allCompleted = allJobs.docs.every(
    (job: IngestJob) => job.stage === PROCESSING_STAGE.COMPLETED || job.stage === PROCESSING_STAGE.FAILED
  );

  if (allCompleted) {
    // All jobs for this file are done, mark file as completed
    const hasFailures = allJobs.docs.some((job: IngestJob) => job.stage === PROCESSING_STAGE.FAILED);
    await payload.update({
      collection: COLLECTION_NAMES.INGEST_FILES,
      id: ingestFileId,
      req, // Pass req to stay in same transaction
      data: { status: hasFailures ? "failed" : "completed" },
      context: {
        ...req?.context,
        skipIngestFileHooks: true, // Prevent infinite loops
      },
    });

    logger.info("Updated ingest file status", {
      ingestFileId,
      status: hasFailures ? "failed" : "completed",
      totalJobs: allJobs.docs.length,
    });
  }
};
