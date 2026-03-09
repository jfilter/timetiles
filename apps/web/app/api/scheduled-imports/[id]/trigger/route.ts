/**
 * API route for manually triggering a scheduled import.
 *
 * @module
 * @category API
 */
import { NextResponse } from "next/server";
import { getPayload } from "payload";

import { logError } from "@/lib/logger";
import { type AuthenticatedRequest, withAuth } from "@/lib/middleware/auth";
import { apiError, badRequest, forbidden, internalError, notFound } from "@/lib/utils/api-response";
import { parseStrictInteger } from "@/lib/utils/event-params";
import config from "@/payload.config";

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/scheduled-imports/[id]/trigger
 * Manually trigger a scheduled import
 */
export const POST = withAuth(async (_request: AuthenticatedRequest, context: RouteContext) => {
  try {
    const payload = await getPayload({ config });
    const user = _request.user!;
    const { id } = await context.params;

    const scheduleId = parseStrictInteger(id);
    if (scheduleId == null) {
      return badRequest("Invalid ID");
    }

    // Check existing schedule and ownership
    const existingSchedule = await payload.findByID({
      collection: "scheduled-imports",
      id: scheduleId,
      depth: 1,
    });

    if (!existingSchedule) {
      return notFound("Schedule not found");
    }

    const createdById =
      typeof existingSchedule.createdBy === "object" ? existingSchedule.createdBy?.id : existingSchedule.createdBy;
    if (user.role !== "admin" && createdById !== user.id) {
      return forbidden();
    }

    // Atomically claim the import by updating only if not already running.
    // This prevents a race condition where two concurrent trigger requests
    // could both start an import.
    const claimResult = await payload.update({
      collection: "scheduled-imports",
      where: {
        id: { equals: scheduleId },
        lastStatus: { not_equals: "running" },
      },
      data: {
        lastRun: new Date().toISOString(),
        lastStatus: "running",
      },
    });

    if (claimResult.docs.length === 0) {
      return apiError("Import is already running", 409, "CONFLICT");
    }

    // Queue the URL fetch job for manual trigger
    await payload.jobs.queue({
      task: "url-fetch",
      input: {
        scheduledImportId: String(scheduleId),
        sourceUrl: existingSchedule.sourceUrl,
        authConfig: existingSchedule.authConfig,
        originalName: existingSchedule.name,
        triggeredBy: "manual",
      },
    });

    return NextResponse.json({ success: true, message: "Import triggered" });
  } catch (error) {
    logError(error, "Error triggering scheduled import");
    return internalError();
  }
});
