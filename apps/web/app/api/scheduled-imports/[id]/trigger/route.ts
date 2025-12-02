/**
 * API route for manually triggering a scheduled import.
 *
 * @module
 * @category API
 */
import { headers as nextHeaders } from "next/headers";
import { NextResponse } from "next/server";
import { getPayload } from "payload";

import { logError } from "@/lib/logger";
import config from "@/payload.config";

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/scheduled-imports/[id]/trigger
 * Manually trigger a scheduled import
 */
export const POST = async (_request: Request, context: RouteContext) => {
  try {
    const payload = await getPayload({ config });
    const headers = await nextHeaders();
    const { id } = await context.params;

    const { user } = await payload.auth({ headers });
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const scheduleId = parseInt(id, 10);
    if (isNaN(scheduleId)) {
      return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
    }

    // Check existing schedule and ownership
    const existingSchedule = await payload.findByID({
      collection: "scheduled-imports",
      id: scheduleId,
      depth: 1,
    });

    if (!existingSchedule) {
      return NextResponse.json({ error: "Schedule not found" }, { status: 404 });
    }

    const createdById =
      typeof existingSchedule.createdBy === "object" ? existingSchedule.createdBy?.id : existingSchedule.createdBy;
    if (user.role !== "admin" && createdById !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
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

    // Update the schedule with lastRun timestamp
    await payload.update({
      collection: "scheduled-imports",
      id: scheduleId,
      data: {
        lastRun: new Date().toISOString(),
        lastStatus: "running",
      },
    });

    return NextResponse.json({ success: true, message: "Import triggered" });
  } catch (error) {
    logError(error, "Error triggering scheduled import");
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
};
