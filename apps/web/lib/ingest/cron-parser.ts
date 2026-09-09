/**
 * Cron expression parser and scheduler utilities.
 *
 * Provides parsing and evaluation of cron expressions for scheduled ingests.
 * Supports standard 5-field cron syntax with common patterns like daily,
 * weekly, and monthly schedules. Used by the scheduled ingest system.
 *
 * All functions default to UTC when no timezone is specified (backward compatible).
 * When a timezone is provided, cron fields are matched against wall-clock time
 * in that timezone rather than UTC.
 *
 * @module
 * @category Utilities
 */

import { Cron } from "croner";

import { defaultIfEmpty } from "@/lib/utils/strings";

/**
 * Create an inert schedule for validation or next-run calculation with Payload's cron engine.
 * Uses five-field cron syntax and UTC unless a timezone is supplied.
 */
export const createCronSchedule = (cronExpression: string, timezone = "UTC"): Cron => {
  const parts = cronExpression.trim().split(/\s+/);
  if (parts.length !== 5) {
    throw new Error(`Invalid cron expression: ${cronExpression}. Expected 5 parts, got ${parts.length}`);
  }
  return new Cron(cronExpression, { timezone: defaultIfEmpty(timezone, "UTC"), mode: "5-part", paused: true });
};

export const calculateNextCronRun = (cronExpression: string, fromDate?: Date, timezone?: string): Date | null => {
  try {
    const cron = createCronSchedule(cronExpression, timezone);
    return cron.nextRun(fromDate ?? new Date());
  } catch {
    return null;
  }
};
