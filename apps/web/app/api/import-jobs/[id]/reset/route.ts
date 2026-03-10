/**
 * Resets a failed import job to a specific stage for recovery or debugging.
 *
 * This is a powerful admin-only operation that bypasses normal stage transition
 * rules. Uses ErrorRecoveryService.resetJobToStage for the actual reset logic.
 *
 * POST /api/import-jobs/:id/reset
 *
 * @module
 * @category API Routes
 */
import { z } from "zod";

import { apiRoute } from "@/lib/api";
import { PROCESSING_STAGE, type ProcessingStage } from "@/lib/constants/import-constants";
import { logger } from "@/lib/logger";
import { ErrorRecoveryService } from "@/lib/services/error-recovery";
import { getClientIdentifier, getRateLimitService, RATE_LIMITS } from "@/lib/services/rate-limit-service";

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

export const POST = apiRoute({
  auth: "admin",
  params: z.object({ id: z.string() }),
  handler: async ({ payload, user, req, params }) => {
    const { id } = params;

    // Rate limiting
    const rateLimitService = getRateLimitService(payload);
    const clientId = getClientIdentifier(req);
    const rateLimitResult = rateLimitService.checkConfiguredRateLimit(clientId, RATE_LIMITS.ADMIN_IMPORT_RESET);
    if (!rateLimitResult.allowed) {
      return Response.json({ error: "Too many requests" }, { status: 429 });
    }

    // Parse request body
    const body = (await req.json()) as { targetStage: ProcessingStage; clearRetries?: boolean };
    const { targetStage, clearRetries = true } = body;

    // Validate target stage
    if (!VALID_RESET_STAGES.includes(targetStage as (typeof VALID_RESET_STAGES)[number])) {
      return Response.json(
        { error: `Invalid target stage '${targetStage}'. Must be one of: ${VALID_RESET_STAGES.join(", ")}` },
        { status: 400 }
      );
    }

    // Get the import job (admins have access to all jobs)
    const importJob = await payload
      .findByID({
        collection: "import-jobs",
        id,
        user,
        overrideAccess: false,
      })
      .catch(() => null);

    if (!importJob) {
      return Response.json({ error: "Import job not found" }, { status: 404 });
    }

    // Reset via ErrorRecoveryService
    const result = await ErrorRecoveryService.resetJobToStage(payload, importJob.id, targetStage, clearRetries);

    if (!result.success) {
      logger.warn("Admin stage reset failed", {
        importJobId: importJob.id,
        adminId: user.id,
        fromStage: importJob.stage,
        targetStage,
        reason: result.error,
      });

      return Response.json({ error: result.error ?? "Failed to reset import job" }, { status: 400 });
    }

    logger.info("Admin manually reset import job stage", {
      importJobId: importJob.id,
      adminId: user.id,
      adminEmail: user.email,
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
  },
});
