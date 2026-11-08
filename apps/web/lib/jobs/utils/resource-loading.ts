/**
 * Common utility functions for loading job resources across job handlers.
 *
 * These functions eliminate code duplication by providing reusable loaders for:
 * - Import jobs, datasets, and import files
 * - File paths for import files
 * - Stage-specific duplicate accessors (see "Duplicate accessors" section)
 *
 * @module
 * @category Jobs/Utils
 */
import { eq } from "@payloadcms/db-postgres/drizzle";
import type { Payload, PayloadRequest } from "payload";
import { commitTransaction, createLocalReq, initTransaction, killTransaction } from "payload";

import { COLLECTION_NAMES, PROCESSING_STAGE, type ProcessingStage } from "@/lib/constants/ingest-constants";
import { getTransactionAwareDrizzle } from "@/lib/database/drizzle-transaction";
import { cleanupSidecarFiles } from "@/lib/ingest/file-readers";
import { readDuplicateStrategy } from "@/lib/ingest/import-quota";
import { getIngestFilePath } from "@/lib/ingest/upload-path";
import { logError, logger } from "@/lib/logger";
import { isRecord } from "@/lib/utils/is-record";
import { ingest_jobs } from "@/payload-generated-schema";
import type { Dataset, IngestFile, IngestJob } from "@/payload-types";

import type { ConfigSnapshot } from "../handlers/dataset-detection/catalog-dataset-helpers";
import { isFinalAttempt, type TaskCallbackArgs } from "./job-context";
import { reconcileAfterJobTransition } from "./reconcile-run";

/**
 * Read a job config snapshot from JSON storage.
 *
 * Payload persists `configSnapshot` as JSON, so the generated type surfaces
 * as `unknown`. This helper narrows to the snapshot shape when possible.
 */
export const readConfigSnapshot = (job: Pick<IngestJob, "configSnapshot">): ConfigSnapshot | null =>
  isRecord(job.configSnapshot) ? (job.configSnapshot as ConfigSnapshot) : null;

/**
 * Overlay a job's frozen config snapshot onto the live dataset record.
 *
 * The dataset relation is still loaded live so non-config fields like name,
 * catalog, and ownership remain current, but pipeline config fields come from
 * the job snapshot to keep the run deterministic.
 */
export const applyConfigSnapshotToDataset = (
  dataset: Dataset,
  snapshot: ConfigSnapshot | null | undefined
): Dataset => {
  if (!snapshot) {
    return dataset;
  }

  // Payload JSON round-trip: `null` = "explicitly cleared", `undefined` = "field not set".
  // We coerce here because the Dataset type uses `undefined` for optional-unset fields.
  return {
    ...dataset,
    interpretationPlan: snapshot.interpretationPlan ?? undefined,
    idStrategy: snapshot.idStrategy ?? undefined,
    deduplicationConfig: snapshot.deduplicationConfig ?? undefined,
    geoFieldDetection: snapshot.geoFieldDetection ?? undefined,
    schemaConfig: snapshot.schemaConfig ?? undefined,
  };
};

/** Load a dataset and apply the job's frozen config snapshot. */
export const loadEffectiveDatasetForJob = async (
  payload: Payload,
  job: Pick<IngestJob, "dataset" | "configSnapshot">
): Promise<Dataset> => {
  const dataset = await loadDataset(payload, job.dataset);
  return applyConfigSnapshotToDataset(dataset, readConfigSnapshot(job));
};

/**
 * Load import job by ID
 */
export const loadIngestJob = async (payload: Payload, ingestJobId: number | string): Promise<IngestJob> => {
  const job = await payload.findByID({ collection: COLLECTION_NAMES.INGEST_JOBS, id: ingestJobId });

  if (!job) {
    throw new Error(`Ingest job not found: ${ingestJobId}`);
  }

  return job;
};

/**
 * Load dataset from job or by ID
 */
export const loadDataset = async (payload: Payload, datasetRef: number | string | Dataset): Promise<Dataset> => {
  const dataset =
    typeof datasetRef === "object"
      ? datasetRef
      : await payload.findByID({ collection: COLLECTION_NAMES.DATASETS, id: datasetRef });

  if (!dataset) {
    throw new Error("Dataset not found");
  }

  return dataset;
};

/**
 * Load import file from job or by ID
 */
export const loadIngestFile = async (
  payload: Payload,
  importFileRef: number | string | IngestFile
): Promise<IngestFile> => {
  const ingestFile =
    typeof importFileRef === "object"
      ? importFileRef
      : await payload.findByID({ collection: COLLECTION_NAMES.INGEST_FILES, id: importFileRef });

  if (!ingestFile) {
    throw new Error("Ingest file not found");
  }

  return ingestFile;
};

/**
 * Load all job resources (job, dataset, and import file)
 */
export const loadJobResources = async (
  payload: Payload,
  ingestJobId: string | number
): Promise<{ job: IngestJob; dataset: Dataset; ingestFile: IngestFile }> => {
  const job = await loadIngestJob(payload, ingestJobId);
  const dataset = await loadEffectiveDatasetForJob(payload, job);
  const ingestFile = await loadIngestFile(payload, job.ingestFile);

  return { job, dataset, ingestFile };
};

/**
 * Load job and file path
 */
export const loadJobAndFilePath = async (
  payload: Payload,
  ingestJobId: number | string
): Promise<{ job: IngestJob; ingestFile: IngestFile; filePath: string }> => {
  const job = await loadIngestJob(payload, ingestJobId);
  const ingestFile = await loadIngestFile(payload, job.ingestFile);

  const filePath = getIngestFilePath(ingestFile.filename ?? "");

  return { job, ingestFile, filePath };
};

/**
 * Mark an import job as FAILED with a standardized error payload.
 *
 * Concentrates the repeated `payload.update({ stage: FAILED, ... })` pattern
 * from job handler catch blocks into one place.
 */
export const failIngestJob = async (
  payload: Payload,
  ingestJobId: string | number,
  error: unknown,
  context?: string
): Promise<void> => {
  const errorMessage = error instanceof Error ? error.message : String(error);

  await payload.update({
    collection: COLLECTION_NAMES.INGEST_JOBS,
    id: ingestJobId,
    data: {
      stage: PROCESSING_STAGE.FAILED,
      errorLog: { lastError: errorMessage, context: context ?? "unknown", timestamp: new Date().toISOString() },
    },
  });
};

/**
 * Extract ingestJobId from task callback args, returning null if missing or wrong type.
 */
export const extractIngestJobId = (args: TaskCallbackArgs): string | number | null => {
  const ingestJobId = (args.input as Record<string, unknown> | undefined)?.ingestJobId;
  if (typeof ingestJobId !== "string" && typeof ingestJobId !== "number") return null;
  return ingestJobId;
};

/** The IngestJob generation a task was started for, or undefined when its input has none. */
export const extractTaskGeneration = (args: Pick<TaskCallbackArgs, "input">): number | undefined => {
  const generation = (args.input as Record<string, unknown> | undefined)?.generation;
  return typeof generation === "number" ? generation : undefined;
};

/** True when the IngestJob moved past the generation a task was started for. */
export const isSupersededGeneration = async (
  payload: Payload,
  ingestJobId: string | number,
  generation: number | undefined
): Promise<boolean> => {
  if (generation === undefined) return false;
  const job = await payload.findByID({ collection: COLLECTION_NAMES.INGEST_JOBS, id: ingestJobId, depth: 0 });
  return Number(job.generation ?? 0) !== generation;
};

/**
 * Run a task's late write with the IngestJob row locked, only while the job is still at
 * the task's generation. Approval, retry and reset lock the same row. Returns whether it ran.
 */
export const writeAtGeneration = async (
  payload: Payload,
  ingestJobId: string | number,
  generation: number | undefined,
  write: (req?: PayloadRequest) => Promise<void>
): Promise<boolean> => {
  // A task queued without a generation has nothing to compare against.
  if (generation === undefined) {
    await write();
    return true;
  }
  const req = await createLocalReq({}, payload);
  if (!(await initTransaction(req))) throw new Error("A generation-checked write requires a database transaction");
  try {
    const db = await getTransactionAwareDrizzle(payload, req);
    const [row] = (await db
      .select({ generation: ingest_jobs.generation })
      .from(ingest_jobs)
      .where(eq(ingest_jobs.id, Number(ingestJobId)))
      .for("update")) as Array<{ generation: number | string | null }>;
    const current = row !== undefined && Number(row.generation ?? 0) === generation;
    if (current) await write(req);
    await commitTransaction(req);
    return current;
  } catch (error) {
    await killTransaction(req);
    throw error;
  }
};

/**
 * Extract an error message from a job error value.
 *
 * Handles Error objects, strings, and unknown values.
 */
const extractErrorMessage = (error: unknown): string => {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "Task failed after all retries";
};

/**
 * Factory for standard onFail callbacks that mark an ingest job as FAILED.
 *
 * Shared by the ingest job handlers except dataset-detection, which updates
 * INGEST_FILES instead.
 *
 * @param context - Error context string identifying the handler (e.g. "schema-detection")
 * @param options.retries - The task's `retries` setting; earlier attempts leave the job untouched.
 * @param options.beforeFail - Optional async callback invoked before marking the job as failed.
 *   Runs in a separate try/catch so cleanup failures don't prevent the status update.
 */
export const createStandardOnFail = (
  context: string,
  options: {
    retries: number;
    beforeFail?: (payload: Payload, ingestJobId: string | number, generation: number | undefined) => Promise<void>;
  }
): ((args: TaskCallbackArgs) => Promise<void>) => {
  return async (args: TaskCallbackArgs) => {
    if (!isFinalAttempt(args, options.retries)) return;
    const ingestJobId = extractIngestJobId(args);
    if (ingestJobId == null) return;
    const generation = extractTaskGeneration(args);
    // A superseded task must neither roll back nor fail the newer generation's work.
    if (await isSupersededGeneration(args.req.payload, ingestJobId, generation)) {
      logger.info({ context, ingestJobId }, "onFail of a superseded task generation, nothing to do");
      return;
    }

    if (options.beforeFail) {
      try {
        await options.beforeFail(args.req.payload, ingestJobId, generation);
      } catch (error) {
        // Best-effort pre-fail cleanup — don't mask the status update, but log for visibility
        logError(error, "beforeFail cleanup failed in onFail", { context, ingestJobId });
      }
    }

    try {
      // Payload calls onFail before it stores the error; recordTaskError has persisted the message.
      // The rollback may have waited for the dataset lease while the generation moved on.
      const failed = await writeAtGeneration(args.req.payload, ingestJobId, generation, async (req) => {
        const current = await args.req.payload.findByID({
          collection: COLLECTION_NAMES.INGEST_JOBS,
          id: ingestJobId,
          depth: 0,
          req,
        });
        const recorded = isRecord(current.errorLog) ? current.errorLog.lastError : undefined;
        const lastError = typeof recorded === "string" ? recorded : extractErrorMessage(args.job.error);
        await args.req.payload.update({
          collection: COLLECTION_NAMES.INGEST_JOBS,
          id: ingestJobId,
          data: { stage: PROCESSING_STAGE.FAILED, errorLog: { lastError, context } },
          req,
        });
      });
      if (!failed) return;
    } catch (error) {
      // Best-effort — don't throw in onFail, but log so silent failures are observable
      logError(error, "Failed to mark ingest job as failed in onFail", { context, ingestJobId });
      return;
    }
    // Payload calls onFail after the workflow's own finally has run, so settle the run here.
    await reconcileAfterJobTransition(args.req.payload, ingestJobId);
  };
};

/**
 * Store a failed task attempt's message on its IngestJob without changing the stage,
 * so the final onFail can report it. Never throws.
 */
export const recordTaskError = async (
  payload: Payload,
  ingestJobId: string | number,
  error: unknown,
  generation?: number
): Promise<void> => {
  try {
    await writeAtGeneration(payload, ingestJobId, generation, async (req) => {
      await payload.update({
        collection: COLLECTION_NAMES.INGEST_JOBS,
        id: ingestJobId,
        data: { errorLog: { lastError: extractErrorMessage(error) } },
        req,
      });
    });
  } catch (updateError) {
    logError(updateError, "Failed to record task error on ingest job", { ingestJobId });
  }
};

/**
 * Best-effort sidecar CSV cleanup for a failed job. Swallows all errors.
 */
export const cleanupSidecarsForJob = async (payload: Payload, ingestJobId: string | number): Promise<void> => {
  try {
    const job = await loadIngestJob(payload, ingestJobId);
    const ingestFile = await loadIngestFile(payload, job.ingestFile);
    const filePath = getIngestFilePath(ingestFile.filename ?? "");
    cleanupSidecarFiles(filePath, job.sheetIndex ?? 0);
  } catch {
    // Best-effort cleanup — don't mask the original error
  }
};

/**
 * Set the processing stage on an ingest job (for UI progress display).
 */
export const setJobStage = async (payload: Payload, jobId: string | number, stage: ProcessingStage): Promise<void> => {
  await payload.update({ collection: COLLECTION_NAMES.INGEST_JOBS, id: jobId, data: { stage } });
};

// ---------------------------------------------------------------------------
// Duplicate accessors
//
// Each pipeline stage interprets the shared `job.duplicates` struct differently
// (internal vs external duplicates, skip vs update strategy). The accessors below
// name each stage's intent at the call site, so picking up another stage's
// duplicate semantics becomes a visible name mismatch.
// ---------------------------------------------------------------------------

const isDuplicateEntry = (d: unknown): d is { rowNumber: number; existingEventId?: string | number } =>
  typeof d === "object" && d !== null && "rowNumber" in d;

const parseDuplicateArray = (arr: unknown): Array<{ rowNumber: number; existingEventId?: string | number }> =>
  Array.isArray(arr) ? arr.filter(isDuplicateEntry) : [];

/**
 * Schema detection: skip internal duplicates only.
 *
 * External duplicates carry the dataset's existing schema and MUST be in the
 * sample set, otherwise re-imports of unchanged URLs produce empty schemas.
 * The skip/update strategy is meaningful only at the
 * event-creation stage; here we ignore it.
 */
export const getInternalDuplicateSkipSet = (job: IngestJob): Set<number> => {
  const skipRows = new Set<number>();
  const duplicates = job.duplicates;
  if (!duplicates || typeof duplicates !== "object" || Array.isArray(duplicates)) {
    return skipRows;
  }
  for (const d of parseDuplicateArray(duplicates.internal)) {
    skipRows.add(d.rowNumber);
  }
  return skipRows;
};

/**
 * Event creation: read the dataset's duplicate-strategy and return rows to
 * skip vs rows to update.
 *
 * Internal duplicates are always skipped. External duplicates: skipped under
 * the `"skip"` strategy; mapped to their existing event IDs under the
 * `"update"` strategy. The strategy is read internally — callers do not pass
 * one in.
 */
export const getEventCreationDuplicates = (
  job: IngestJob
): { skipRows: Set<number>; updateRows: Map<number, string | number> } => {
  const skipRows = new Set<number>();
  const updateRows = new Map<number, string | number>();

  const duplicates = job.duplicates;
  if (!duplicates || typeof duplicates !== "object" || Array.isArray(duplicates)) {
    return { skipRows, updateRows };
  }

  const strategy = readDuplicateStrategy(job);

  // Internal duplicates are always skipped
  for (const d of parseDuplicateArray(duplicates.internal)) {
    skipRows.add(d.rowNumber);
  }

  // External duplicates: skip or update depending on strategy
  for (const d of parseDuplicateArray(duplicates.external)) {
    if (strategy === "update" && d.existingEventId != null) {
      updateRows.set(d.rowNumber, d.existingEventId);
    } else {
      skipRows.add(d.rowNumber);
    }
  }

  return { skipRows, updateRows };
};

/**
 * Review gate: internal-only duplicate rate.
 *
 * External duplicates are expected on scheduled re-imports of unchanged URLs
 * — counting them would pause the schedule on every run. Returns the
 * internal-unique row count and the total row count
 * so callers can compute the duplicate rate themselves.
 *
 * `totalRows` and the count of internal duplicates are read from
 * `job.duplicates.summary` as written by analyze-duplicates-job; if missing,
 * sane defaults of `0` are returned.
 */
export const getDuplicateRatesForReview = (job: IngestJob): { internalUniqueRows: number; totalRows: number } => {
  const summary = job.duplicates?.summary;
  const totalRows = summary?.totalRows ?? 0;
  const internalDuplicates = summary?.internalDuplicates ?? 0;
  const internalUniqueRows = Math.max(0, totalRows - internalDuplicates);
  return { internalUniqueRows, totalRows };
};
