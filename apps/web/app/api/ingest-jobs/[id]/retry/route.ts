/**
 * Retries a failed import job.
 *
 * Uses ErrorRecoveryService to classify the error, determine the appropriate
 * recovery stage, and schedule the retry. The service handles quota checks
 * and atomic claiming internally.
 *
 * POST /api/ingest-jobs/:id/retry
 *
 * @module
 * @category API Routes
 */
import { z } from "zod";

import { apiRoute, safeFindByID, ValidationError } from "@/lib/api";
import { PROCESSING_STAGE } from "@/lib/constants/ingest-constants";
import { ErrorRecoveryService } from "@/lib/ingest/error-recovery";
import { logger } from "@/lib/logger";
import type { IngestJob } from "@/payload-types";

export const POST = apiRoute({
  auth: "required",
  site: "default",
  rateLimit: { configName: "IMPORT_RETRY" },
  params: z.object({ id: z.string() }),
  handler: async ({ payload, user, params }) => {
    const { id } = params;

    // Get the import job with access control
    const ingestJob = await safeFindByID<IngestJob>(payload, { collection: "ingest-jobs", id, depth: 1, user });

    // Verify job is in failed state
    if (ingestJob.stage !== PROCESSING_STAGE.FAILED) {
      throw new ValidationError(`Ingest job is not in failed state. Current stage: ${ingestJob.stage}`);
    }

    // Delegate to ErrorRecoveryService — handles quota, atomic claim, and job queueing
    const result = await ErrorRecoveryService.recoverFailedJob(payload, ingestJob.id);

    if (!result.success) {
      logger.warn({ ingestJobId: ingestJob.id, userId: user.id, reason: result.error }, "Manual retry attempt failed");

      throw new ValidationError(result.error ?? "Failed to retry import job");
    }

    logger.info(
      { ingestJobId: ingestJob.id, userId: user.id, nextRetryAt: result.nextRetryAt },
      "Manual retry initiated"
    );

    return {
      message: "Import retry scheduled successfully",
      nextRetryAt: result.nextRetryAt?.toISOString(),
      retryScheduled: result.retryScheduled,
    };
  },
});
