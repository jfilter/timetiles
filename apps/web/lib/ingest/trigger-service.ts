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
import { and, eq, isNull, ne, or } from "@payloadcms/db-postgres/drizzle";
import type { Payload } from "payload";

import { COLLECTION_NAMES } from "@/lib/constants/ingest-constants";
import { logError, logger } from "@/lib/logger";
import { extractRelationId } from "@/lib/utils/relation-id";
import { scheduled_ingests } from "@/payload-generated-schema";
import type { ScheduledIngest } from "@/payload-types";

/**
 * Thrown when the atomic claim loses to a concurrent trigger.
 *
 * A distinct type, not a message substring: every caller has to tell "someone else got there
 * first" (skip, or 409) apart from a real failure, and matching on wording meant a reworded
 * message would silently route the busy case into the error branch of four call sites.
 */
export class ScheduledIngestBusyError extends Error {
  constructor(scheduledIngestId: number | string) {
    super(`Scheduled ingest ${scheduledIngestId} is already running (concurrent trigger rejected)`);
    this.name = "ScheduledIngestBusyError";
  }
}

/** True when a trigger failed because the ingest was already claimed. */
export const isScheduledIngestBusyError = (error: unknown): error is ScheduledIngestBusyError =>
  error instanceof ScheduledIngestBusyError;

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
    .replaceAll("{{name}}", scheduledIngest.name)
    .replaceAll("{{date}}", currentTime.toISOString().split("T")[0] ?? "")
    .replaceAll("{{time}}", timeString)
    .replaceAll("{{url}}", new URL(scheduledIngest.sourceUrl).hostname);
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
  // Uses a single UPDATE with a WHERE guard — PostgreSQL row-level locking
  // ensures only one concurrent caller succeeds even under `read committed`.
  // For webhooks, the route already claimed "running" before calling this helper,
  // so we skip the claim and only update metadata.
  if (options.alreadyClaimed) {
    // Caller already claimed "running". Re-assert it here so the Payload ORM
    // write doesn't overwrite the claimed value.
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
    const claimResult = await payload.db.drizzle
      .update(scheduled_ingests)
      .set({
        lastStatus: "running",
        lastRun: currentTime.toISOString(),
        ...(shouldResetRetries ? { currentRetries: 0 } : {}),
        ...(options.nextRun != null ? { nextRun: options.nextRun } : {}),
      })
      .where(
        and(
          eq(scheduled_ingests.id, scheduledIngest.id),
          or(isNull(scheduled_ingests.lastStatus), ne(scheduled_ingests.lastStatus, "running"))
        )
      )
      .returning({ id: scheduled_ingests.id });

    if (claimResult.length === 0) {
      throw new ScheduledIngestBusyError(scheduledIngest.id);
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

/** The fields the atomic claim overwrites, captured before the claim. */
export interface TriggerClaimSnapshot {
  lastStatus: ScheduledIngest["lastStatus"];
  lastRun: string | null;
  currentRetries: number;
}

/**
 * Capture the state the claim is about to overwrite.
 *
 * All three fields matter: the claim stamps `lastRun` and resets `currentRetries` alongside
 * the status, so reverting the status alone leaves the previous outcome wearing the timestamp
 * of a run that never started and silently restores the retry budget.
 */
export const captureTriggerClaim = (scheduledIngest: ScheduledIngest): TriggerClaimSnapshot => ({
  lastStatus: scheduledIngest.lastStatus ?? null,
  lastRun: scheduledIngest.lastRun ?? null,
  currentRetries: scheduledIngest.currentRetries ?? 0,
});

/** Restore a captured claim after the queue step failed, so the schedule is not stuck "running". */
export const revertTriggerClaim = async (
  payload: Payload,
  id: number | string,
  snapshot: TriggerClaimSnapshot
): Promise<void> => {
  await payload.update({ collection: COLLECTION_NAMES.SCHEDULED_INGESTS, id, data: snapshot, overrideAccess: true });
};

/**
 * What a failed queue step leaves behind.
 *
 * There are exactly two answers, and which one applies follows from who asked for the run:
 *
 * - `"rollback"` — user-initiated runs (webhook, manual trigger, wizard, data-package
 *   activation). The run happens outside the cadence, so a failure that queued nothing must
 *   leave no trace: restoring only `lastStatus` would keep the `lastRun` stamp of a run that
 *   never started and silently reset the retry budget.
 * - `"record-failure"` — the scheduler. There the tick IS the run, so the claim stays and the
 *   caller turns it into a recorded failure with an advanced `nextRun`; rolling back would make
 *   the scheduler re-fire on the same broken import every minute.
 */
export type TriggerFailurePolicy = "rollback" | "record-failure";

/**
 * Claim, queue, and apply the failure policy in one place.
 *
 * A lost claim ({@link ScheduledIngestBusyError}) wrote nothing, so it is re-thrown untouched
 * under either policy — the caller decides whether that means 409, skip, or nothing at all.
 */
export const claimAndQueueScheduledIngest = async (
  payload: Payload,
  scheduledIngest: ScheduledIngest,
  currentTime: Date,
  options: TriggerOptions & { onQueueFailure: TriggerFailurePolicy }
): Promise<{ jobId: number }> => {
  const snapshot = captureTriggerClaim(scheduledIngest);

  try {
    return await triggerScheduledIngest(payload, scheduledIngest, currentTime, options);
  } catch (error) {
    if (isScheduledIngestBusyError(error)) throw error;
    if (options.onQueueFailure === "rollback") {
      await revertTriggerClaim(payload, scheduledIngest.id, snapshot);
    }
    throw error;
  }
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

  try {
    return await claimAndQueueScheduledIngest(payload, scheduledIngest, currentTime, {
      triggeredBy: "webhook",
      alreadyClaimed: true,
      onQueueFailure: "rollback",
    });
  } catch (queueError) {
    logError(queueError, "Failed to queue webhook job, claim reverted", { scheduledIngestId: scheduledIngest.id });
    throw new Error("Failed to queue import job");
  }
};
