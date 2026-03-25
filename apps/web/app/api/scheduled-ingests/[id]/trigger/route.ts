/**
 * Manually triggers a scheduled ingest.
 *
 * Uses an atomic claim pattern to prevent concurrent triggers of the same
 * schedule. Queues a url-fetch job for the import after validating access
 * and concurrency state.
 *
 * POST /api/scheduled-ingests/:id/trigger
 *
 * @module
 * @category API Routes
 */
import { z } from "zod";

import { apiRoute, ConflictError, safeFindByID } from "@/lib/api";
import { queueJobWithRollback } from "@/lib/api/job-helpers";
import { claimScheduledIngestRunning } from "@/lib/services/webhook-registry";
import type { ScheduledIngest } from "@/payload-types";

export const POST = apiRoute({
  auth: "required",
  site: "default",
  params: z.object({ id: z.string().regex(/^\d+$/).transform(Number) }),
  handler: async ({ payload, user, params }) => {
    const numericId = params.id;

    // Fetch schedule with access control enforced by Payload
    const existingSchedule = await safeFindByID<ScheduledIngest>(payload, {
      collection: "scheduled-ingests",
      id: numericId,
      depth: 1,
      user,
    });

    // Atomically claim "running" status via a single SQL UPDATE with a WHERE
    // guard. This prevents a race condition where two concurrent trigger
    // requests could both start an import. Access was already verified above.
    const claimed = await claimScheduledIngestRunning(payload, numericId);
    if (!claimed) {
      throw new ConflictError("Import is already running");
    }

    // Set lastRun timestamp (separate from the atomic claim because
    // claimScheduledIngestRunning only sets last_status for simplicity)
    await payload.update({
      collection: "scheduled-ingests",
      id: numericId,
      data: { lastRun: new Date().toISOString() },
      overrideAccess: true,
    });

    // Queue the URL fetch job — revert status on failure
    await queueJobWithRollback(
      payload,
      {
        task: "url-fetch",
        input: {
          scheduledIngestId: numericId,
          sourceUrl: existingSchedule.sourceUrl,
          authConfig: existingSchedule.authConfig,
          originalName: existingSchedule.name,
          triggeredBy: "manual",
        },
      },
      {
        collection: "scheduled-ingests",
        where: { id: { equals: numericId } },
        data: { lastStatus: "failed", lastError: "Failed to queue import job" },
      }
    );

    return { message: "Import triggered" };
  },
});
