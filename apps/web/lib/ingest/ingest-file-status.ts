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
import { eq } from "@payloadcms/db-postgres/drizzle";
import type { Payload, PayloadRequest } from "payload";

import { ValidationError } from "@/lib/api/errors";
import { COLLECTION_NAMES, PROCESSING_STAGE } from "@/lib/constants/ingest-constants";
import { getTransactionAwareDrizzle } from "@/lib/database/drizzle-transaction";
import { logger } from "@/lib/logger";
import { extractRelationId } from "@/lib/utils/relation-id";
import { ingest_files } from "@/payload-generated-schema";

/** Protect the source from cleanup. The caller must pass its active recovery transaction. */
export const prepareIngestFileRecovery = async (req: PayloadRequest, ingestFileId: number): Promise<void> => {
  const db = await getTransactionAwareDrizzle(req.payload, req);
  const [file] = await db
    .select({ filename: ingest_files.filename })
    .from(ingest_files)
    .where(eq(ingest_files.id, ingestFileId))
    .for("update");
  if (!file?.filename) {
    throw new ValidationError("The source file is no longer available. Please upload it again.");
  }
  await req.payload.update({
    collection: COLLECTION_NAMES.INGEST_FILES,
    id: ingestFileId,
    data: { status: "processing", completedAt: null },
    context: { skipIngestFileHooks: true },
    // Status is client-immutable. Keep the recovery transaction, but perform
    // this internal write without changing the caller's user/audit context.
    req: { ...req, user: null },
  });
};

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
