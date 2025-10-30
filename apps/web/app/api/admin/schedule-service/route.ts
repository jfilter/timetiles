/**
 * Schedule Service Management API..
 *
 * Provides endpoints to manage the schedule service for automated imports.
 * Requires admin authentication.
 *
 * @module
 */

import config from "@payload-config";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getPayload } from "payload";

import { createRequestLogger } from "@/lib/logger";
import { getScheduleService, startScheduleService, stopScheduleService } from "@/lib/services/schedule-service";

const logger = createRequestLogger("schedule-service-api");

const ERROR_STATUS = 500;

/**
 * GET /api/admin/schedule-service.
 * Returns the current status of the schedule service.
 */
export const GET = async (request: NextRequest): Promise<NextResponse> => {
  try {
    const payload = await getPayload({ config });

    // Validate JWT and check admin role
    const { user } = await payload.auth({ headers: request.headers });
    if (!user || user.role !== "admin") {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }

    const service = getScheduleService(payload);
    const status = service.getStatus();

    return NextResponse.json({
      success: true,
      status,
    });
  } catch (error) {
    logger.error("Failed to get schedule service status", { error });
    return NextResponse.json({ error: "Failed to get schedule service status" }, { status: ERROR_STATUS });
  }
};

/**
 * POST /api/admin/schedule-service/start.
 * Starts the schedule service.
 */
export const POST = async (request: NextRequest): Promise<NextResponse> => {
  try {
    const payload = await getPayload({ config });

    // Validate JWT and check admin role
    const { user } = await payload.auth({ headers: request.headers });
    if (!user || user.role !== "admin") {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }

    const body = (await request.json().catch(() => ({}) as Record<string, unknown>)) as Record<string, unknown>;
    const serviceConfig = {
      intervalMs: typeof body.intervalMs === "number" && body.intervalMs > 0 ? body.intervalMs : 60000, // Default: 1 minute
      enabled: body.enabled !== false, // Default: true
    };

    const service = startScheduleService(payload, serviceConfig);
    const status = service.getStatus();

    logger.info("Schedule service started", { serviceConfig, status });

    return NextResponse.json({
      success: true,
      message: "Schedule service started",
      status,
    });
  } catch (error) {
    logger.error("Failed to start schedule service", { error });
    return NextResponse.json({ error: "Failed to start schedule service" }, { status: ERROR_STATUS });
  }
};

/**
 * DELETE /api/admin/schedule-service.
 * Stops the schedule service.
 */
export const DELETE = async (request: NextRequest): Promise<NextResponse> => {
  try {
    const payload = await getPayload({ config });

    // Validate JWT and check admin role
    const { user } = await payload.auth({ headers: request.headers });
    if (!user || user.role !== "admin") {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }

    stopScheduleService();

    logger.info("Schedule service stopped");

    return NextResponse.json({
      success: true,
      message: "Schedule service stopped",
    });
  } catch (error) {
    logger.error("Failed to stop schedule service", { error });
    return NextResponse.json({ error: "Failed to stop schedule service" }, { status: ERROR_STATUS });
  }
};
