/**
 * Scheduled import utilities for URL fetch jobs.
 *
 * Contains functions for managing scheduled import configurations,
 * updating statistics, and handling execution history.
 *
 * @module
 * @category Jobs/UrlFetch
 */

import type { Payload } from "payload";

import { COLLECTION_NAMES } from "@/lib/constants/import-constants";
import { logError } from "@/lib/logger";
import type { ScheduledImport } from "@/payload-types";

/**
 * Loads scheduled import configuration
 */
export const loadScheduledImportConfig = async (
  payload: Payload,
  scheduledImportId: string | undefined
): Promise<ScheduledImport | null> => {
  if (!scheduledImportId) {
    return null;
  }

  try {
    const scheduledImport = await payload.findByID({
      collection: COLLECTION_NAMES.SCHEDULED_IMPORTS,
      id: scheduledImportId,
    });

    if (!scheduledImport.enabled) {
      throw new Error("Scheduled import is disabled");
    }

    return scheduledImport;
  } catch (error) {
    logError(error, "Failed to load scheduled import", { scheduledImportId });
    return null;
  }
};

/**
 * Updates scheduled import status on successful execution
 */
export const updateScheduledImportSuccess = async (
  payload: Payload,
  scheduledImport: ScheduledImport,
  importFileId: number | string,
  duration: number
): Promise<void> => {
  try {
    const stats = scheduledImport.statistics ?? {
      totalRuns: 0,
      successfulRuns: 0,
      failedRuns: 0,
      averageDuration: 0,
    };

    // Update statistics
    const newTotalRuns = (stats.totalRuns ?? 0) + 1;
    const newSuccessfulRuns = (stats.successfulRuns ?? 0) + 1;
    const oldAverage = stats.averageDuration ?? 0;
    const newAverage = (oldAverage * (newSuccessfulRuns - 1) + duration / 1000) / newSuccessfulRuns;

    // Update execution history
    const executionHistory = scheduledImport.executionHistory ?? [];
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
      collection: COLLECTION_NAMES.SCHEDULED_IMPORTS,
      id: scheduledImport.id,
      data: {
        lastRun: new Date().toISOString(),
        lastStatus: "success",
        currentRetries: 0,
        executionHistory,
        statistics: {
          ...stats,
          totalRuns: newTotalRuns,
          successfulRuns: newSuccessfulRuns,
          averageDuration: newAverage,
        },
      },
    });
  } catch (error) {
    logError(error, "Failed to update scheduled import success status", {
      scheduledImportId: scheduledImport.id,
    });
  }
};

/**
 * Updates scheduled import status on failed execution
 */
export const updateScheduledImportFailure = async (
  payload: Payload,
  scheduledImport: ScheduledImport,
  error: Error
): Promise<void> => {
  try {
    const stats = scheduledImport.statistics ?? {
      totalRuns: 0,
      successfulRuns: 0,
      failedRuns: 0,
      averageDuration: 0,
    };

    const currentRetries = (scheduledImport.currentRetries ?? 0) + 1;
    // maxRetries is intentionally unused - keeping for future retry logic
    // const maxRetries = scheduledImport.retryConfig?.maxRetries ?? 3;

    // Update execution history
    const executionHistory = scheduledImport.executionHistory ?? [];
    executionHistory.unshift({
      executedAt: new Date().toISOString(),
      status: "failed",
      error: error.message,
    });

    // Keep only last 10 executions
    if (executionHistory.length > 10) {
      executionHistory.splice(10);
    }

    await payload.update({
      collection: COLLECTION_NAMES.SCHEDULED_IMPORTS,
      id: scheduledImport.id,
      data: {
        lastRun: new Date().toISOString(),
        lastStatus: "failed",
        lastError: error.message,
        currentRetries,
        executionHistory,
        statistics: {
          ...stats,
          totalRuns: (stats.totalRuns ?? 0) + 1,
          failedRuns: (stats.failedRuns ?? 0) + 1,
        },
      },
    });
  } catch (updateError) {
    logError(updateError, "Failed to update scheduled import failure status", {
      scheduledImportId: scheduledImport.id,
    });
  }
};

/**
 * Checks for duplicate content based on hash
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
      collection: COLLECTION_NAMES.IMPORT_FILES,
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
          existingFile: {
            id: existingFile.id.toString(),
            filename: existingFile.filename ?? "unknown",
          },
        };
      }
    }
  } catch (error) {
    logError(error, "Failed to check for duplicate content");
  }

  return { isDuplicate: false };
};
