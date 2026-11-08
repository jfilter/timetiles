/**
 * Recovery of ingest work whose worker died (ADR 0043).
 *
 * `findIngestRecoveries` lists three kinds of findings, judged against the lease:
 * - `abandoned`: a running `ingest-process` job without heartbeat whose sheet is
 *   still at that job's generation. The sheet is requeued or, with its attempts
 *   used up, failed.
 * - `orphaned`: a sheet in a processing stage that no unfinished child serves
 *   and that has not changed within the lease. It is requeued or failed.
 * - `obsolete`: any other running ingest workflow without heartbeat. Only the
 *   Payload job is closed, which frees its concurrency key.
 *
 * `applyIngestRecovery` rechecks every finding under row locks before it acts.
 *
 * @module
 * @category Jobs
 */
import { and, eq, inArray, isNotNull, lt, sql } from "@payloadcms/db-postgres/drizzle";
import type { Payload, PayloadRequest } from "payload";
import { commitTransaction, createLocalReq, initTransaction, killTransaction } from "payload";

import { ValidationError } from "@/lib/api/errors";
import { COLLECTION_NAMES, PROCESSING_STAGE } from "@/lib/constants/ingest-constants";
import { getResumePointForStage, type ResumePoint } from "@/lib/constants/review-reasons";
import { acquireDatasetImportLease, type DatasetImportLease } from "@/lib/database/dataset-import-lock";
import { getTransactionAwareDrizzle } from "@/lib/database/drizzle-transaction";
import { prepareIngestFileRecovery } from "@/lib/ingest/ingest-file-status";
import { getIngestLeaseMs } from "@/lib/ingest/ingest-lease";
import { queueIngestProcess } from "@/lib/ingest/ingest-runs";
import { createJobLogger, logger } from "@/lib/logger";
import { ingest_jobs, payload_jobs } from "@/payload-generated-schema";

import { cleanupPriorAttempt, releaseReservedEventQuota } from "../handlers/create-events-batch/job-completion";
import { reconcileAfterJobTransition } from "./reconcile-run";

const PROCESSING_STAGES: string[] = [
  PROCESSING_STAGE.ANALYZE_DUPLICATES,
  PROCESSING_STAGE.DETECT_SCHEMA,
  PROCESSING_STAGE.VALIDATE_SCHEMA,
  PROCESSING_STAGE.CREATE_SCHEMA_VERSION,
  PROCESSING_STAGE.GEOCODE_BATCH,
  PROCESSING_STAGE.CREATE_EVENTS,
];

/** Recovery does not wait for a dataset another import is writing; it skips and reports. */
const LEASE_WAIT_MS = 5_000;

const ABANDONED_ERROR = "The worker running this import stopped";

export type RecoveryKind = "abandoned" | "orphaned" | "obsolete";
export type RecoveryAction = "requeue" | "fail" | "close";
export type RecoveryOutcome = "requeued" | "failed" | "closed" | "skipped";

export interface RecoveryFinding {
  kind: RecoveryKind;
  action: RecoveryAction;
  payloadJobId: number | null;
  workflow: string | null;
  ingestJobId: number | null;
  stage: string | null;
  generation: number | null;
  lastSeenAt: string;
  resumeFrom?: ResumePoint;
  outcome?: RecoveryOutcome;
  note?: string;
}

type IngestJobRow = Pick<
  typeof ingest_jobs.$inferSelect,
  "id" | "stage" | "generation" | "recoveryAttempts" | "updatedAt"
>;

const sheetColumns = {
  id: ingest_jobs.id,
  stage: ingest_jobs.stage,
  generation: ingest_jobs.generation,
  recoveryAttempts: ingest_jobs.recoveryAttempts,
  updatedAt: ingest_jobs.updatedAt,
};

/** An `ingest-process` child of the sheet's generation that has neither completed nor failed for good. */
const unfinishedChildOf = (ingestJobId: unknown, generation: unknown) => sql`exists (
  select 1 from ${payload_jobs}
  where ${payload_jobs.workflowSlug} = 'ingest-process'
    and ${payload_jobs.completedAt} is null
    and coalesce(${payload_jobs.hasError}, false) = false
    and ${payload_jobs.input} ->> 'ingestJobId' = ${ingestJobId}::text
    and coalesce((${payload_jobs.input} ->> 'generation')::int, 0) = coalesce(${generation}, 0)
)`;

/** A crash consumes one of the attempts the crashed stage's task is granted. */
const recoveryBudget = (payload: Payload, stage: string): number => {
  const retries = payload.config.jobs.tasks?.find((task) => task.slug === stage)?.retries;
  if (typeof retries === "number") return retries;
  return retries?.attempts ?? 0;
};

const sheetFinding = (
  payload: Payload,
  sheet: IngestJobRow,
  base: Pick<RecoveryFinding, "kind" | "payloadJobId" | "workflow" | "lastSeenAt">
): RecoveryFinding => {
  const stage = String(sheet.stage);
  const requeue = Number(sheet.recoveryAttempts ?? 0) < recoveryBudget(payload, stage);
  return {
    ...base,
    action: requeue ? "requeue" : "fail",
    ingestJobId: sheet.id,
    stage,
    generation: Number(sheet.generation ?? 0),
    ...(requeue ? { resumeFrom: getResumePointForStage(stage) } : {}),
  };
};

const readTaskInput = (input: unknown): { ingestJobId: number | null; generation: number } => {
  const record = (input ?? {}) as { ingestJobId?: unknown; generation?: unknown };
  const id = Number(record.ingestJobId);
  return { ingestJobId: Number.isInteger(id) ? id : null, generation: Number(record.generation ?? 0) };
};

const findStaleWorkflows = async (payload: Payload, cutoff: string): Promise<RecoveryFinding[]> => {
  const db = payload.db.drizzle;
  const jobs: Array<Pick<typeof payload_jobs.$inferSelect, "id" | "workflowSlug" | "input" | "updatedAt">> = await db
    .select({
      id: payload_jobs.id,
      workflowSlug: payload_jobs.workflowSlug,
      input: payload_jobs.input,
      updatedAt: payload_jobs.updatedAt,
    })
    .from(payload_jobs)
    .where(
      and(
        eq(payload_jobs.queue, "ingest"),
        eq(payload_jobs.processing, true),
        isNotNull(payload_jobs.workflowSlug),
        lt(payload_jobs.updatedAt, cutoff)
      )
    );

  const findings: RecoveryFinding[] = [];
  for (const job of jobs) {
    const base = { payloadJobId: job.id, workflow: job.workflowSlug, lastSeenAt: job.updatedAt };
    const task = job.workflowSlug === "ingest-process" ? readTaskInput(job.input) : null;
    const [sheet]: IngestJobRow[] =
      task?.ingestJobId == null
        ? []
        : await db.select(sheetColumns).from(ingest_jobs).where(eq(ingest_jobs.id, task.ingestJobId));
    const current =
      sheet !== undefined &&
      PROCESSING_STAGES.includes(String(sheet.stage)) &&
      Number(sheet.generation ?? 0) === task?.generation;
    findings.push(
      current
        ? sheetFinding(payload, sheet, { ...base, kind: "abandoned" })
        : {
            ...base,
            kind: "obsolete",
            action: "close",
            ingestJobId: task?.ingestJobId ?? null,
            stage: sheet ? String(sheet.stage) : null,
            generation: task?.generation ?? null,
          }
    );
  }
  return findings;
};

const findOrphanedSheets = async (payload: Payload, cutoff: string): Promise<RecoveryFinding[]> => {
  const sheets: IngestJobRow[] = await payload.db.drizzle
    .select(sheetColumns)
    .from(ingest_jobs)
    .where(
      and(
        inArray(ingest_jobs.stage, PROCESSING_STAGES as Array<typeof ingest_jobs.$inferSelect.stage>),
        lt(ingest_jobs.updatedAt, cutoff),
        sql`not ${unfinishedChildOf(ingest_jobs.id, ingest_jobs.generation)}`
      )
    );
  return sheets.map((sheet) =>
    sheetFinding(payload, sheet, { kind: "orphaned", payloadJobId: null, workflow: null, lastSeenAt: sheet.updatedAt })
  );
};

/** Everything recovery would do now. Reads only. */
export const findIngestRecoveries = async (payload: Payload, now: Date = new Date()): Promise<RecoveryFinding[]> => {
  const cutoff = new Date(now.getTime() - getIngestLeaseMs()).toISOString();
  return [...(await findStaleWorkflows(payload, cutoff)), ...(await findOrphanedSheets(payload, cutoff))];
};

type Db = Awaited<ReturnType<typeof getTransactionAwareDrizzle>>;

/** Whether the Payload job still runs without heartbeat; `lock` holds its row. */
const jobStillStale = async (db: Db, payloadJobId: number, cutoff: string, lock: boolean): Promise<boolean> => {
  const query = db
    .select({ processing: payload_jobs.processing, updatedAt: payload_jobs.updatedAt })
    .from(payload_jobs)
    .where(eq(payload_jobs.id, payloadJobId));
  const [job]: Array<Pick<typeof payload_jobs.$inferSelect, "processing" | "updatedAt">> = lock
    ? await query.for("update")
    : await query;
  // Postgres returns timestamps as text, not ISO, so compare them as instants.
  return job?.processing === true && Date.parse(job.updatedAt) < Date.parse(cutoff);
};

/** Lock the Payload job and close it if it is still running without heartbeat. */
const closeStaleJob = async (db: Db, payloadJobId: number, cutoff: string): Promise<boolean> => {
  if (!(await jobStillStale(db, payloadJobId, cutoff, true))) return false;
  const now = new Date().toISOString();
  await db
    .update(payload_jobs)
    .set({ processing: false, hasError: true, completedAt: now, updatedAt: now, error: { message: ABANDONED_ERROR } })
    .where(eq(payload_jobs.id, payloadJobId));
  return true;
};

/**
 * Recheck a sheet finding; `lock` holds the rows and closes the stale job. Locks are taken
 * job first, then sheet, the order deletion uses, so the two cannot deadlock.
 */
const sheetStillMatches = async (db: Db, finding: RecoveryFinding, cutoff: string, lock: boolean): Promise<boolean> => {
  if (finding.payloadJobId != null && !(await jobStillStale(db, finding.payloadJobId, cutoff, lock))) return false;
  const query = db
    .select({ stage: ingest_jobs.stage, generation: ingest_jobs.generation, updatedAt: ingest_jobs.updatedAt })
    .from(ingest_jobs)
    .where(eq(ingest_jobs.id, Number(finding.ingestJobId)));
  const [sheet]: Array<Pick<typeof ingest_jobs.$inferSelect, "stage" | "generation" | "updatedAt">> = lock
    ? await query.for("update")
    : await query;
  if (sheet?.stage !== finding.stage || Number(sheet.generation ?? 0) !== finding.generation) return false;
  if (finding.payloadJobId != null) return lock ? closeStaleJob(db, finding.payloadJobId, cutoff) : true;
  if (Date.parse(sheet.updatedAt) >= Date.parse(cutoff)) return false;
  const result: { rows: Array<{ served: boolean }> } = await db.execute(
    sql`select ${unfinishedChildOf(finding.ingestJobId, finding.generation)} as served`
  );
  return result.rows[0]?.served !== true;
};

const failSheet = async (req: PayloadRequest, ingestJobId: number): Promise<void> => {
  await req.payload.update({
    collection: COLLECTION_NAMES.INGEST_JOBS,
    id: ingestJobId,
    data: {
      stage: PROCESSING_STAGE.FAILED,
      errorLog: { lastError: `${ABANDONED_ERROR}; its attempts are used up`, context: "ingest-recovery" },
    },
    req,
  });
};

/** Requeue the sheet; a source file that is gone fails it instead. */
const requeueSheet = async (req: PayloadRequest, db: Db, finding: RecoveryFinding): Promise<RecoveryOutcome> => {
  const id = Number(finding.ingestJobId);
  const [sheet]: Array<Pick<typeof ingest_jobs.$inferSelect, "ingestFile" | "recoveryAttempts">> = await db
    .select({ ingestFile: ingest_jobs.ingestFile, recoveryAttempts: ingest_jobs.recoveryAttempts })
    .from(ingest_jobs)
    .where(eq(ingest_jobs.id, id));
  try {
    await prepareIngestFileRecovery(req, Number(sheet?.ingestFile));
  } catch (error) {
    if (!(error instanceof ValidationError)) throw error;
    await failSheet(req, id);
    return "failed";
  }
  await queueIngestProcess(req, id, finding.resumeFrom ?? getResumePointForStage(String(finding.stage)));
  await db
    .update(ingest_jobs)
    .set({ recoveryAttempts: Number(sheet?.recoveryAttempts ?? 0) + 1 })
    .where(eq(ingest_jobs.id, id));
  return "requeued";
};

const settleSheet = async (payload: Payload, finding: RecoveryFinding, cutoff: string): Promise<RecoveryOutcome> => {
  const req = await createLocalReq({}, payload);
  if (!(await initTransaction(req))) throw new Error("Ingest recovery requires a database transaction");
  try {
    const db = await getTransactionAwareDrizzle(payload, req);
    let outcome: RecoveryOutcome = "skipped";
    if (await sheetStillMatches(db, finding, cutoff, true)) {
      if (finding.action === "requeue") {
        outcome = await requeueSheet(req, db, finding);
      } else {
        await failSheet(req, Number(finding.ingestJobId));
        outcome = "failed";
      }
    }
    await commitTransaction(req);
    return outcome;
  } catch (error) {
    await killTransaction(req);
    throw error;
  }
};

const closeObsolete = async (payload: Payload, finding: RecoveryFinding, cutoff: string): Promise<RecoveryOutcome> => {
  const req = await createLocalReq({}, payload);
  if (!(await initTransaction(req))) throw new Error("Ingest recovery requires a database transaction");
  try {
    const db = await getTransactionAwareDrizzle(payload, req);
    const closed = await closeStaleJob(db, Number(finding.payloadJobId), cutoff);
    await commitTransaction(req);
    return closed ? "closed" : "skipped";
  } catch (error) {
    await killTransaction(req);
    throw error;
  }
};

/** Roll back the events of a sheet that died in create-events, under its dataset lease. */
const acquireRollbackLease = async (
  payload: Payload,
  ingestJobId: number
): Promise<DatasetImportLease | "busy" | null> => {
  const log = createJobLogger(String(ingestJobId), "ingest-recovery");
  const [sheet]: Array<Pick<typeof ingest_jobs.$inferSelect, "dataset">> = await payload.db.drizzle
    .select({ dataset: ingest_jobs.dataset })
    .from(ingest_jobs)
    .where(eq(ingest_jobs.id, ingestJobId));
  if (sheet?.dataset == null) return null;
  try {
    return await acquireDatasetImportLease(payload, Number(sheet.dataset), log, { maxWaitMs: LEASE_WAIT_MS });
  } catch {
    return "busy";
  }
};

const recoverSheet = async (payload: Payload, finding: RecoveryFinding, cutoff: string): Promise<RecoveryFinding> => {
  const id = Number(finding.ingestJobId);
  const lease = finding.stage === PROCESSING_STAGE.CREATE_EVENTS ? await acquireRollbackLease(payload, id) : null;
  if (lease === "busy") return { ...finding, outcome: "skipped", note: "another import holds the dataset" };
  try {
    // Under the lease no other attempt writes this dataset; a finding gone stale must keep its events.
    if (lease && !(await sheetStillMatches(payload.db.drizzle, finding, cutoff, false))) {
      return { ...finding, outcome: "skipped", note: "the import moved on since it was found" };
    }
    if (lease) {
      await cleanupPriorAttempt(payload, id, createJobLogger(String(id), "ingest-recovery"));
      await releaseReservedEventQuota(payload, id);
    }
    const outcome = await settleSheet(payload, finding, cutoff);
    if (outcome === "failed") await reconcileAfterJobTransition(payload, id);
    return { ...finding, outcome };
  } finally {
    await lease?.release();
  }
};

/** Apply one finding after rechecking it; returns it with its outcome. */
export const applyIngestRecovery = async (
  payload: Payload,
  finding: RecoveryFinding,
  now: Date = new Date()
): Promise<RecoveryFinding> => {
  const cutoff = new Date(now.getTime() - getIngestLeaseMs()).toISOString();
  try {
    if (finding.kind === "obsolete") return { ...finding, outcome: await closeObsolete(payload, finding, cutoff) };
    return await recoverSheet(payload, finding, cutoff);
  } catch (error) {
    logger.error({ error, finding }, "Ingest recovery could not apply a finding");
    return { ...finding, outcome: "skipped", note: error instanceof Error ? error.message : String(error) };
  }
};

export interface IngestRecoveryReport {
  mode: "report" | "apply";
  findings: RecoveryFinding[];
  applied: number;
  skipped: number;
}

/** Find, optionally apply, and record a run with findings in `ingest-recovery-runs`. */
export const runIngestRecovery = async (
  payload: Payload,
  options: { apply: boolean }
): Promise<IngestRecoveryReport> => {
  const found = await findIngestRecoveries(payload);
  const findings: RecoveryFinding[] = [];
  for (const finding of found) {
    findings.push(options.apply ? await applyIngestRecovery(payload, finding) : finding);
  }
  const skipped = findings.filter((finding) => finding.outcome === "skipped").length;
  const report: IngestRecoveryReport = {
    mode: options.apply ? "apply" : "report",
    findings,
    applied: options.apply ? findings.length - skipped : 0,
    skipped,
  };
  if (findings.length > 0) {
    await payload.create({
      collection: COLLECTION_NAMES.INGEST_RECOVERY_RUNS,
      data: { mode: report.mode, found: findings.length, applied: report.applied, skipped, findings },
      overrideAccess: true,
    });
  }
  return report;
};
