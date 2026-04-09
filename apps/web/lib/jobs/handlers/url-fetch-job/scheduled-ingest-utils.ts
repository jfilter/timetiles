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
import { logError, logger } from "@/lib/logger";
import {
  recordScheduledIngestFailure,
  recordScheduledIngestSuccess,
  resolveScheduledIngestStats,
} from "@/lib/types/run-statistics";
import type { ScheduledIngest } from "@/payload-types";

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
    const scheduledIngest = await payload.findByID({
      collection: COLLECTION_NAMES.SCHEDULED_INGESTS,
      id: scheduledIngestId,
      overrideAccess: true,
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
  }
};

/**
 * Updates scheduled ingest status on failed execution.
 */
export const updateScheduledIngestFailure = async (
  payload: Payload,
  scheduledIngest: ScheduledIngest,
  error: Error
): Promise<void> => {
  try {
    const stats = resolveScheduledIngestStats(scheduledIngest.statistics);
    const updatedStats = recordScheduledIngestFailure(stats);

    const currentRetries = (scheduledIngest.currentRetries ?? 0) + 1;

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
      },
    });
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
