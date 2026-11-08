/**
 * scheduled ingest utilities for URL fetch jobs.
 *
 * Contains functions for managing scheduled ingest configurations,
 * updating statistics, and handling execution history.
 *
 * @module
 * @category Jobs/UrlFetch
 */

import type { Payload, Where } from "payload";

import { COLLECTION_NAMES } from "@/lib/constants/ingest-constants";
import { sendScheduledIngestRetriesExhaustedEmail } from "@/lib/ingest/scheduled-ingest-emails";
import { logError, logger } from "@/lib/logger";
import { AUDIT_ACTIONS, auditLog } from "@/lib/services/audit-log-service";
import { asSystem } from "@/lib/services/system-payload";
import {
  recordScheduledIngestFailure,
  recordScheduledIngestSuccess,
  resolveScheduledIngestStats,
} from "@/lib/types/run-statistics";
import { isRecord } from "@/lib/utils/is-record";
import { extractRelationId } from "@/lib/utils/relation-id";
import type { ScheduledIngest } from "@/payload-types";

/** Payload throws `NotFound` (status 404) for a missing document. */
const isNotFoundError = (error: unknown): boolean =>
  typeof error === "object" && error !== null && "status" in error && (error as { status?: number }).status === 404;

/**
 * Narrow request shape used for transaction/audit propagation. Mirrors the
 * type used by `auditLog` so the same structural value can flow through both.
 * Only transactionID/context are consulted by Payload's update paths when
 * participating in an ongoing transaction — callers can pass a slim literal
 * or a full PayloadRequest.
 */
export type PartialReq = {
  transactionID?: number | string | Promise<number | string>;
  context?: Record<string, unknown>;
};

/**
 * Loads scheduled ingest configuration.
 */
export const loadScheduledIngestConfig = async (
  payload: Payload,
  scheduledIngestId: number | undefined
): Promise<ScheduledIngest | null> => {
  if (!scheduledIngestId) {
    return null;
  }

  try {
    const scheduledIngest = await asSystem(payload).findByID({
      collection: COLLECTION_NAMES.SCHEDULED_INGESTS,
      id: scheduledIngestId,
    });

    if (!scheduledIngest.enabled) {
      logger.info("Scheduled ingest is disabled, skipping", { scheduledIngestId });
      return null;
    }

    return scheduledIngest;
  } catch (error) {
    logError(error, "Failed to load scheduled ingest", { scheduledIngestId });
    return null;
  }
};

/**
 * Load a scheduled ingest regardless of whether it is currently enabled.
 *
 * Used by workflow-level success/review reconciliation after a run has already
 * been claimed as "running". This avoids leaving the schedule stuck if a user
 * disables it mid-run.
 */
export const loadScheduledIngestForLifecycle = async (
  payload: Payload,
  scheduledIngestId: number | undefined,
  req?: PartialReq
): Promise<ScheduledIngest | null> => {
  if (!scheduledIngestId) {
    return null;
  }

  try {
    return await asSystem(payload).findByID({
      collection: COLLECTION_NAMES.SCHEDULED_INGESTS,
      id: scheduledIngestId,
      ...(req ? { req } : {}),
    });
  } catch (error) {
    logError(error, "Failed to load scheduled ingest for lifecycle update", { scheduledIngestId });

    // A deleted schedule has nothing left to reconcile; anything else (a DB blip) must surface,
    // or the schedule would stay at lastStatus="running" with its retry counter frozen.
    if (isNotFoundError(error)) {
      return null;
    }
    throw error;
  }
};

/** An ingest file id, absent when a run produced no file (an empty source). */
type OptionalIngestFileId = number | string | undefined;

type HistoryEntry = NonNullable<ScheduledIngest["executionHistory"]>[number];

/** Options of a counted run outcome. `amend` replaces the run's earlier (paused) entry. */
type RunUpdateOptions = { req?: PartialReq; amend?: boolean };

/**
 * Place a run's history entry: new runs go first (keeping the last 10), an amended run
 * replaces its own entry. `isNewest` decides whether the schedule's last status follows;
 * an amended run never takes it over from a newer run that is still running.
 */
const placeHistoryEntry = (
  scheduledIngest: ScheduledIngest,
  entry: HistoryEntry,
  amend: boolean
): { executionHistory: HistoryEntry[]; isNewest: boolean } => {
  const executionHistory = [...(scheduledIngest.executionHistory ?? [])];
  if (!amend) {
    executionHistory.unshift(entry);
    return { executionHistory: executionHistory.slice(0, 10), isNewest: true };
  }
  const index = executionHistory.findIndex((existing) => entry.jobId != null && existing.jobId === entry.jobId);
  const existing = executionHistory[index];
  if (existing) executionHistory[index] = { ...existing, ...entry, executedAt: existing.executedAt };
  return { executionHistory, isNewest: index === 0 && scheduledIngest.lastStatus !== "running" };
};

/**
 * Updates scheduled ingest status on successful execution.
 */
export const updateScheduledIngestSuccess = async (
  payload: Payload,
  scheduledIngest: ScheduledIngest,
  importFileId: OptionalIngestFileId,
  duration: number,
  { req, amend = false }: RunUpdateOptions = {}
): Promise<void> => {
  try {
    const stats = resolveScheduledIngestStats(scheduledIngest.statistics);
    const updatedStats = recordScheduledIngestSuccess(stats, duration);
    const { executionHistory, isNewest } = placeHistoryEntry(
      scheduledIngest,
      {
        executedAt: new Date().toISOString(),
        status: "success",
        jobId: importFileId?.toString(),
        duration,
        error: null,
      },
      amend
    );

    await payload.update({
      collection: COLLECTION_NAMES.SCHEDULED_INGESTS,
      id: scheduledIngest.id,
      data: {
        // CRITICAL: a new run resets lastStatus from "running" to "success"
        ...(isNewest ? { lastStatus: "success" as const, lastError: null } : {}),
        ...(amend ? {} : { lastRun: new Date().toISOString() }),
        currentRetries: 0,
        executionHistory,
        statistics: updatedStats,
      },
      ...(req ? { req } : {}),
    });
  } catch (error) {
    logError(error, "Failed to update scheduled ingest success status", { scheduledIngestId: scheduledIngest.id });
    throw error;
  }
};

/**
 * Resolve a run that finished but left the import waiting on a human.
 *
 * NOT the success path: that one increments `successfulRuns`, clears `lastError` and writes
 * a "success" history entry, hiding the pending review. NOT the failure path either: that
 * increments `currentRetries`, so a feed that needs review on every run would auto-disable
 * despite each approval. `lastStatus` must still move off "running".
 */
export const updateScheduledIngestPaused = async (
  payload: Payload,
  scheduledIngest: ScheduledIngest,
  importFileId: OptionalIngestFileId,
  duration: number,
  reason: string,
  req?: PartialReq
): Promise<void> => {
  try {
    const executionHistory = scheduledIngest.executionHistory ?? [];
    executionHistory.unshift({
      executedAt: new Date().toISOString(),
      status: "paused",
      jobId: importFileId?.toString(),
      duration,
      error: reason,
    });

    if (executionHistory.length > 10) {
      executionHistory.splice(10);
    }

    await payload.update({
      collection: COLLECTION_NAMES.SCHEDULED_INGESTS,
      id: scheduledIngest.id,
      data: { lastRun: new Date().toISOString(), lastStatus: "paused", lastError: reason, executionHistory },
      ...(req ? { req } : {}),
    });
  } catch (error) {
    logError(error, "Failed to update scheduled ingest paused status", { scheduledIngestId: scheduledIngest.id });
    throw error;
  }
};

/** Status of one entry in a schedule's execution history. */
export type ScheduledRunStatus = "success" | "paused" | "failed";

/**
 * Rewrite the history entry of an already counted run whose outcome changed later,
 * e.g. a retried sheet. Counters stay untouched; `lastStatus` follows only when
 * that run is still the newest entry and no newer run is running.
 */
export const amendScheduledIngestRun = async (
  payload: Payload,
  scheduledIngest: ScheduledIngest,
  ingestFileId: number | string,
  status: ScheduledRunStatus,
  error: string | null,
  req?: PartialReq
): Promise<void> => {
  const executionHistory = [...(scheduledIngest.executionHistory ?? [])];
  const index = executionHistory.findIndex((entry) => entry.jobId === String(ingestFileId));
  const entry = executionHistory[index];
  if (!entry) return;
  executionHistory[index] = { ...entry, status, error };
  const isNewest = index === 0 && scheduledIngest.lastStatus !== "running";
  await payload.update({
    collection: COLLECTION_NAMES.SCHEDULED_INGESTS,
    id: scheduledIngest.id,
    data: { executionHistory, ...(isNewest ? { lastStatus: status, lastError: error } : {}) },
    ...(req ? { req } : {}),
  });
};

/**
 * Emits an audit log entry when a scheduled ingest is disabled after
 * exhausting its configured retry budget. Resolves the ingest's owner
 * (createdBy) to populate userId/userEmail, and participates in the
 * caller's transaction via `req` when provided.
 */
const auditRetriesExhausted = async (
  payload: Payload,
  scheduledIngest: ScheduledIngest,
  newRetries: number,
  maxRetries: number,
  lastError: string,
  req?: PartialReq
): Promise<void> => {
  const ownerId = extractRelationId<number>(scheduledIngest.createdBy);
  if (!ownerId) return;

  try {
    const owner = await asSystem(payload).findByID({
      collection: "users",
      id: ownerId,
      depth: 0,
      ...(req ? { req } : {}),
    });

    await auditLog(
      payload,
      {
        action: AUDIT_ACTIONS.SCHEDULED_INGEST_RETRIES_EXHAUSTED,
        userId: ownerId,
        userEmail: owner.email,
        details: {
          scheduledIngestId: scheduledIngest.id,
          scheduledIngestName: scheduledIngest.name,
          currentRetries: newRetries,
          maxRetries,
          lastError,
        },
      },
      { req }
    );

    // Notify the owner so a silently-disabled schedule doesn't stay unnoticed.
    // `queueEmail` swallows queue errors internally.
    await sendScheduledIngestRetriesExhaustedEmail(payload, owner, scheduledIngest, newRetries, maxRetries, lastError);
  } catch {
    /* audit + notification are best-effort */
  }
};

/**
 * Updates scheduled ingest status on failed execution.
 *
 * Increments `currentRetries` and checks it against `retryConfig.maxRetries`.
 * When the retry budget is exhausted, disables the ingest (`enabled: false`)
 * so the scheduler stops re-queueing it. Audit/email notifications are emitted
 * only when the run crosses the retry budget; later failures for already
 * exhausted jobs keep the record disabled without spamming the owner.
 */
export const updateScheduledIngestFailure = async (
  payload: Payload,
  scheduledIngest: ScheduledIngest,
  error: Error,
  { req, ingestFileId, amend = false }: RunUpdateOptions & { ingestFileId?: OptionalIngestFileId } = {}
): Promise<void> => {
  try {
    const stats = resolveScheduledIngestStats(scheduledIngest.statistics);
    const updatedStats = recordScheduledIngestFailure(stats);

    const previousRetries = scheduledIngest.currentRetries ?? 0;
    const currentRetries = previousRetries + 1;
    const maxRetries = scheduledIngest.retryConfig?.maxRetries ?? 3;
    const retriesExhausted = currentRetries > maxRetries;
    const retryBudgetJustExhausted = previousRetries <= maxRetries && retriesExhausted;

    const { executionHistory, isNewest } = placeHistoryEntry(
      scheduledIngest,
      { executedAt: new Date().toISOString(), status: "failed", jobId: ingestFileId?.toString(), error: error.message },
      amend
    );

    await payload.update({
      collection: COLLECTION_NAMES.SCHEDULED_INGESTS,
      id: scheduledIngest.id,
      data: {
        // CRITICAL: a new run resets lastStatus from "running" to "failed"
        ...(isNewest ? { lastStatus: "failed" as const, lastError: error.message } : {}),
        ...(amend ? {} : { lastRun: new Date().toISOString() }),
        currentRetries,
        executionHistory,
        statistics: updatedStats,
        // Permanently disable once the retry budget is exhausted. Without this,
        // the scheduler keeps re-queueing every tick until the daily cleanup job
        // (or an operator) intervenes. The ingest can be re-enabled manually
        // after the root cause is addressed.
        ...(retriesExhausted ? { enabled: false } : {}),
      },
      ...(req ? { req } : {}),
    });

    if (retryBudgetJustExhausted) {
      logger.error(
        {
          scheduledIngestId: scheduledIngest.id,
          name: scheduledIngest.name,
          currentRetries,
          maxRetries,
          lastError: error.message,
        },
        "Scheduled ingest disabled after exhausting retry budget"
      );
      await auditRetriesExhausted(payload, scheduledIngest, currentRetries, maxRetries, error.message, req);
    }
  } catch (updateError) {
    logError(updateError, "Failed to update scheduled ingest failure status", {
      scheduledIngestId: scheduledIngest.id,
    });
    throw updateError;
  }
};

/**
 * Checks whether the fetched content equals the latest completed import in scope.
 *
 * Only the latest one counts: content that reappears after a different version
 * (A, B, A) must be imported again. The match is scoped to where the data lands: a bare
 * (catalog, hash) match would skip the import when a DIFFERENT schedule in the
 * same catalog already imported the same content into ANOTHER dataset, or when
 * the schedule was re-pointed at a new dataset — leaving the new target empty
 * while reporting success.
 */
export const checkForDuplicateContent = async (
  payload: Payload,
  catalogId: string | number | undefined,
  dataHash: string,
  skipDuplicateChecking: boolean,
  scope?: { scheduledIngestId?: number; targetDatasetId?: number | null }
): Promise<{ isDuplicate: boolean; existingFile?: { id: string; filename: string } }> => {
  if (!catalogId || skipDuplicateChecking) {
    return { isDuplicate: false };
  }

  try {
    const where: Where = { catalog: { equals: catalogId }, status: { equals: "completed" } };
    if (scope?.targetDatasetId != null) {
      where.targetDataset = { equals: scope.targetDatasetId };
    } else if (scope?.scheduledIngestId != null) {
      where.scheduledIngest = { equals: scope.scheduledIngestId };
    }

    const recentFiles = await payload.find({
      collection: COLLECTION_NAMES.INGEST_FILES,
      where,
      sort: "-createdAt",
      limit: 1,
    });

    const latestFile = recentFiles.docs[0];
    const urlFetch = isRecord(latestFile?.metadata) ? latestFile.metadata.urlFetch : undefined;
    if (latestFile && isRecord(urlFetch) && urlFetch.contentHash === dataHash) {
      return {
        isDuplicate: true,
        existingFile: { id: latestFile.id.toString(), filename: latestFile.filename ?? "unknown" },
      };
    }
  } catch (error) {
    logError(error, "Failed to check for duplicate content");
  }

  return { isDuplicate: false };
};
