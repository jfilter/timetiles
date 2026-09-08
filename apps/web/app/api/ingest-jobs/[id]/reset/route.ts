/**
 * Resets a failed import job to a specific stage for recovery or debugging.
 *
 * This is a powerful admin-only operation that bypasses normal stage transition
 * rules. Resets the job stage and queues the ingest-process workflow to resume
 * processing from the target stage.
 *
 * POST /api/ingest-jobs/:id/reset
 *
 * @module
 * @category API Routes
 */
import { eq } from "@payloadcms/db-postgres/drizzle";
import { commitTransaction, createLocalReq, initTransaction, killTransaction } from "payload";
import { z } from "zod";

import { apiRoute, safeFindByID, ValidationError } from "@/lib/api";
import { PROCESSING_STAGE } from "@/lib/constants/ingest-constants";
import { getTransactionAwareDrizzle } from "@/lib/database/drizzle-transaction";
import { prepareIngestFileRecovery } from "@/lib/ingest/ingest-file-status";
import { logger } from "@/lib/logger";
import { requireRelationId } from "@/lib/utils/relation-id";
import { ingest_jobs } from "@/payload-generated-schema";

/**
 * Valid stages an admin can reset a failed job to.
 * These correspond to points where the ingest-process workflow can resume.
 */
const VALID_RESET_STAGES = [
  PROCESSING_STAGE.ANALYZE_DUPLICATES,
  PROCESSING_STAGE.DETECT_SCHEMA,
  PROCESSING_STAGE.VALIDATE_SCHEMA,
  PROCESSING_STAGE.GEOCODE_BATCH,
  PROCESSING_STAGE.CREATE_EVENTS,
] as const;

/**
 * Maps a recovery stage to the appropriate resumeFrom value for the
 * ingest-process workflow. Stages before detect-schema (like analyze-duplicates)
 * now resume from analyze-duplicates so the pipeline can rebuild duplicate and
 * quota review state before downstream stages run.
 */
const stageToResumeFrom = (stage: string): string => {
  switch (stage) {
    case PROCESSING_STAGE.ANALYZE_DUPLICATES:
      return "analyze-duplicates";
    case PROCESSING_STAGE.CREATE_EVENTS:
      return "create-events";
    case PROCESSING_STAGE.GEOCODE_BATCH:
    case PROCESSING_STAGE.CREATE_SCHEMA_VERSION:
      return "create-schema-version";
    default:
      return "detect-schema";
  }
};

export const POST = apiRoute({
  auth: "admin",
  site: "default",
  rateLimit: { configName: "ADMIN_IMPORT_RESET" },
  params: z.object({ id: z.string() }),
  body: z.object({ targetStage: z.enum(VALID_RESET_STAGES), clearRetries: z.boolean().optional() }),
  handler: async ({ payload, user, params, body }) => {
    const { id } = params;
    const { targetStage, clearRetries = true } = body;

    // Get the import job (admins have access to all jobs)
    const ingestJob = await safeFindByID(payload, { collection: "ingest-jobs", id, user });

    // Only allow resetting failed jobs
    if (ingestJob.stage !== PROCESSING_STAGE.FAILED) {
      throw new ValidationError(`Can only reset jobs in FAILED state. Current stage: ${ingestJob.stage}`);
    }

    // Reset the job stage and optionally clear error log
    const updateData: Record<string, unknown> = { stage: targetStage };
    if (clearRetries) {
      updateData.errorLog = null;
    }

    const resumeFrom = stageToResumeFrom(targetStage);
    const req = await createLocalReq({ user }, payload);
    if (!(await initTransaction(req))) throw new Error("Ingest recovery requires a database transaction");
    try {
      await prepareIngestFileRecovery(req, requireRelationId(ingestJob.ingestFile));
      // Recheck under a row lock: another reset or retry may have claimed it since the access check.
      const db = await getTransactionAwareDrizzle(payload, req);
      const [current] = await db
        .select({ stage: ingest_jobs.stage })
        .from(ingest_jobs)
        .where(eq(ingest_jobs.id, ingestJob.id))
        .for("update");
      if (current?.stage !== PROCESSING_STAGE.FAILED) {
        throw new ValidationError("Ingest job is no longer in FAILED state.");
      }
      await payload.update({ collection: "ingest-jobs", id: ingestJob.id, data: updateData, req });
      await payload.jobs.queue({
        workflow: "ingest-process",
        input: { ingestJobId: String(ingestJob.id), resumeFrom },
        req,
      });
      await commitTransaction(req);
    } catch (error) {
      // Restore the whole update, including the error log, if queueing fails.
      await killTransaction(req);
      throw error;
    }

    logger.info(
      {
        ingestJobId: ingestJob.id,
        adminId: user.id,
        adminEmail: user.email,
        fromStage: ingestJob.stage,
        targetStage,
        resumeFrom,
        clearedRetries: clearRetries,
      },
      "Admin manually reset import job stage and queued workflow"
    );

    return {
      message: `Ingest job reset to ${targetStage}`,
      fromStage: ingestJob.stage,
      toStage: targetStage,
      retriesCleared: clearRetries,
    };
  },
});
