/**
 * Retries a failed import job.
 *
 * Uses ErrorRecoveryService to classify the error, determine the appropriate
 * recovery stage, and schedule the retry. The service handles quota checks
 * and atomic claiming internally.
 *
 * POST /api/import-jobs/:id/retry
 *
 * @module
 * @category API Routes
 */
import { z } from "zod";

import { apiRoute, safeFindByID, ValidationError } from "@/lib/api";
import { PROCESSING_STAGE } from "@/lib/constants/import-constants";
import { ErrorRecoveryService } from "@/lib/import/error-recovery";
import { logger } from "@/lib/logger";
import type { ImportJob } from "@/payload-types";

export const POST = apiRoute({
  auth: "required",
  site: "default",
  rateLimit: { configName: "IMPORT_RETRY" },
  params: z.object({ id: z.string() }),
  handler: async ({ payload, user, params }) => {
    const { id } = params;

    // Get the import job with access control
    const importJob = await safeFindByID<ImportJob>(payload, { collection: "import-jobs", id, depth: 1, user });

    // Verify job is in failed state
    if (importJob.stage !== PROCESSING_STAGE.FAILED) {
      throw new ValidationError(`Import job is not in failed state. Current stage: ${importJob.stage}`);
    }

    // Delegate to ErrorRecoveryService — handles quota, atomic claim, and job queueing
    const result = await ErrorRecoveryService.recoverFailedJob(payload, importJob.id);

    if (!result.success) {
      logger.warn({ importJobId: importJob.id, userId: user.id, reason: result.error }, "Manual retry attempt failed");

      throw new ValidationError(result.error ?? "Failed to retry import job");
    }

    logger.info(
      { importJobId: importJob.id, userId: user.id, nextRetryAt: result.nextRetryAt },
      "Manual retry initiated"
    );

    return {
      message: "Import retry scheduled successfully",
      nextRetryAt: result.nextRetryAt?.toISOString(),
      retryScheduled: result.retryScheduled,
    };
  },
});
