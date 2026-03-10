/**
 * Manually triggers a scheduled import.
 *
 * Uses an atomic claim pattern to prevent concurrent triggers of the same
 * schedule. Queues a url-fetch job for the import after validating access
 * and concurrency state.
 *
 * POST /api/scheduled-imports/:id/trigger
 *
 * @module
 * @category API Routes
 */
import { z } from "zod";

import { apiRoute } from "@/lib/api";
import { logError, logger } from "@/lib/logger";

export const POST = apiRoute({
  auth: "required",
  params: z.object({
    id: z.string().regex(/^\d+$/).transform(Number),
  }),
  handler: async ({ payload, user, params }) => {
    const numericId = params.id;

    // Fetch schedule with access control enforced by Payload
    const existingSchedule = await payload
      .findByID({
        collection: "scheduled-imports",
        id: numericId,
        depth: 1,
        user,
        overrideAccess: false,
      })
      .catch(() => null);

    if (!existingSchedule) {
      return Response.json({ error: "Schedule not found or access denied" }, { status: 404 });
    }

    // Atomically claim the import by updating only if not already running.
    // This prevents a race condition where two concurrent trigger requests
    // could both start an import.
    // Use overrideAccess: true because access was already verified above.
    const claimResult = await payload.update({
      collection: "scheduled-imports",
      where: {
        id: { equals: numericId },
        lastStatus: { not_equals: "running" },
      },
      data: {
        lastRun: new Date().toISOString(),
        lastStatus: "running",
      },
      overrideAccess: true,
    });

    if (claimResult.docs.length === 0) {
      return Response.json({ error: "Import is already running" }, { status: 409 });
    }

    try {
      // Queue the URL fetch job for manual trigger
      await payload.jobs.queue({
        task: "url-fetch",
        input: {
          scheduledImportId: String(numericId),
          sourceUrl: existingSchedule.sourceUrl,
          authConfig: existingSchedule.authConfig,
          originalName: existingSchedule.name,
          triggeredBy: "manual",
        },
      });

      return Response.json({ success: true, message: "Import triggered" });
    } catch (error) {
      logError(error, "Error triggering scheduled import");
      logger.error({ error, scheduleId: numericId, userId: user.id }, "Error triggering scheduled import");
      return Response.json({ error: "Internal server error" }, { status: 500 });
    }
  },
});
