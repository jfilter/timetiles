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
import { and, eq } from "@payloadcms/db-postgres/drizzle";
import { z } from "zod";

import { apiRoute, safeFindByID, ValidationError } from "@/lib/api";
import { queueJobWithRollback } from "@/lib/api/job-helpers";
import { COLLECTION_NAMES, PROCESSING_STAGE } from "@/lib/constants/ingest-constants";
import { logger } from "@/lib/logger";
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

    // Atomically claim the job: only succeeds if it's still FAILED, so two
    // concurrent retries can't both pass the check above and both queue a workflow.
    // Payload's `update({ where })` is find-then-update-by-id under the hood, not
    // a single atomic statement, so it can't be used as a compare-and-swap — two
    // concurrent calls would both pass the find and both "win". A raw UPDATE ...
    // WHERE ... RETURNING is one atomic statement at the database level.
    const claimed = await payload.db.drizzle
      .update(ingest_jobs)
      .set({ stage: PROCESSING_STAGE.ANALYZE_DUPLICATES, updatedAt: new Date().toISOString() })
      .where(and(eq(ingest_jobs.id, ingestJob.id), eq(ingest_jobs.stage, PROCESSING_STAGE.FAILED)))
      .returning({ id: ingest_jobs.id });

    if (claimed.length === 0) {
      throw new ValidationError("Ingest job is not in failed state (already being retried).");
    }

    // Queue the ingest-process workflow to re-process from the real beginning,
    // including duplicate analysis and its review/quota gates. With rollback: the
    // claim above already left FAILED, and a failed queue would strand the job in
    // ANALYZE_DUPLICATES, where neither retry nor reset accepts it any more.
    await queueJobWithRollback(
      payload,
      { workflow: "ingest-process", input: { ingestJobId: String(ingestJob.id), resumeFrom: "analyze-duplicates" } },
      { collection: COLLECTION_NAMES.INGEST_JOBS, id: ingestJob.id, data: { stage: PROCESSING_STAGE.FAILED } }
    );

    logger.info({ ingestJobId: ingestJob.id, userId: user.id }, "Manual retry initiated via workflow");

    return { message: "Import retry queued successfully", retryScheduled: true };
  },
});
