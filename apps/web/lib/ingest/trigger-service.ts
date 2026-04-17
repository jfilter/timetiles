/**
 * Shared trigger logic for scheduled ingests.
 *
 * Consolidates the common steps for triggering a scheduled ingest run
 * (name generation, status updates, job queueing, statistics) into a
 * single helper used by both the webhook route and the schedule manager job.
 *
 * @module
 * @category Services
 */
import { sql } from "@payloadcms/db-postgres";
import type { Payload } from "payload";

import { COLLECTION_NAMES } from "@/lib/constants/ingest-constants";
import { logError, logger } from "@/lib/logger";
import { extractRelationId } from "@/lib/utils/relation-id";
import type { ScheduledIngest } from "@/payload-types";

/**
 * Generate an import name from the scheduled ingest's template.
 * Replaces {{name}}, {{date}}, {{time}}, and {{url}} placeholders.
 *
 * All time values use UTC to ensure consistent filenames regardless of
 * which code path (webhook or schedule manager) triggers the import.
 */
export const generateIngestName = (scheduledIngest: ScheduledIngest, currentTime: Date): string => {
  const importName = scheduledIngest.ingestNameTemplate ?? "{{name}} - {{date}}";
  const timeString = `${currentTime.getUTCHours().toString().padStart(2, "0")}:${currentTime.getUTCMinutes().toString().padStart(2, "0")}:${currentTime.getUTCSeconds().toString().padStart(2, "0")}`;

  return importName
    .replace("{{name}}", scheduledIngest.name)
    .replace("{{date}}", currentTime.toISOString().split("T")[0] ?? "")
    .replace("{{time}}", timeString)
    .replace("{{url}}", new URL(scheduledIngest.sourceUrl).hostname);
};

interface TriggerOptions {
  /** Which code path triggered this import. */
  triggeredBy: "webhook" | "schedule" | "manual";
  /** If provided, nextRun will be set in the post-queue update. */
  nextRun?: string;
  /** When true, skip the atomic status claim (caller already claimed "running"). */
  alreadyClaimed?: boolean;
}

/**
 * Shared logic for triggering a scheduled ingest run.
 *
 * Sets status to "running" and queues a URL fetch job. The caller controls
 * whether `nextRun` is updated via {@link TriggerOptions.nextRun}.
 *
 * ### currentRetries semantics
 *
 * - User-initiated triggers (`webhook`, `manual`) reset `currentRetries` to 0
 *   — the user is explicitly starting a fresh attempt cycle.
 * - Scheduler-triggered runs (`schedule`) DO NOT reset `currentRetries`. The
 *   counter must accumulate across scheduler ticks so the cap check in
 *   `updateScheduledIngestFailure` can detect exhaustion and disable the
 *   ingest. Resetting here would make `currentRetries` oscillate between 0
 *   and 1 forever, preventing the cap from ever triggering.
 *
 * Execution history is NOT recorded here because the import has only been
 * queued, not completed. The actual success/failure entry is added by the
 * url-fetch job handler when processing finishes.
 *
 * @returns The queued job ID.
 * @throws If the job cannot be queued. The caller is responsible for
 *   error recovery (e.g. reverting status or recording failure).
 */
export const triggerScheduledIngest = async (
  payload: Payload,
  scheduledIngest: ScheduledIngest,
  currentTime: Date,
  options: TriggerOptions
): Promise<{ jobId: number }> => {
  const importName = generateIngestName(scheduledIngest, currentTime);
  // Only user-initiated triggers reset the retry counter; see doc block above.
  const shouldResetRetries = options.triggeredBy !== "schedule";

  // Atomically claim "running" status to prevent overlapping triggers.
  // Uses raw SQL UPDATE with a WHERE guard — PostgreSQL row-level locking
  // ensures only one concurrent caller succeeds even under `read committed`.
  // For webhooks, the route already claimed "running" via raw SQL,
  // so we skip the claim and only update metadata.
  if (options.alreadyClaimed) {
    // Caller already claimed "running" via raw SQL. Re-assert it here so
    // the Payload ORM write doesn't overwrite the SQL-set value.
    await payload.update({
      collection: COLLECTION_NAMES.SCHEDULED_INGESTS,
      id: scheduledIngest.id,
      data: {
        lastStatus: "running",
        lastRun: currentTime.toISOString(),
        ...(shouldResetRetries ? { currentRetries: 0 } : {}),
        ...(options.nextRun != null ? { nextRun: options.nextRun } : {}),
      },
    });
  } else {
    // Atomic SQL claim: a single UPDATE that only succeeds if not already running.
    // Under read committed, the row-level lock from UPDATE prevents a second
    // concurrent transaction from seeing the old status — it blocks until the
    // first commits, then re-evaluates the WHERE and gets 0 rows.
    //
    // Scheduler triggers preserve `current_retries` so the cap logic in
    // updateScheduledIngestFailure can observe the accumulated counter.
    // User-initiated triggers reset it to 0 (handled in the alreadyClaimed
    // branch above — webhooks/manual always go through that path).
    const claimResult = (await payload.db.drizzle.execute(
      options.nextRun != null
        ? sql`
            UPDATE payload.scheduled_ingests
            SET last_status = 'running',
                last_run = ${currentTime.toISOString()},
                next_run = ${options.nextRun}
            WHERE id = ${scheduledIngest.id}
              AND (last_status IS NULL OR last_status != 'running')
            RETURNING id
          `
        : sql`
            UPDATE payload.scheduled_ingests
            SET last_status = 'running',
                last_run = ${currentTime.toISOString()}
            WHERE id = ${scheduledIngest.id}
              AND (last_status IS NULL OR last_status != 'running')
            RETURNING id
          `
    )) as { rows: Array<{ id: number }> };

    if (claimResult.rows.length === 0) {
      throw new Error("scheduled ingest is already running (concurrent trigger rejected)");
    }
  }

  // Queue scheduled-ingest workflow
  const urlFetchJob = await payload.jobs.queue({
    workflow: "scheduled-ingest",
    input: {
      scheduledIngestId: scheduledIngest.id,
      sourceUrl: scheduledIngest.sourceUrl,
      authConfig: scheduledIngest.authConfig,
      catalogId: String(extractRelationId(scheduledIngest.catalog) ?? ""),
      originalName: importName,
      userId: String(extractRelationId(scheduledIngest.createdBy) ?? ""),
      triggeredBy: options.triggeredBy,
    },
  });

  logger.info(
    {
      scheduledIngestId: scheduledIngest.id,
      name: scheduledIngest.name,
      jobId: urlFetchJob.id,
      triggeredBy: options.triggeredBy,
      ...(options.nextRun != null ? { nextRun: options.nextRun } : {}),
    },
    `Triggered scheduled ingest via ${options.triggeredBy}`
  );

  // NOTE: totalRuns is NOT incremented here. It is updated by the job
  // handler on completion (updateScheduledIngestSuccess / updateScheduledIngestFailure)
  // to avoid double-counting.

  return { jobId: urlFetchJob.id };
};

/**
 * Queue an import job for a webhook-triggered scheduled ingest.
 *
 * Sets status to "running" before queueing, reverts on failure.
 * Does NOT update `nextRun` because webhooks are event-driven and
 * should not interfere with the scheduled cadence.
 *
 * @returns The queued job ID on success.
 * @throws If the job cannot be queued (status is reverted first).
 */
export const queueWebhookImport = async (
  payload: Payload,
  scheduledIngest: ScheduledIngest
): Promise<{ jobId: number }> => {
  const currentTime = new Date();
  const previousStatus = scheduledIngest.lastStatus ?? null;

  try {
    return await triggerScheduledIngest(payload, scheduledIngest, currentTime, {
      triggeredBy: "webhook",
      alreadyClaimed: true,
    });
  } catch (queueError) {
    // Revert lastStatus so the import doesn't get stuck as "running"
    logError(queueError, "Failed to queue webhook job, reverting status", {
      scheduledIngestId: scheduledIngest.id,
      previousStatus,
    });
    await payload.update({
      collection: "scheduled-ingests",
      id: scheduledIngest.id,
      data: { lastStatus: previousStatus },
    });
    throw new Error("Failed to queue import job");
  }
};
