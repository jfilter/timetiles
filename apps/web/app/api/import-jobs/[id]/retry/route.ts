/**
 * API route for retrying failed import jobs.
 *
 * This endpoint allows file owners and admins to manually trigger a retry
 * of a failed import job. It uses the ErrorRecoveryService to classify the
 * error, determine the appropriate recovery stage, and schedule the retry
 * with exponential backoff.
 *
 * Access control:
 * - File owners can retry their own failed imports
 * - Admins can retry any failed import
 * - Quota is checked before allowing retry
 *
 * @module
 * @category API
 */
import { NextResponse } from "next/server";
import { getPayload } from "payload";

import { PROCESSING_STAGE } from "@/lib/constants/import-constants";
import { QUOTA_TYPES } from "@/lib/constants/quota-constants";
import { logError, logger } from "@/lib/logger";
import { type AuthenticatedRequest, withAuth } from "@/lib/middleware/auth";
import { withRateLimit } from "@/lib/middleware/rate-limit";
import { ErrorRecoveryService } from "@/lib/services/error-recovery";
import { getQuotaService } from "@/lib/services/quota-service";
import { badRequest, forbidden, internalError, notFound } from "@/lib/utils/api-response";
import config from "@/payload.config";

export const POST = withRateLimit(
  withAuth(
    async (request: AuthenticatedRequest, context: { params: Promise<{ id: string }> }): Promise<NextResponse> => {
      try {
        const payload = await getPayload({ config });
        const { id } = await context.params;

        // Get the import job with access control
        const importJob = await payload
          .findByID({
            collection: "import-jobs",
            id,
            depth: 1, // Include importFile for ownership check
            user: request.user,
            overrideAccess: false,
          })
          .catch(() => null);

        if (!importJob) {
          return notFound("Import job not found or access denied");
        }

        // Verify job is in failed state
        if (importJob.stage !== PROCESSING_STAGE.FAILED) {
          return badRequest(`Import job is not in failed state. Current stage: ${importJob.stage}`);
        }

        // Get import file for quota check
        const importFileId = typeof importJob.importFile === "object" ? importJob.importFile.id : importJob.importFile;
        const importFile = await payload.findByID({
          collection: "import-files",
          id: importFileId,
          overrideAccess: true, // We already verified access via import-job
        });

        // Check quota before allowing retry
        if (importFile.user) {
          const userId = typeof importFile.user === "object" ? importFile.user.id : importFile.user;

          // Get full user object for quota checking
          const user = await payload.findByID({
            collection: "users",
            id: userId,
            overrideAccess: true,
          });

          const quotaService = getQuotaService(payload);
          const quotaCheck = await quotaService.checkQuota(user, QUOTA_TYPES.IMPORT_JOBS_PER_DAY, 1);

          if (!quotaCheck.allowed) {
            return forbidden("Quota exceeded. Cannot retry import at this time. Please try again tomorrow.");
          }
        }

        // Attempt recovery via ErrorRecoveryService
        const result = await ErrorRecoveryService.recoverFailedJob(payload, importJob.id);

        if (!result.success) {
          logger.warn("Manual retry attempt failed", {
            importJobId: importJob.id,
            userId: request.user?.id,
            reason: result.error,
          });

          return badRequest(result.error ?? "Failed to retry import job");
        }

        logger.info("Manual retry initiated", {
          importJobId: importJob.id,
          userId: request.user?.id,
          nextRetryAt: result.nextRetryAt,
        });

        return NextResponse.json({
          success: true,
          message: "Import retry scheduled successfully",
          nextRetryAt: result.nextRetryAt?.toISOString(),
          retryScheduled: result.retryScheduled,
        });
      } catch (error) {
        const { id } = await context.params;
        logError(error, "Failed to retry import job", { importJobId: id, userId: request.user?.id });

        return internalError("Failed to retry import job");
      }
    }
  ),
  { configName: "IMPORT_RETRY" }
);
