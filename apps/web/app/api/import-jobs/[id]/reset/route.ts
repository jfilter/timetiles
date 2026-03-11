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

import { apiRoute, safeFindByID } from "@/lib/api";
import { PROCESSING_STAGE } from "@/lib/constants/import-constants";
import { logger } from "@/lib/logger";
import { ErrorRecoveryService } from "@/lib/services/error-recovery";
import type { ImportJob } from "@/payload-types";

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
  rateLimit: { configName: "ADMIN_IMPORT_RESET" },
  params: z.object({ id: z.string() }),
  body: z.object({ targetStage: z.enum(VALID_RESET_STAGES), clearRetries: z.boolean().optional() }),
  handler: async ({ payload, user, params, body }) => {
    const { id } = params;
    const { targetStage, clearRetries = true } = body;

    // Get the import job (admins have access to all jobs)
    const importJob = await safeFindByID<ImportJob>(payload, { collection: "import-jobs", id, user });

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
