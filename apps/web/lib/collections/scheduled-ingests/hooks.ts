/**
 * Hook handlers for scheduled ingests collection.
 *
 * Contains beforeChange hooks that handle schedule calculation,
 * webhook token management, and data normalization. Extracted from
 * the main collection file to improve maintainability and reduce file size.
 *
 * @module
 * @category Collections/ScheduledIngests
 */

import type { CollectionBeforeChangeHook } from "payload";

import { calculateNextCronRun } from "@/lib/ingest/cron-parser";
import { getNextFrequencyExecution } from "@/lib/ingest/schedule-utils";
import { logger } from "@/lib/logger";
import { handleWebhookTokenLifecycle } from "@/lib/services/webhook-registry";
import { extractRelationId } from "@/lib/utils/relation-id";

/**
 * Handle schedule initialization and statistics.
 *
 * Uses the timezone field (defaulting to UTC) for both frequency and cron calculations.
 */
const handleScheduleInitialization = (data: Record<string, unknown>, operation: string): void => {
  if ((operation === "create" || (operation === "update" && data.enabled)) && (data.cronExpression ?? data.frequency)) {
    const timezone = (data.timezone as string | undefined) ?? "UTC";

    // Calculate initial nextRun based on frequency or cron
    if (!data.nextRun && data.frequency) {
      data.nextRun = getNextFrequencyExecution(data.frequency as string, undefined, timezone);
    }

    if (!data.nextRun && data.cronExpression) {
      const nextRun = calculateNextCronRun(data.cronExpression as string, undefined, timezone);
      if (nextRun) {
        data.nextRun = nextRun.toISOString();
      } else {
        logger.warn("Failed to calculate nextRun from cron expression", { cronExpression: data.cronExpression });
      }
    }

    // This would be calculated by the schedule manager
    // For now, just ensure the fields exist
    data.statistics ??= { totalRuns: 0, successfulRuns: 0, failedRuns: 0, averageDuration: 0 };
  }
};

/**
 * Clear fields based on schedule type.
 */
const clearScheduleTypeFields = (data: Record<string, unknown>): void => {
  if (data.scheduleType === "frequency") {
    data.cronExpression = null;
  } else if (data.scheduleType === "cron") {
    data.frequency = null;
  }
};

/**
 * Hook that handles schedule calculation, webhook token management, and field normalization.
 * Also preserves createdBy on updates to prevent modification.
 */
export const beforeChangeHook: CollectionBeforeChangeHook = ({ data, operation, originalDoc, req }) => {
  if (!data) return data;

  // Prevent changing createdBy on update - preserve the original value
  if (operation === "update" && originalDoc?.createdBy) {
    data.createdBy = extractRelationId(originalDoc.createdBy);
  }

  // Handle webhook token generation
  handleWebhookTokenLifecycle(data, originalDoc, req);

  // Clear fields based on schedule type BEFORE calculating nextRun,
  // so the correct schedule type is used for the calculation
  clearScheduleTypeFields(data);

  // Calculate next run time when creating or enabling a schedule
  handleScheduleInitialization(data, operation);

  return data;
};
