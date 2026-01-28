/**
 * API route for managing individual scheduled imports.
 *
 * Supports GET, PATCH, and DELETE operations for schedule management.
 *
 * @module
 * @category API
 */
import { headers as nextHeaders } from "next/headers";
import { NextResponse } from "next/server";
import { getPayload } from "payload";

import { logError } from "@/lib/logger";
import config from "@/payload.config";

const COLLECTION_SCHEDULED_IMPORTS = "scheduled-imports";

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/scheduled-imports/[id]
 * Retrieve a single scheduled import by ID
 */
export const GET = async (_request: Request, context: RouteContext) => {
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

    const schedule = await payload.findByID({
      collection: COLLECTION_SCHEDULED_IMPORTS,
      id: scheduleId,
      depth: 1,
    });

    if (!schedule) {
      return NextResponse.json({ error: "Schedule not found" }, { status: 404 });
    }

    // Check ownership
    const createdById = typeof schedule.createdBy === "object" ? schedule.createdBy?.id : schedule.createdBy;
    if (user.role !== "admin" && createdById !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    return NextResponse.json(schedule);
  } catch (error) {
    logError(error, "Error fetching scheduled import");
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
};

/**
 * PATCH /api/scheduled-imports/[id]
 * Update a scheduled import (e.g., enable/disable)
 */
export const PATCH = async (request: Request, context: RouteContext) => {
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
      collection: COLLECTION_SCHEDULED_IMPORTS,
      id: scheduleId,
    });

    if (!existingSchedule) {
      return NextResponse.json({ error: "Schedule not found" }, { status: 404 });
    }

    const createdById =
      typeof existingSchedule.createdBy === "object" ? existingSchedule.createdBy?.id : existingSchedule.createdBy;
    if (user.role !== "admin" && createdById !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Parse request body
    const body = (await request.json()) as { enabled?: boolean };

    // Update the schedule
    const updatedSchedule = await payload.update({
      collection: COLLECTION_SCHEDULED_IMPORTS,
      id: scheduleId,
      data: {
        enabled: body.enabled,
      },
    });

    return NextResponse.json({ doc: updatedSchedule });
  } catch (error) {
    logError(error, "Error updating scheduled import");
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
};

/**
 * DELETE /api/scheduled-imports/[id]
 * Delete a scheduled import
 */
export const DELETE = async (_request: Request, context: RouteContext) => {
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
      collection: COLLECTION_SCHEDULED_IMPORTS,
      id: scheduleId,
    });

    if (!existingSchedule) {
      return NextResponse.json({ error: "Schedule not found" }, { status: 404 });
    }

    const createdById =
      typeof existingSchedule.createdBy === "object" ? existingSchedule.createdBy?.id : existingSchedule.createdBy;
    if (user.role !== "admin" && createdById !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Delete the schedule
    await payload.delete({
      collection: COLLECTION_SCHEDULED_IMPORTS,
      id: scheduleId,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    logError(error, "Error deleting scheduled import");
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
};
