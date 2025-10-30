/**
 * Hook handlers for scheduled imports collection.
 *
 * Contains beforeChange hooks that handle schedule calculation,
 * webhook token management, and data normalization. Extracted from
 * the main collection file to improve maintainability and reduce file size.
 *
 * @module
 * @category Collections/ScheduledImports
 */

import { randomBytes } from "crypto";
import type { CollectionBeforeChangeHook } from "payload";

/**
 * Calculates the next run time based on frequency.
 */
const calculateNextRunByFrequency = (frequency: string, fromDate?: Date): Date => {
  const now = fromDate ?? new Date();
  const next = new Date(now);
  next.setUTCSeconds(0);
  next.setUTCMilliseconds(0);

  switch (frequency) {
    case "hourly":
      next.setUTCMinutes(0);
      next.setUTCHours(next.getUTCHours() + 1);
      break;
    case "daily":
      next.setUTCMinutes(0);
      next.setUTCHours(0);
      next.setUTCDate(next.getUTCDate() + 1);
      break;
    case "weekly": {
      next.setUTCMinutes(0);
      next.setUTCHours(0);
      const daysUntilSunday = 7 - next.getUTCDay() || 7;
      next.setUTCDate(next.getUTCDate() + daysUntilSunday);
      break;
    }
    case "monthly":
      next.setUTCMinutes(0);
      next.setUTCHours(0);
      next.setUTCDate(1);
      next.setUTCMonth(next.getUTCMonth() + 1);
      break;
  }

  return next;
};

/**
 * Handle webhook token generation and management.
 */
const handleWebhookToken = (data: Record<string, unknown>, originalDoc?: Record<string, unknown>): void => {
  if (data.webhookEnabled && !data.webhookToken) {
    // Generate new token when enabling webhooks
    data.webhookToken = randomBytes(32).toString("hex");
  } else if (data.webhookEnabled && !originalDoc?.webhookEnabled) {
    // Regenerate token when re-enabling (for security rotation)
    data.webhookToken = randomBytes(32).toString("hex");
  } else if (data.webhookEnabled === false && originalDoc?.webhookEnabled) {
    // Clear token when disabling webhooks
    data.webhookToken = null;
  }
};

/**
 * Handle schedule initialization and statistics.
 */
const handleScheduleInitialization = (data: Record<string, unknown>, operation: string): void => {
  if ((operation === "create" || (operation === "update" && data.enabled)) && (data.cronExpression || data.frequency)) {
    // Calculate initial nextRun based on frequency or cron
    if (!data.nextRun && data.frequency) {
      data.nextRun = calculateNextRunByFrequency(data.frequency as string);
    }

    // This would be calculated by the schedule manager
    // For now, just ensure the fields exist
    if (!data.statistics) {
      data.statistics = {
        totalRuns: 0,
        successfulRuns: 0,
        failedRuns: 0,
        averageDuration: 0,
      };
    }
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
 */
export const beforeChangeHook: CollectionBeforeChangeHook = ({ data, operation, req, originalDoc }) => {
  if (!data) return data;

  // Set createdBy on create
  if (operation === "create" && req.user) {
    data.createdBy = req.user.id;
  }

  // Prevent changing createdBy on update
  if (operation === "update") {
    delete data.createdBy;
  }

  // Handle webhook token generation
  handleWebhookToken(data, originalDoc);

  // Calculate next run time when creating or enabling a schedule
  handleScheduleInitialization(data, operation);

  // Clear fields based on schedule type
  clearScheduleTypeFields(data);

  return data;
};
