/**
 * API route for manually resetting import job stage (admin only).
 *
 * This endpoint allows administrators to manually reset a failed import job
 * to a specific stage for recovery or debugging purposes. This is a powerful
 * operation that bypasses normal stage transition rules.
 *
 * Access control:
 * - Only administrators can reset import job stages
 * - Regular users will receive 403 Forbidden
 *
 * @module
 * @category API
 */
import { NextResponse } from "next/server";
import { getPayload } from "payload";

import { PROCESSING_STAGE, type ProcessingStage } from "@/lib/constants/import-constants";
import { logError, logger } from "@/lib/logger";
import { type AuthenticatedRequest, withAuth } from "@/lib/middleware/auth";
import { withRateLimit } from "@/lib/middleware/rate-limit";
import { ErrorRecoveryService } from "@/lib/services/error-recovery";
import { badRequest, forbidden, internalError, notFound } from "@/lib/utils/api-response";
import config from "@/payload.config";

/**
 * Request body for stage reset.
 */
interface ResetRequestBody {
  targetStage: ProcessingStage;
  clearRetries?: boolean;
}

/**
 * Valid stages for manual reset.
 */
const VALID_RESET_STAGES = [
  PROCESSING_STAGE.ANALYZE_DUPLICATES,
  PROCESSING_STAGE.DETECT_SCHEMA,
  PROCESSING_STAGE.VALIDATE_SCHEMA,
  PROCESSING_STAGE.GEOCODE_BATCH,
  PROCESSING_STAGE.CREATE_EVENTS,
] as const;

export const POST = withRateLimit(
  withAuth(
    async (request: AuthenticatedRequest, context: { params: Promise<{ id: string }> }): Promise<NextResponse> => {
      try {
        const payload = await getPayload({ config });
        const { id } = await context.params;

        // Only admins can reset stages
        if (!request.user || request.user.role !== "admin") {
          return forbidden("Only administrators can reset import job stages");
        }

        // Parse request body
        const body = (await request.json()) as ResetRequestBody;
        const { targetStage, clearRetries = true } = body;

        // Validate target stage
        if (!VALID_RESET_STAGES.includes(targetStage as (typeof VALID_RESET_STAGES)[number])) {
          return badRequest(`Invalid target stage '${targetStage}'. Must be one of: ${VALID_RESET_STAGES.join(", ")}`);
        }

        // Get the import job (admins have access to all jobs)
        const importJob = await payload
          .findByID({
            collection: "import-jobs",
            id,
            user: request.user,
            overrideAccess: false,
          })
          .catch(() => null);

        if (!importJob) {
          return notFound("Import job not found");
        }

        // Reset via ErrorRecoveryService
        const result = await ErrorRecoveryService.resetJobToStage(payload, importJob.id, targetStage, clearRetries);

        if (!result.success) {
          logger.warn("Admin stage reset failed", {
            importJobId: importJob.id,
            adminId: request.user.id,
            fromStage: importJob.stage,
            targetStage,
            reason: result.error,
          });

          return badRequest(result.error ?? "Failed to reset import job");
        }

        logger.info("Admin manually reset import job stage", {
          importJobId: importJob.id,
          adminId: request.user.id,
          adminEmail: request.user.email,
          fromStage: importJob.stage,
          targetStage,
          clearedRetries: clearRetries,
        });

        return NextResponse.json({
          success: true,
          message: `Import job reset to ${targetStage}`,
          fromStage: importJob.stage,
          toStage: targetStage,
          retriesCleared: clearRetries,
        });
      } catch (error) {
        const { id } = await context.params;
        logError(error, "Failed to reset import job", { importJobId: id, userId: request.user?.id });

        return internalError("Failed to reset import job");
      }
    }
  ),
  { configName: "ADMIN_IMPORT_RESET" }
);
