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
import { claimAndQueueScheduledIngest, isScheduledIngestBusyError } from "@/lib/ingest/trigger-service";
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

    try {
      await claimAndQueueScheduledIngest(payload, schedule, new Date(), {
        triggeredBy: "manual",
        onQueueFailure: "rollback",
      });
    } catch (error) {
      // A lost claim means this request never set "running" itself.
      if (isScheduledIngestBusyError(error)) {
        throw new ConflictError("Import is already running");
      }
      logError(error, "Failed to queue manual ingest job, claim reverted", { scheduledIngestId: schedule.id });
      throw error;
    }

    return { message: "Import triggered" };
  },
});
