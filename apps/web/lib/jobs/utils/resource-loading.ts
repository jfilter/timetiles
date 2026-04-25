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
import type { Payload } from "payload";

import { COLLECTION_NAMES, PROCESSING_STAGE, type ProcessingStage } from "@/lib/constants/ingest-constants";
import { cleanupSidecarFiles } from "@/lib/ingest/file-readers";
import { logError } from "@/lib/logger";
import type { Dataset, IngestFile, IngestJob } from "@/payload-types";

import type { ConfigSnapshot } from "../handlers/dataset-detection/catalog-dataset-helpers";
import type { TaskCallbackArgs } from "./job-context";
import { getIngestFilePath } from "./upload-path";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && value !== undefined && typeof value === "object" && !Array.isArray(value);

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
    fieldMappingOverrides: snapshot.fieldMappingOverrides ?? undefined,
    idStrategy: snapshot.idStrategy ?? undefined,
    deduplicationConfig: snapshot.deduplicationConfig ?? undefined,
    geoFieldDetection: snapshot.geoFieldDetection ?? undefined,
    schemaConfig: snapshot.schemaConfig ?? undefined,
    ingestTransforms: snapshot.ingestTransforms,
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
    data: { stage: PROCESSING_STAGE.FAILED, errorLog: { lastError: errorMessage, context: context ?? "unknown" } },
  });
};

/**
 * Extract ingestJobId from task callback args, returning null if missing or wrong type.
 */
// eslint-disable-next-line sonarjs/function-return-type -- ingestJobId can be string or number from Payload
export const extractIngestJobId = (args: TaskCallbackArgs): string | number | null => {
  const ingestJobId = (args.input as Record<string, unknown> | undefined)?.ingestJobId;
  if (typeof ingestJobId !== "string" && typeof ingestJobId !== "number") return null;
  return ingestJobId;
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
 * Covers the common pattern shared by 6 of 7 ingest job handlers
 * (all except dataset-detection which updates INGEST_FILES instead).
 *
 * @param context - Error context string identifying the handler (e.g. "schema-detection")
 * @param options.beforeFail - Optional async callback invoked before marking the job as failed.
 *   Runs in a separate try/catch so cleanup failures don't prevent the status update.
 */
export const createStandardOnFail = (
  context: string,
  options?: { beforeFail?: (payload: Payload, ingestJobId: string | number) => Promise<void> }
): ((args: TaskCallbackArgs) => Promise<void>) => {
  return async (args: TaskCallbackArgs) => {
    const ingestJobId = extractIngestJobId(args);
    if (ingestJobId == null) return;

    if (options?.beforeFail) {
      try {
        await options.beforeFail(args.req.payload, ingestJobId);
      } catch (error) {
        // Best-effort pre-fail cleanup — don't mask the status update, but log for visibility
        logError(error, "beforeFail cleanup failed in onFail", { context, ingestJobId });
      }
    }

    try {
      await args.req.payload.update({
        collection: COLLECTION_NAMES.INGEST_JOBS,
        id: ingestJobId,
        data: { stage: PROCESSING_STAGE.FAILED, errorLog: { lastError: extractErrorMessage(args.job.error), context } },
      });
    } catch (error) {
      // Best-effort — don't throw in onFail, but log so silent failures are observable
      logError(error, "Failed to mark ingest job as failed in onFail", { context, ingestJobId });
    }
  };
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
// Each pipeline stage interprets the shared `job.duplicates` struct
// differently. Two production bugs were caused by stages mis-using a single
// overloaded helper (`extractDuplicateRows`):
//
//   - 13768faf "review high-duplicates only on internal duplicates" — the
//     review gate counted external duplicates and tripped on every scheduled
//     re-import of an unchanged URL.
//   - da87dd49 "include external duplicates in schema detection samples" —
//     schema detection filtered external duplicates out of the sample set,
//     which left the schema empty on full-overlap re-imports and failed
//     additive validation with every field marked "removed".
//
// The accessors below name each stage's intent at the call site so this class
// of "wrong duplicate semantics" bug becomes a name mismatch instead of a
// shared-shape footgun.
// ---------------------------------------------------------------------------

const isDuplicateEntry = (d: unknown): d is { rowNumber: number; existingEventId?: string | number } =>
  typeof d === "object" && d !== null && "rowNumber" in d;

const parseDuplicateArray = (arr: unknown): Array<{ rowNumber: number; existingEventId?: string | number }> =>
  Array.isArray(arr) ? arr.filter(isDuplicateEntry) : [];

/** Valid `duplicateStrategy` values for external duplicate handling. */
type DuplicateStrategy = "skip" | "update";

/**
 * Read the configured duplicate strategy from a job's `configSnapshot`.
 *
 * Defaults to `"skip"` — the pipeline's conservative behaviour when the
 * field is missing, null, or of an unexpected type. Private to this module:
 * stages should ask for what they want (e.g. {@link getEventCreationDuplicates}),
 * not for the strategy directly.
 */
const readDuplicateStrategy = (job: Pick<IngestJob, "configSnapshot">): DuplicateStrategy => {
  const snapshot = readConfigSnapshot(job);
  const value = snapshot?.idStrategy?.duplicateStrategy;
  return value === "update" ? "update" : "skip";
};

/**
 * Schema detection: skip internal duplicates only.
 *
 * External duplicates carry the dataset's existing schema and MUST be in the
 * sample set, otherwise re-imports of unchanged URLs produce empty schemas
 * (regression: da87dd49). The skip/update strategy is meaningful only at the
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
 * — counting them would pause the schedule on every run (regression:
 * 13768faf). Returns the internal-unique row count and the total row count
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

/**
 * UI + progress display: per-type duplicate counts.
 *
 * Reads from `job.duplicates.summary` as persisted by analyze-duplicates-job.
 * All fields default to `0` when the summary is absent so callers can rely
 * on stable shapes without optional chaining.
 */
export const getDuplicateSummary = (
  job: IngestJob
): { totalRows: number; uniqueRows: number; internalCount: number; externalCount: number } => {
  const summary = job.duplicates?.summary;
  return {
    totalRows: summary?.totalRows ?? 0,
    uniqueRows: summary?.uniqueRows ?? 0,
    internalCount: summary?.internalDuplicates ?? 0,
    externalCount: summary?.externalDuplicates ?? 0,
  };
};

/**
 * Quota + progress gates: post-dedup, strategy-adjusted event count.
 *
 * Reads `job.duplicates.summary.uniqueRows` as written by
 * analyze-duplicates-job, which already applies the duplicate strategy when
 * computing this number. Use this for any "how many events will we actually
 * create?" decision.
 */
export const getUniqueRowsForQuota = (job: IngestJob): number => {
  return job.duplicates?.summary?.uniqueRows ?? 0;
};
