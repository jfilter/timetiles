/**
 * Ingest runs: transactional dispatch of per-sheet `ingest-process` jobs.
 *
 * A run records one source run (upload, scheduled fetch, scraper output). Every
 * dispatch bumps the IngestJob's generation in the same transaction that queues
 * its child, so a child of an older generation can recognise itself as stale.
 * See ADR 0043.
 *
 * @module
 * @category Ingest
 */
import { and, eq, sql } from "@payloadcms/db-postgres/drizzle";
import type { Payload, PayloadRequest } from "payload";
import { commitTransaction, createLocalReq, initTransaction, killTransaction } from "payload";

import { COLLECTION_NAMES, type IngestRunSource, PROCESSING_STAGE } from "@/lib/constants/ingest-constants";
import type { ResumePoint } from "@/lib/constants/review-reasons";
import { getTransactionAwareDrizzle } from "@/lib/database/drizzle-transaction";
import { logger } from "@/lib/logger";
import { ingest_jobs, ingest_runs } from "@/payload-generated-schema";

/**
 * Bump the IngestJob's generation and queue its `ingest-process` child with the
 * caller's transaction-bound `req`, so both commit or neither does.
 */
export const queueIngestProcess = async (
  req: PayloadRequest,
  ingestJobId: number | string,
  resumeFrom: ResumePoint
): Promise<number> => {
  const db = await getTransactionAwareDrizzle(req.payload, req);
  const [bumped] = (await db
    .update(ingest_jobs)
    // Recovery counts its own requeue afterwards; any other resumption starts a fresh budget.
    .set({ generation: sql`coalesce(${ingest_jobs.generation}, 0) + 1`, recoveryAttempts: 0 })
    .where(eq(ingest_jobs.id, Number(ingestJobId)))
    .returning({ generation: ingest_jobs.generation, run: ingest_jobs.run })) as Array<{
    generation: number;
    run: number | null;
  }>;
  if (!bumped) throw new Error(`Ingest job ${String(ingestJobId)} not found`);
  const generation = Number(bumped.generation);
  if (bumped.run != null) {
    // A resumed sheet reopens a failed run, so the periodic pass settles it again.
    await db
      .update(ingest_runs)
      .set({ outcome: "pending" })
      .where(and(eq(ingest_runs.id, bumped.run), eq(ingest_runs.outcome, "failed")));
  }
  await req.payload.jobs.queue({
    workflow: "ingest-process",
    input: { ingestJobId: String(ingestJobId), resumeFrom, generation },
    req,
  });
  return generation;
};

export interface DispatchIngestRunArgs {
  ingestFileId: number;
  ingestJobIds: number[];
  source: IngestRunSource;
  scheduledIngestId?: number | null;
  scraperRunId?: number | null;
}

/**
 * Create the run of an ingest file and queue one child per sheet, once.
 *
 * The run row is locked for the whole dispatch: a concurrent or redelivered
 * dispatcher waits and then finds `dispatchedAt` set.
 */
export const dispatchIngestRun = async (
  payload: Payload,
  { ingestFileId, ingestJobIds, source, scheduledIngestId, scraperRunId }: DispatchIngestRunArgs
): Promise<{ runId: number; dispatched: boolean }> => {
  const req = await createLocalReq({}, payload);
  if (!(await initTransaction(req))) throw new Error("Ingest dispatch requires a database transaction");
  try {
    const db = await getTransactionAwareDrizzle(payload, req);
    await db
      .insert(ingest_runs)
      .values({
        source,
        ingestFile: ingestFileId,
        scheduledIngest: scheduledIngestId ?? null,
        scraperRun: scraperRunId ?? null,
        expectedSheets: ingestJobIds.length,
      })
      .onConflictDoNothing({ target: ingest_runs.ingestFile });
    const [run] = (await db
      .select({ id: ingest_runs.id, dispatchedAt: ingest_runs.dispatchedAt })
      .from(ingest_runs)
      .where(eq(ingest_runs.ingestFile, ingestFileId))
      .for("update")) as Array<{ id: number; dispatchedAt: string | null }>;
    if (!run) throw new Error(`Ingest run for file ${ingestFileId} could not be created`);

    if (run.dispatchedAt) {
      await commitTransaction(req);
      logger.info({ ingestFileId, runId: run.id }, "Ingest run already dispatched; skipping");
      return { runId: run.id, dispatched: false };
    }

    for (const ingestJobId of ingestJobIds) {
      await db.update(ingest_jobs).set({ run: run.id }).where(eq(ingest_jobs.id, ingestJobId));
      await queueIngestProcess(req, ingestJobId, "analyze-duplicates");
    }
    await db
      .update(ingest_runs)
      .set({ dispatchedAt: new Date().toISOString(), expectedSheets: ingestJobIds.length })
      .where(eq(ingest_runs.id, run.id));
    await commitTransaction(req);
    logger.info({ ingestFileId, runId: run.id, sheets: ingestJobIds.length }, "Ingest run dispatched");
    return { runId: run.id, dispatched: true };
  } catch (error) {
    await killTransaction(req);
    throw error;
  }
};

/** Whether a dispatched run of the schedule has not run its bookkeeping yet. */
export const hasUnsettledScheduledRun = async (payload: Payload, scheduledIngestId: number): Promise<boolean> => {
  const { totalDocs } = await payload.count({
    collection: COLLECTION_NAMES.INGEST_RUNS,
    where: {
      scheduledIngest: { equals: scheduledIngestId },
      dispatchedAt: { exists: true },
      accountedAt: { exists: false },
    },
  });
  return totalDocs > 0;
};

/**
 * True while a run of the schedule awaits review, including a failed run with a sheet
 * still in review, so the next fetch cannot pile up further review jobs.
 */
export const hasScheduledRunAwaitingReview = async (payload: Payload, scheduledIngestId: number): Promise<boolean> => {
  const runs = await payload.count({
    collection: COLLECTION_NAMES.INGEST_RUNS,
    where: { scheduledIngest: { equals: scheduledIngestId }, outcome: { equals: "awaiting_review" } },
  });
  if (runs.totalDocs > 0) return true;
  const reviews = await payload.count({
    collection: COLLECTION_NAMES.INGEST_JOBS,
    where: { "run.scheduledIngest": { equals: scheduledIngestId }, stage: { equals: PROCESSING_STAGE.NEEDS_REVIEW } },
  });
  return reviews.totalDocs > 0;
};
