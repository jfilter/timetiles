/**
 * Manually triggers a scheduled ingest.
 *
 * Delegates to the shared trigger service which handles atomic status
 * claiming, job queueing, and error recovery.
 *
 * POST /api/scheduled-ingests/:id/trigger
 *
 * @module
 * @category API Routes
 */
import { z } from "zod";

import { apiRoute, ConflictError, safeFindByID } from "@/lib/api";
import { triggerScheduledIngest } from "@/lib/ingest/trigger-service";
import { logError } from "@/lib/logger";

export const POST = apiRoute({
  auth: "required",
  site: "default",
  params: z.object({ id: z.string().regex(/^\d+$/).transform(Number) }),
  handler: async ({ payload, user, params }) => {
    const schedule = await safeFindByID(payload, { collection: "scheduled-ingests", id: params.id, depth: 1, user });

    // Reject disabled schedules before claiming "running": the enable toggle must
    // hold for manual triggers too, not just the cron scheduler. The url-fetch
    // job also re-checks, but rejecting here avoids a doomed job and status churn.
    if (schedule.enabled === false) {
      throw new ConflictError("Import is disabled");
    }

    // Capture the pre-claim status so we can revert if the queue step fails
    // after the atomic claim has already set lastStatus to "running".
    const previousStatus = schedule.lastStatus ?? null;

    try {
      await triggerScheduledIngest(payload, schedule, new Date(), { triggeredBy: "manual" });
    } catch (error) {
      if (error instanceof Error && error.message.includes("already running")) {
        // The atomic claim was rejected (a run is already in progress), so this
        // request never set "running" itself — nothing to revert.
        throw new ConflictError("Import is already running");
      }
      // The atomic claim succeeded but queueing failed, leaving the record stuck
      // as "running". Revert so future triggers (manual, webhook, scheduler) are
      // not silently blocked by the "already running" guard. Mirrors the
      // recovery in queueWebhookImport.
      logError(error, "Failed to queue manual ingest job, reverting status", {
        scheduledIngestId: schedule.id,
        previousStatus,
      });
      await payload.update({ collection: "scheduled-ingests", id: params.id, data: { lastStatus: previousStatus } });
      throw error;
    }

    return { message: "Import triggered" };
  },
});
