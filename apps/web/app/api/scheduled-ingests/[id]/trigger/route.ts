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
import type { ScheduledIngest } from "@/payload-types";

export const POST = apiRoute({
  auth: "required",
  site: "default",
  params: z.object({ id: z.string().regex(/^\d+$/).transform(Number) }),
  handler: async ({ payload, user, params }) => {
    const schedule = await safeFindByID<ScheduledIngest>(payload, {
      collection: "scheduled-ingests",
      id: params.id,
      depth: 1,
      user,
    });

    try {
      await triggerScheduledIngest(payload, schedule, new Date(), { triggeredBy: "manual" });
    } catch (error) {
      if (error instanceof Error && error.message.includes("already running")) {
        throw new ConflictError("Import is already running");
      }
      throw error;
    }

    return { message: "Import triggered" };
  },
});
