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

import { validateHtmlExtractConfig } from "./validation";

/**
 * Detect whether the schedule definition (cron / frequency / timezone) changed
 * on an update. A field counts as changed only when it is present in the
 * incoming `data` and differs from `originalDoc`, so a partial update that omits
 * a field is not mistaken for clearing it.
 */
const scheduleDefinitionChanged = (data: Record<string, unknown>, originalDoc?: Record<string, unknown>): boolean => {
  if (!originalDoc) return false;
  const fieldChanged = (field: string): boolean =>
    data[field] !== undefined && (data[field] ?? null) !== (originalDoc[field] ?? null);
  return fieldChanged("cronExpression") || fieldChanged("frequency") || fieldChanged("timezone");
};

/**
 * Handle schedule initialization and statistics.
 *
 * Uses the timezone field (defaulting to UTC) for both frequency and cron calculations.
 */
const handleScheduleInitialization = (
  data: Record<string, unknown>,
  operation: string,
  originalDoc?: Record<string, unknown>
): void => {
  // A changed schedule definition must take effect immediately. shouldRunNow
  // gives an existing nextRun absolute precedence, so a stale value from the OLD
  // schedule would defer the new cadence until the previous fire time passes.
  // Clear it so the block below (or shouldRunNow's lastRun fallback) recomputes
  // against the new schedule — mirrors the nextRunAt reset on schedule change in
  // scraper-repo-sync-job.
  if (operation === "update" && scheduleDefinitionChanged(data, originalDoc)) {
    data.nextRun = null;
  }

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

  // Reject unsafe user regex patterns in htmlExtractConfig.detailPage at save
  // time so a ReDoS pattern never reaches the ingest worker (the json field
  // itself has no per-pattern validation).
  const advancedOptions = data.advancedOptions as { htmlExtractConfig?: unknown } | undefined;
  const htmlExtractError = validateHtmlExtractConfig(advancedOptions?.htmlExtractConfig);
  if (htmlExtractError) {
    throw new Error(htmlExtractError);
  }

  // Handle webhook token generation
  handleWebhookTokenLifecycle(data, originalDoc, req);

  // Clear fields based on schedule type BEFORE calculating nextRun,
  // so the correct schedule type is used for the calculation
  clearScheduleTypeFields(data);

  // Calculate next run time when creating or enabling a schedule
  handleScheduleInitialization(data, operation, originalDoc as Record<string, unknown> | undefined);

  return data;
};
