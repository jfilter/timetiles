/**
 * Shared view-model utilities for scheduled ingest table and card-list views.
 *
 * Centralizes status badge logic, frequency display, and action labels
 * so the table and list components only own their layout.
 *
 * @module
 * @category Components
 */
import type { StatusVariant } from "@/components/ui/status-badge";
import type { ScheduledIngest } from "@/payload-types";

/** Determine the StatusBadge variant for a schedule. */
export const getScheduleStatusVariant = (schedule: ScheduledIngest): StatusVariant => {
  if (!schedule.enabled) return "muted";
  if (schedule.lastStatus === "failed") return "error";
  // A paused run needs the owner's attention — showing it as "success" is exactly the
  // hiding this status was added to prevent.
  if (schedule.lastStatus === "paused") return "warning";
  return "success";
};

/** Get the frequency display string for a schedule. Returns a translation key or cron expression. */
export const getScheduleFrequencyKey = (
  schedule: ScheduledIngest
): { type: "cron"; value: string } | { type: "key"; value: string } => {
  if (schedule.scheduleType === "cron" && schedule.cronExpression) {
    return { type: "cron", value: schedule.cronExpression };
  }
  return { type: "key", value: schedule.frequency ?? "daily" };
};
