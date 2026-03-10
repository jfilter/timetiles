/**
 * Custom Payload endpoints for the Scheduled Imports collection.
 *
 * Defines the manual trigger endpoint as a Payload custom endpoint,
 * which provides automatic user context and payload instance.
 *
 * @module
 * @category Collections
 */
import type { Endpoint } from "payload";

import { logError, logger } from "@/lib/logger";

/**
 * POST /api/scheduled-imports/:id/trigger
 *
 * Manually triggers a scheduled import. Uses an atomic claim pattern
 * to prevent concurrent triggers of the same schedule.
 */
export const triggerEndpoint: Omit<Endpoint, "root"> = {
  path: "/:id/trigger",
  method: "post",
  handler: async (req) => {
    if (!req.user) {
      return Response.json({ error: "Authentication required" }, { status: 401 });
    }

    const id = req.routeParams?.id as string | undefined;
    if (!id) {
      return Response.json({ error: "Invalid ID" }, { status: 400 });
    }

    const numericId = Number(id);
    if (!Number.isInteger(numericId) || String(numericId) !== id) {
      return Response.json({ error: "Invalid ID" }, { status: 400 });
    }

    try {
      // Fetch schedule with access control enforced by Payload
      const existingSchedule = await req.payload
        .findByID({
          collection: "scheduled-imports",
          id: numericId,
          depth: 1,
          user: req.user,
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
      const claimResult = await req.payload.update({
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

      // Queue the URL fetch job for manual trigger
      await req.payload.jobs.queue({
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
      logger.error({ error, scheduleId: id, userId: req.user.id }, "Error triggering scheduled import");
      return Response.json({ error: "Internal server error" }, { status: 500 });
    }
  },
};
