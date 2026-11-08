/**
 * Derives an ingest run's outcome from its IngestJobs and runs the source
 * bookkeeping exactly once. Called after every child transition and
 * periodically; serialized by a row lock on the run. See ADR 0043.
 *
 * @module
 * @category Jobs
 */
import { eq } from "@payloadcms/db-postgres/drizzle";
import type { Payload, PayloadRequest } from "payload";
import { commitTransaction, createLocalReq, initTransaction, killTransaction } from "payload";

import { COLLECTION_NAMES, type IngestRunOutcome, PROCESSING_STAGE } from "@/lib/constants/ingest-constants";
import { getTransactionAwareDrizzle } from "@/lib/database/drizzle-transaction";
import { updateIngestFileStatusById } from "@/lib/ingest/ingest-file-status";
import { logError, logger } from "@/lib/logger";
import { extractRelationId } from "@/lib/utils/relation-id";
import { ingest_runs, scheduled_ingests } from "@/payload-generated-schema";
import type { IngestJob } from "@/payload-types";

import {
  amendScheduledIngestRun,
  loadScheduledIngestForLifecycle,
  type ScheduledRunStatus,
  updateScheduledIngestFailure,
  updateScheduledIngestPaused,
  updateScheduledIngestSuccess,
} from "../handlers/url-fetch-job/scheduled-ingest-utils";

type RunRow = typeof ingest_runs.$inferSelect;
type SettledOutcome = Exclude<IngestRunOutcome, "pending">;

const TERMINAL_STAGES: ReadonlySet<string> = new Set([
  PROCESSING_STAGE.COMPLETED,
  PROCESSING_STAGE.FAILED,
  PROCESSING_STAGE.NEEDS_REVIEW,
]);

export const getReviewReason = (reviewJob: { reviewReason?: unknown }): string =>
  typeof reviewJob.reviewReason === "string" && reviewJob.reviewReason.length > 0
    ? reviewJob.reviewReason
    : "manual review required";

const getFailedJobError = (failedJob: Pick<IngestJob, "errorLog" | "errors">): string | null => {
  const errorLog = failedJob.errorLog;
  const lastError = errorLog && typeof errorLog === "object" && "lastError" in errorLog ? errorLog.lastError : null;
  if (typeof lastError === "string" && lastError.length > 0) return lastError;
  const firstError = Array.isArray(failedJob.errors) ? failedJob.errors[0] : undefined;
  return typeof firstError?.error === "string" ? firstError.error : null;
};

/**
 * Outcome of a run, or null while a sheet is still in flight. A sheet deleted after
 * dispatch (a discarded review) counts as failed, so a run can always settle.
 */
export const deriveRunOutcome = (
  expectedSheets: number,
  jobs: Array<Pick<IngestJob, "stage">>
): SettledOutcome | null => {
  if (jobs.some((job) => !TERMINAL_STAGES.has(job.stage))) return null;
  if (jobs.length < expectedSheets || jobs.some((job) => job.stage === PROCESSING_STAGE.FAILED)) return "failed";
  if (jobs.some((job) => job.stage === PROCESSING_STAGE.NEEDS_REVIEW)) return "awaiting_review";
  return "completed";
};

const HISTORY_STATUS: Record<SettledOutcome, ScheduledRunStatus> = {
  completed: "success",
  awaiting_review: "paused",
  failed: "failed",
};

const FILE_STATUS: Record<SettledOutcome, "completed" | "processing" | "failed"> = {
  completed: "completed",
  awaiting_review: "processing",
  failed: "failed",
};

/** Human-readable reason of a non-successful outcome. */
const describeOutcome = (outcome: SettledOutcome, run: RunRow, jobs: IngestJob[]): string | null => {
  if (outcome === "completed") return null;
  if (outcome === "awaiting_review") {
    const reviewJob = jobs.find((job) => job.stage === PROCESSING_STAGE.NEEDS_REVIEW);
    return `Scheduled ingest paused for review: ${getReviewReason(reviewJob ?? {})}`;
  }
  const failedJob = jobs.find((job) => job.stage === PROCESSING_STAGE.FAILED);
  if (failedJob) return getFailedJobError(failedJob) ?? "Scheduled ingest failed during downstream processing.";
  return `${run.expectedSheets - jobs.length} of ${run.expectedSheets} sheets were removed before they finished`;
};

const updateIngestFile = async (
  payload: Payload,
  req: PayloadRequest,
  run: RunRow,
  outcome: SettledOutcome,
  jobs: IngestJob[]
): Promise<void> => {
  if (!run.ingestFile) return;
  await payload.update({
    collection: COLLECTION_NAMES.INGEST_FILES,
    id: run.ingestFile,
    data: {
      status: FILE_STATUS[outcome],
      datasetsProcessed: jobs.length,
      ...(outcome === "awaiting_review" ? {} : { completedAt: new Date().toISOString() }),
    },
    context: { skipIngestFileHooks: true },
    req,
  });
};

/**
 * The first completed or failed outcome counts, also after a review pause, whose history
 * entry it then replaces. A pause counts nothing; any other change only amends the entry.
 */
const accountScheduled = async (
  payload: Payload,
  req: PayloadRequest,
  run: RunRow,
  outcome: SettledOutcome,
  jobs: IngestJob[]
): Promise<void> => {
  const scheduledIngest = await loadScheduledIngestForLifecycle(payload, run.scheduledIngest ?? undefined, req);
  if (!scheduledIngest) return;
  const fileId = run.ingestFile ?? undefined;
  const reason = describeOutcome(outcome, run, jobs);
  const amend = Boolean(run.accountedAt);
  const duration = Math.max(0, Date.now() - new Date(run.createdAt).getTime());

  if (outcome !== "awaiting_review" && !run.countedAt) {
    if (outcome === "completed") {
      await updateScheduledIngestSuccess(payload, scheduledIngest, fileId, duration, { req, amend });
    } else {
      const error = new Error(reason ?? "Scheduled ingest failed");
      await updateScheduledIngestFailure(payload, scheduledIngest, error, { req, ingestFileId: fileId, amend });
    }
  } else if (!amend) {
    await updateScheduledIngestPaused(payload, scheduledIngest, fileId, duration, reason ?? "", req);
  } else if (fileId !== undefined) {
    await amendScheduledIngestRun(payload, scheduledIngest, fileId, HISTORY_STATUS[outcome], reason, req);
  }
};

const accountSource = async (
  payload: Payload,
  req: PayloadRequest,
  run: RunRow,
  outcome: SettledOutcome,
  jobs: IngestJob[]
): Promise<void> => {
  if (run.source === "scheduled") {
    await accountScheduled(payload, req, run, outcome, jobs);
  } else if (run.source === "scraper" && run.scraperRun) {
    await payload.update({ collection: "scraper-runs", id: run.scraperRun, data: { importOutcome: outcome }, req });
  }
};

/**
 * Settle a run: file status, outcome and the source bookkeeping, which counts only
 * on first settlement and afterwards only amends. Returns the stored outcome.
 */
export const reconcileRun = async (payload: Payload, runId: number): Promise<IngestRunOutcome | null> => {
  const req = await createLocalReq({}, payload);
  if (!(await initTransaction(req))) throw new Error("Ingest run reconciliation requires a database transaction");
  try {
    const db = await getTransactionAwareDrizzle(payload, req);
    const [run] = (await db.select().from(ingest_runs).where(eq(ingest_runs.id, runId)).for("update")) as RunRow[];
    if (!run?.dispatchedAt) {
      await commitTransaction(req);
      return run?.outcome ?? null;
    }

    const { docs: jobs } = await payload.find({
      collection: COLLECTION_NAMES.INGEST_JOBS,
      where: { run: { equals: runId } },
      pagination: false,
      depth: 0,
      req,
    });
    const outcome = deriveRunOutcome(run.expectedSheets, jobs);
    if (!outcome || (outcome === run.outcome && run.accountedAt)) {
      await commitTransaction(req);
      return run.outcome;
    }

    const now = new Date().toISOString();
    if (run.scheduledIngest) {
      // Serializes runs of one schedule. Taken before the file upsert, whose foreign-key
      // lock on this row would otherwise deadlock two runs settling at the same time.
      await db
        .select({ id: scheduled_ingests.id })
        .from(scheduled_ingests)
        .where(eq(scheduled_ingests.id, run.scheduledIngest))
        .for("update");
    }
    await updateIngestFile(payload, req, run, outcome, jobs);
    await accountSource(payload, req, run, outcome, jobs);
    await db
      .update(ingest_runs)
      .set({
        outcome,
        accountedAt: run.accountedAt ?? now,
        countedAt: run.countedAt ?? (outcome === "awaiting_review" ? null : now),
      })
      .where(eq(ingest_runs.id, runId));
    await commitTransaction(req);
    logger.info({ runId, outcome, previous: run.outcome, source: run.source }, "Ingest run reconciled");
    return outcome;
  } catch (error) {
    await killTransaction(req);
    throw error;
  }
};

/**
 * Settle whatever an IngestJob's transition affects: its run, or for a job dispatched
 * before runs existed, its file status alone. Never throws; the periodic pass retries.
 */
export const reconcileAfterJobTransition = async (payload: Payload, ingestJobId: number | string): Promise<void> => {
  try {
    const job = await payload.findByID({ collection: COLLECTION_NAMES.INGEST_JOBS, id: ingestJobId, depth: 0 });
    const runId = extractRelationId<number>(job.run);
    if (runId) {
      await reconcileRun(payload, runId);
      return;
    }
    const ingestFileId = extractRelationId(job.ingestFile);
    if (ingestFileId) await updateIngestFileStatusById(payload, ingestFileId);
  } catch (error) {
    logError(error, "Failed to reconcile after ingest job transition", { ingestJobId });
  }
};
