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
import { z } from "zod";

import { apiRoute, safeFindByID, ValidationError } from "@/lib/api";
import { PROCESSING_STAGE } from "@/lib/constants/ingest-constants";
import { logger } from "@/lib/logger";
import type { IngestJob } from "@/payload-types";

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
 * start from detect-schema since the ingest-process workflow begins there.
 */
const stageToResumeFrom = (stage: string): string => {
  switch (stage) {
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
    const ingestJob = await safeFindByID<IngestJob>(payload, { collection: "ingest-jobs", id, user });

    // Only allow resetting failed jobs
    if (ingestJob.stage !== PROCESSING_STAGE.FAILED) {
      throw new ValidationError(`Can only reset jobs in FAILED state. Current stage: ${ingestJob.stage}`);
    }

    // Reset the job stage and optionally clear error log
    const updateData: Record<string, unknown> = { stage: targetStage };
    if (clearRetries) {
      updateData.errorLog = null;
    }

    await payload.update({ collection: "ingest-jobs", id: ingestJob.id, data: updateData });

    // Queue the ingest-process workflow to resume from the target stage
    const resumeFrom = stageToResumeFrom(targetStage);
    await payload.jobs.queue({ workflow: "ingest-process", input: { ingestJobId: String(ingestJob.id), resumeFrom } });

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
