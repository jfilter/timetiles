/**
 * Resets a failed import job to a specific stage for recovery or debugging.
 *
 * This is a powerful admin-only operation that bypasses normal stage transition
 * rules. Uses ErrorRecoveryService.resetJobToStage for the actual reset logic.
 *
 * POST /api/ingest-jobs/:id/reset
 *
 * @module
 * @category API Routes
 */
import { z } from "zod";

import { apiRoute, safeFindByID, ValidationError } from "@/lib/api";
import { RECOVERY_STAGES_LIST } from "@/lib/constants/stage-graph";
import { ErrorRecoveryService } from "@/lib/ingest/error-recovery";
import { logger } from "@/lib/logger";
import type { IngestJob } from "@/payload-types";

/**
 * Valid stages for manual reset — derived from the canonical stage graph.
 */
const VALID_RESET_STAGES = RECOVERY_STAGES_LIST;

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

    // Reset via ErrorRecoveryService
    const result = await ErrorRecoveryService.resetJobToStage(payload, ingestJob.id, targetStage, clearRetries);

    if (!result.success) {
      logger.warn(
        { ingestJobId: ingestJob.id, adminId: user.id, fromStage: ingestJob.stage, targetStage, reason: result.error },
        "Admin stage reset failed"
      );

      throw new ValidationError(result.error ?? "Failed to reset import job");
    }

    logger.info(
      {
        ingestJobId: ingestJob.id,
        adminId: user.id,
        adminEmail: user.email,
        fromStage: ingestJob.stage,
        targetStage,
        clearedRetries: clearRetries,
      },
      "Admin manually reset import job stage"
    );

    return {
      message: `Ingest job reset to ${targetStage}`,
      fromStage: ingestJob.stage,
      toStage: targetStage,
      retriesCleared: clearRetries,
    };
  },
});
