/**
 * Helper functions for import job processing.
 *
 * @module
 */
import type { Payload, PayloadRequest } from "payload";

import { COLLECTION_NAMES, PROCESSING_STAGE } from "@/lib/constants/import-constants";
import { logger } from "@/lib/logger";
import type { ImportJob } from "@/payload-types";

export const isJobCompleted = (doc: ImportJob): boolean => {
  return doc.stage === PROCESSING_STAGE.COMPLETED || doc.stage === PROCESSING_STAGE.FAILED;
};

export const handleJobCompletion = async (payload: Payload, doc: ImportJob, req?: PayloadRequest): Promise<void> => {
  // Extract import file ID, handling both relationship object and direct ID cases
  const importFileId = typeof doc.importFile === "object" ? doc.importFile.id : doc.importFile;

  // Check if all jobs for this import file are completed before marking file as completed
  const allJobs = await payload.find({
    collection: COLLECTION_NAMES.IMPORT_JOBS,
    where: {
      importFile: { equals: importFileId },
    },
  });

  const allCompleted = allJobs.docs.every(
    (job: ImportJob) => job.stage === PROCESSING_STAGE.COMPLETED || job.stage === PROCESSING_STAGE.FAILED
  );

  if (allCompleted) {
    // All jobs for this file are done, mark file as completed
    const hasFailures = allJobs.docs.some((job: ImportJob) => job.stage === PROCESSING_STAGE.FAILED);
    await payload.update({
      collection: COLLECTION_NAMES.IMPORT_FILES,
      id: importFileId,
      req, // Pass req to stay in same transaction
      data: { status: hasFailures ? "failed" : "completed" },
      context: {
        ...(req?.context ?? {}),
        skipImportFileHooks: true, // Prevent infinite loops
      },
    });

    logger.info("Updated import file status", {
      importFileId,
      status: hasFailures ? "failed" : "completed",
      totalJobs: allJobs.docs.length,
    });
  }
};
