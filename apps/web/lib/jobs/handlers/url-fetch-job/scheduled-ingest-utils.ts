/**
 * scheduled ingest utilities for URL fetch jobs.
 *
 * Contains functions for managing scheduled ingest configurations,
 * updating statistics, and handling execution history.
 *
 * @module
 * @category Jobs/UrlFetch
 */

import type { Payload } from "payload";

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
import { extractRelationId } from "@/lib/utils/relation-id";
import type { ScheduledIngest } from "@/payload-types";

/**
 * Narrow request shape used for transaction/audit propagation. Mirrors the
 * type used by `auditLog` so the same structural value can flow through both.
 * Only transactionID/context are consulted by Payload's update paths when
 * participating in an ongoing transaction — callers can pass a slim literal
 * or a full PayloadRequest.
 */
type PartialReq = { transactionID?: number | string | Promise<number | string>; context?: Record<string, unknown> };

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
 * Used by workflow-level success/failure reconciliation after a run has already
 * been claimed as "running". This avoids leaving the schedule stuck if a user
 * disables it mid-run.
 */
export const loadScheduledIngestForLifecycle = async (
  payload: Payload,
  scheduledIngestId: number | undefined
): Promise<ScheduledIngest | null> => {
  if (!scheduledIngestId) {
    return null;
  }

  try {
    return await asSystem(payload).findByID({ collection: COLLECTION_NAMES.SCHEDULED_INGESTS, id: scheduledIngestId });
  } catch (error) {
    logError(error, "Failed to load scheduled ingest for lifecycle update", { scheduledIngestId });
    return null;
  }
};

/**
 * Updates scheduled ingest status on successful execution.
 */
export const updateScheduledIngestSuccess = async (
  payload: Payload,
  scheduledIngest: ScheduledIngest,
  importFileId: number | string,
  duration: number
): Promise<void> => {
  try {
    const stats = resolveScheduledIngestStats(scheduledIngest.statistics);
    const updatedStats = recordScheduledIngestSuccess(stats, duration);

    // Update execution history
    const executionHistory = scheduledIngest.executionHistory ?? [];
    executionHistory.unshift({
      executedAt: new Date().toISOString(),
      status: "success",
      jobId: importFileId.toString(),
      duration,
    });

    // Keep only last 10 executions
    if (executionHistory.length > 10) {
      executionHistory.splice(10);
    }

    await payload.update({
      collection: COLLECTION_NAMES.SCHEDULED_INGESTS,
      id: scheduledIngest.id,
      data: {
        lastRun: new Date().toISOString(),
        lastStatus: "success", // CRITICAL: Reset from "running" to "success"
        lastError: null,
        currentRetries: 0,
        executionHistory,
        statistics: updatedStats,
      },
    });
  } catch (error) {
    logError(error, "Failed to update scheduled ingest success status", { scheduledIngestId: scheduledIngest.id });
    throw error;
  }
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
  req?: PartialReq
): Promise<void> => {
  try {
    const stats = resolveScheduledIngestStats(scheduledIngest.statistics);
    const updatedStats = recordScheduledIngestFailure(stats);

    const previousRetries = scheduledIngest.currentRetries ?? 0;
    const currentRetries = previousRetries + 1;
    const maxRetries = scheduledIngest.retryConfig?.maxRetries ?? 3;
    const retriesExhausted = currentRetries > maxRetries;
    const retryBudgetJustExhausted = previousRetries <= maxRetries && retriesExhausted;

    // Update execution history
    const executionHistory = scheduledIngest.executionHistory ?? [];
    executionHistory.unshift({ executedAt: new Date().toISOString(), status: "failed", error: error.message });

    // Keep only last 10 executions
    if (executionHistory.length > 10) {
      executionHistory.splice(10);
    }

    await payload.update({
      collection: COLLECTION_NAMES.SCHEDULED_INGESTS,
      id: scheduledIngest.id,
      data: {
        lastRun: new Date().toISOString(),
        lastStatus: "failed", // CRITICAL: Reset from "running" to "failed"
        lastError: error.message,
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
  }
};

/**
 * Checks for duplicate content based on hash.
 */
export const checkForDuplicateContent = async (
  payload: Payload,
  catalogId: string | number | undefined,
  dataHash: string,
  skipDuplicateChecking: boolean
): Promise<{ isDuplicate: boolean; existingFile?: { id: string; filename: string } }> => {
  if (!catalogId || skipDuplicateChecking) {
    return { isDuplicate: false };
  }

  try {
    const recentFiles = await payload.find({
      collection: COLLECTION_NAMES.INGEST_FILES,
      where: {
        catalog: { equals: catalogId },
        "metadata.urlFetch.contentHash": { equals: dataHash },
        status: { equals: "completed" },
      },
      sort: "-createdAt",
      limit: 1,
    });

    if (recentFiles.docs.length > 0) {
      const existingFile = recentFiles.docs[0];
      if (existingFile) {
        return {
          isDuplicate: true,
          existingFile: { id: existingFile.id.toString(), filename: existingFile.filename ?? "unknown" },
        };
      }
    }
  } catch (error) {
    logError(error, "Failed to check for duplicate content");
  }

  return { isDuplicate: false };
};
