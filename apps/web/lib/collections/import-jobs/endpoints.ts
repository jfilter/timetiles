/**
 * Custom Payload endpoints for the Import Jobs collection.
 *
 * Defines retry and reset endpoints as Payload custom endpoints,
 * which provide automatic user context and payload instance.
 *
 * @module
 * @category Collections
 */
import type { Endpoint } from "payload";

import { PROCESSING_STAGE, type ProcessingStage } from "@/lib/constants/import-constants";
import { QUOTA_TYPES } from "@/lib/constants/quota-constants";
import { logError, logger } from "@/lib/logger";
import { ErrorRecoveryService } from "@/lib/services/error-recovery";
import { getQuotaService } from "@/lib/services/quota-service";
import { getClientIdentifier, getRateLimitService, RATE_LIMITS } from "@/lib/services/rate-limit-service";
import { extractRelationId } from "@/lib/utils/relation-id";

/**
 * POST /api/import-jobs/:id/retry
 *
 * Retries a failed import job. Uses ErrorRecoveryService to classify the
 * error, determine the appropriate recovery stage, and schedule the retry.
 *
 * Access: authenticated users (file owners or admins).
 * Rate limited using the IMPORT_RETRY config.
 */
const retryEndpoint: Omit<Endpoint, "root"> = {
  path: "/:id/retry",
  method: "post",
  handler: async (req) => {
    if (!req.user) {
      return Response.json({ error: "Authentication required" }, { status: 401 });
    }

    const id = req.routeParams?.id as string | undefined;
    if (!id) {
      return Response.json({ error: "Invalid ID" }, { status: 400 });
    }

    // Rate limiting
    const rateLimitService = getRateLimitService(req.payload);
    const clientId = getClientIdentifier(req as unknown as Request);
    const rateLimitResult = rateLimitService.checkConfiguredRateLimit(clientId, RATE_LIMITS.IMPORT_RETRY);
    if (!rateLimitResult.allowed) {
      return Response.json({ error: "Too many requests" }, { status: 429 });
    }

    try {
      // Get the import job with access control
      const importJob = await req.payload
        .findByID({
          collection: "import-jobs",
          id,
          depth: 1,
          user: req.user,
          overrideAccess: false,
        })
        .catch(() => null);

      if (!importJob) {
        return Response.json({ error: "Import job not found or access denied" }, { status: 404 });
      }

      // Verify job is in failed state
      if (importJob.stage !== PROCESSING_STAGE.FAILED) {
        return Response.json(
          { error: `Import job is not in failed state. Current stage: ${importJob.stage}` },
          { status: 400 }
        );
      }

      // Atomically claim the retry by transitioning stage away from FAILED
      const claimResult = await req.payload.update({
        collection: "import-jobs",
        where: { id: { equals: importJob.id }, stage: { equals: PROCESSING_STAGE.FAILED } },
        data: { stage: PROCESSING_STAGE.FAILED },
        overrideAccess: true,
      });

      if (claimResult.docs.length === 0) {
        return Response.json({ error: "Retry already in progress for this import job" }, { status: 400 });
      }

      // Get import file for quota check
      const importFileId = extractRelationId(importJob.importFile)!;
      const importFile = await req.payload.findByID({
        collection: "import-files",
        id: importFileId,
        overrideAccess: true,
      });

      // Check quota before allowing retry
      if (importFile.user) {
        const userId = extractRelationId(importFile.user)!;
        const user = await req.payload.findByID({
          collection: "users",
          id: userId,
          overrideAccess: true,
        });

        const quotaService = getQuotaService(req.payload);
        const quotaCheck = await quotaService.checkQuota(user, QUOTA_TYPES.IMPORT_JOBS_PER_DAY, 1);

        if (!quotaCheck.allowed) {
          return Response.json(
            { error: "Quota exceeded. Cannot retry import at this time. Please try again tomorrow." },
            { status: 403 }
          );
        }
      }

      // Attempt recovery via ErrorRecoveryService
      const result = await ErrorRecoveryService.recoverFailedJob(req.payload, importJob.id);

      if (!result.success) {
        logger.warn("Manual retry attempt failed", {
          importJobId: importJob.id,
          userId: req.user.id,
          reason: result.error,
        });

        return Response.json({ error: result.error ?? "Failed to retry import job" }, { status: 400 });
      }

      logger.info("Manual retry initiated", {
        importJobId: importJob.id,
        userId: req.user.id,
        nextRetryAt: result.nextRetryAt,
      });

      return Response.json({
        success: true,
        message: "Import retry scheduled successfully",
        nextRetryAt: result.nextRetryAt?.toISOString(),
        retryScheduled: result.retryScheduled,
      });
    } catch (error) {
      logError(error, `Error retrying import job ${id}`);
      return Response.json({ error: "Internal server error" }, { status: 500 });
    }
  },
};

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

/**
 * POST /api/import-jobs/:id/reset
 *
 * Resets a failed import job to a specific stage for recovery or debugging.
 * This is a powerful operation that bypasses normal stage transition rules.
 *
 * Access: admin only.
 */
const resetEndpoint: Omit<Endpoint, "root"> = {
  path: "/:id/reset",
  method: "post",
  handler: async (req) => {
    if (!req.user) {
      return Response.json({ error: "Authentication required" }, { status: 401 });
    }

    if (req.user.role !== "admin") {
      return Response.json({ error: "Only administrators can reset import job stages" }, { status: 403 });
    }

    const id = req.routeParams?.id as string | undefined;
    if (!id) {
      return Response.json({ error: "Invalid ID" }, { status: 400 });
    }

    // Rate limiting
    const rateLimitService = getRateLimitService(req.payload);
    const clientId = getClientIdentifier(req as unknown as Request);
    const rateLimitResult = rateLimitService.checkConfiguredRateLimit(clientId, RATE_LIMITS.ADMIN_IMPORT_RESET);
    if (!rateLimitResult.allowed) {
      return Response.json({ error: "Too many requests" }, { status: 429 });
    }

    try {
      // Parse request body
      const body = (await (req as unknown as Request).json()) as ResetRequestBody;
      const { targetStage, clearRetries = true } = body;

      // Validate target stage
      if (!VALID_RESET_STAGES.includes(targetStage as (typeof VALID_RESET_STAGES)[number])) {
        return Response.json(
          { error: `Invalid target stage '${targetStage}'. Must be one of: ${VALID_RESET_STAGES.join(", ")}` },
          { status: 400 }
        );
      }

      // Get the import job (admins have access to all jobs)
      const importJob = await req.payload
        .findByID({
          collection: "import-jobs",
          id,
          user: req.user,
          overrideAccess: false,
        })
        .catch(() => null);

      if (!importJob) {
        return Response.json({ error: "Import job not found" }, { status: 404 });
      }

      // Reset via ErrorRecoveryService
      const result = await ErrorRecoveryService.resetJobToStage(req.payload, importJob.id, targetStage, clearRetries);

      if (!result.success) {
        logger.warn("Admin stage reset failed", {
          importJobId: importJob.id,
          adminId: req.user.id,
          fromStage: importJob.stage,
          targetStage,
          reason: result.error,
        });

        return Response.json({ error: result.error ?? "Failed to reset import job" }, { status: 400 });
      }

      logger.info("Admin manually reset import job stage", {
        importJobId: importJob.id,
        adminId: req.user.id,
        adminEmail: req.user.email,
        fromStage: importJob.stage,
        targetStage,
        clearedRetries: clearRetries,
      });

      return Response.json({
        success: true,
        message: `Import job reset to ${targetStage}`,
        fromStage: importJob.stage,
        toStage: targetStage,
        retriesCleared: clearRetries,
      });
    } catch (error) {
      logError(error, `Error resetting import job ${id}`);
      return Response.json({ error: "Internal server error" }, { status: 500 });
    }
  },
};

export const importJobEndpoints: Omit<Endpoint, "root">[] = [retryEndpoint, resetEndpoint];
