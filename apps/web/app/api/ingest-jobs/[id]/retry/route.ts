/**
 * Retries a failed import job by queuing the ingest-process workflow.
 *
 * Payload owns automatic task retries. This endpoint manually restarts a
 * failed ingest from analyze-duplicates, including its review and quota gates.
 *
 * POST /api/ingest-jobs/:id/retry
 *
 * @module
 * @category API Routes
 */
import { and, eq } from "@payloadcms/db-postgres/drizzle";
import { commitTransaction, createLocalReq, initTransaction, killTransaction } from "payload";
import { z } from "zod";

import { apiRoute, safeFindByID, ValidationError } from "@/lib/api";
import { PROCESSING_STAGE } from "@/lib/constants/ingest-constants";
import { getTransactionAwareDrizzle } from "@/lib/database/drizzle-transaction";
import { prepareIngestFileRecovery } from "@/lib/ingest/ingest-file-status";
import { logger } from "@/lib/logger";
import { requireRelationId } from "@/lib/utils/relation-id";
import { ingest_jobs } from "@/payload-generated-schema";

export const POST = apiRoute({
  auth: "required",
  site: "default",
  rateLimit: { configName: "IMPORT_RETRY" },
  params: z.object({ id: z.string() }),
  handler: async ({ payload, user, params }) => {
    const { id } = params;

    // Get the import job with access control
    const ingestJob = await safeFindByID(payload, { collection: "ingest-jobs", id, depth: 1, user });

    // Verify job is in failed state
    if (ingestJob.stage !== PROCESSING_STAGE.FAILED) {
      throw new ValidationError(`Ingest job is not in failed state. Current stage: ${ingestJob.stage}`);
    }

    const req = await createLocalReq({ user }, payload);
    if (!(await initTransaction(req))) throw new Error("Ingest recovery requires a database transaction");
    try {
      await prepareIngestFileRecovery(req, requireRelationId(ingestJob.ingestFile));
      // Payload's bulk update is find-then-update, not compare-and-swap. Keep the
      // conditional SQL claim, but publish it and the workflow in one transaction.
      const db = await getTransactionAwareDrizzle(payload, req);
      const claimed = await db
        .update(ingest_jobs)
        .set({ stage: PROCESSING_STAGE.ANALYZE_DUPLICATES, updatedAt: new Date().toISOString() })
        .where(and(eq(ingest_jobs.id, ingestJob.id), eq(ingest_jobs.stage, PROCESSING_STAGE.FAILED)))
        .returning({ id: ingest_jobs.id });
      if (claimed.length === 0) {
        throw new ValidationError("Ingest job is not in failed state (already being retried).");
      }
      await payload.jobs.queue({
        workflow: "ingest-process",
        input: { ingestJobId: String(ingestJob.id), resumeFrom: "analyze-duplicates" },
        req,
      });
      await commitTransaction(req);
    } catch (error) {
      await killTransaction(req);
      throw error;
    }

    logger.info({ ingestJobId: ingestJob.id, userId: user.id }, "Manual retry initiated via workflow");

    return { message: "Import retry queued successfully", retryScheduled: true };
  },
});
