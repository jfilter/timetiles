/**
 * Retries a failed import job by queuing the ingest-process workflow.
 *
 * Payload workflows handle retries natively via task `retries` config
 * and `onFail` callbacks, so this endpoint simply re-queues the workflow
 * from the beginning (detect-schema by default).
 *
 * POST /api/ingest-jobs/:id/retry
 *
 * @module
 * @category API Routes
 */
import { z } from "zod";

import { apiRoute, safeFindByID, ValidationError } from "@/lib/api";
import { PROCESSING_STAGE } from "@/lib/constants/ingest-constants";
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

    // Queue the ingest-process workflow to re-process from the beginning
    await payload.jobs.queue({
      workflow: "ingest-process",
      input: { ingestJobId: String(ingestJob.id), resumeFrom: "detect-schema" },
    });

    logger.info({ ingestJobId: ingestJob.id, userId: user.id }, "Manual retry initiated via workflow");

    return { message: "Import retry queued successfully", retryScheduled: true };
  },
});
