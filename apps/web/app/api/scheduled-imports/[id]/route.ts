/**
 * API route for managing individual scheduled imports.
 *
 * Supports GET, PATCH, and DELETE operations for schedule management.
 *
 * @module
 * @category API
 */
import { NextResponse } from "next/server";
import { getPayload } from "payload";

import { logError } from "@/lib/logger";
import { type AuthenticatedRequest, withAuth } from "@/lib/middleware/auth";
import { badRequest, forbidden, internalError, notFound } from "@/lib/utils/api-response";
import config from "@/payload.config";

const COLLECTION_SCHEDULED_IMPORTS = "scheduled-imports";

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/scheduled-imports/[id]
 * Retrieve a single scheduled import by ID
 */
export const GET = withAuth(async (_request: AuthenticatedRequest, context: RouteContext) => {
  try {
    const payload = await getPayload({ config });
    const user = _request.user!;
    const { id } = await context.params;

    const scheduleId = parseInt(id, 10);
    if (isNaN(scheduleId)) {
      return badRequest("Invalid ID");
    }

    const schedule = await payload.findByID({
      collection: COLLECTION_SCHEDULED_IMPORTS,
      id: scheduleId,
      depth: 1,
    });

    if (!schedule) {
      return notFound("Schedule not found");
    }

    // Check ownership
    const createdById = typeof schedule.createdBy === "object" ? schedule.createdBy?.id : schedule.createdBy;
    if (user.role !== "admin" && createdById !== user.id) {
      return forbidden();
    }

    return NextResponse.json(schedule);
  } catch (error) {
    logError(error, "Error fetching scheduled import");
    return internalError();
  }
});

/**
 * PATCH /api/scheduled-imports/[id]
 * Update a scheduled import (e.g., enable/disable)
 */
export const PATCH = withAuth(async (request: AuthenticatedRequest, context: RouteContext) => {
  try {
    const payload = await getPayload({ config });
    const user = request.user!;
    const { id } = await context.params;

    const scheduleId = parseInt(id, 10);
    if (isNaN(scheduleId)) {
      return badRequest("Invalid ID");
    }

    // Check existing schedule and ownership
    const existingSchedule = await payload.findByID({
      collection: COLLECTION_SCHEDULED_IMPORTS,
      id: scheduleId,
    });

    if (!existingSchedule) {
      return notFound("Schedule not found");
    }

    const createdById =
      typeof existingSchedule.createdBy === "object" ? existingSchedule.createdBy?.id : existingSchedule.createdBy;
    if (user.role !== "admin" && createdById !== user.id) {
      return forbidden();
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
    return internalError();
  }
});

/**
 * DELETE /api/scheduled-imports/[id]
 * Delete a scheduled import
 */
export const DELETE = withAuth(async (_request: AuthenticatedRequest, context: RouteContext) => {
  try {
    const payload = await getPayload({ config });
    const user = _request.user!;
    const { id } = await context.params;

    const scheduleId = parseInt(id, 10);
    if (isNaN(scheduleId)) {
      return badRequest("Invalid ID");
    }

    // Check existing schedule and ownership
    const existingSchedule = await payload.findByID({
      collection: COLLECTION_SCHEDULED_IMPORTS,
      id: scheduleId,
    });

    if (!existingSchedule) {
      return notFound("Schedule not found");
    }

    const createdById =
      typeof existingSchedule.createdBy === "object" ? existingSchedule.createdBy?.id : existingSchedule.createdBy;
    if (user.role !== "admin" && createdById !== user.id) {
      return forbidden();
    }

    // Delete the schedule
    await payload.delete({
      collection: COLLECTION_SCHEDULED_IMPORTS,
      id: scheduleId,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    logError(error, "Error deleting scheduled import");
    return internalError();
  }
});
