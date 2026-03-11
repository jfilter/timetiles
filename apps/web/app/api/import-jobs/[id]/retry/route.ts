/**
 * Retries a failed import job.
 *
 * Uses ErrorRecoveryService to classify the error, determine the appropriate
 * recovery stage, and schedule the retry. Includes quota checks and an atomic
 * claim pattern to prevent concurrent retries.
 *
 * POST /api/import-jobs/:id/retry
 *
 * @module
 * @category API Routes
 */
import { z } from "zod";

import { apiRoute, safeFindByID } from "@/lib/api";
import { PROCESSING_STAGE } from "@/lib/constants/import-constants";
import { QUOTA_TYPES } from "@/lib/constants/quota-constants";
import { logger } from "@/lib/logger";
import { ErrorRecoveryService } from "@/lib/services/error-recovery";
import { getQuotaService } from "@/lib/services/quota-service";
import { badRequest, forbidden } from "@/lib/utils/api-response";
import { extractRelationId } from "@/lib/utils/relation-id";
import type { ImportJob } from "@/payload-types";

export const POST = apiRoute({
  auth: "required",
  rateLimit: { configName: "IMPORT_RETRY" },
  params: z.object({ id: z.string() }),
  handler: async ({ payload, user, params }) => {
    const { id } = params;

    // Get the import job with access control
    const importJob = await safeFindByID<ImportJob>(payload, { collection: "import-jobs", id, depth: 1, user });

    // Verify job is in failed state
    if (importJob.stage !== PROCESSING_STAGE.FAILED) {
      return badRequest(`Import job is not in failed state. Current stage: ${importJob.stage}`);
    }

    // Atomically claim the retry by transitioning stage away from FAILED
    const claimResult = await payload.update({
      collection: "import-jobs",
      where: { id: { equals: importJob.id }, stage: { equals: PROCESSING_STAGE.FAILED } },
      data: { stage: PROCESSING_STAGE.FAILED },
      overrideAccess: true,
    });

    if (claimResult.docs.length === 0) {
      return badRequest("Retry already in progress for this import job");
    }

    // Get import file for quota check
    const importFileId = extractRelationId(importJob.importFile)!;
    const importFile = await payload.findByID({ collection: "import-files", id: importFileId, overrideAccess: true });

    // Check quota before allowing retry
    if (importFile.user) {
      const userId = extractRelationId(importFile.user)!;
      const fileUser = await payload.findByID({ collection: "users", id: userId, overrideAccess: true });

      const quotaService = getQuotaService(payload);
      const quotaCheck = await quotaService.checkQuota(fileUser, QUOTA_TYPES.IMPORT_JOBS_PER_DAY, 1);

      if (!quotaCheck.allowed) {
        return forbidden(
          "Quota exceeded. Cannot retry import at this time. Please try again tomorrow.",
          "QUOTA_EXCEEDED"
        );
      }
    }

    // Attempt recovery via ErrorRecoveryService
    const result = await ErrorRecoveryService.recoverFailedJob(payload, importJob.id);

    if (!result.success) {
      logger.warn({ importJobId: importJob.id, userId: user.id, reason: result.error }, "Manual retry attempt failed");

      return badRequest(result.error ?? "Failed to retry import job");
    }

    logger.info(
      { importJobId: importJob.id, userId: user.id, nextRetryAt: result.nextRetryAt },
      "Manual retry initiated"
    );

    return Response.json({
      success: true,
      message: "Import retry scheduled successfully",
      nextRetryAt: result.nextRetryAt?.toISOString(),
      retryScheduled: result.retryScheduled,
    });
  },
});
