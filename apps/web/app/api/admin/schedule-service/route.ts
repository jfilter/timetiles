/**
 * Schedule Service Management API..
 *
 * Provides endpoints to manage the schedule service for automated imports.
 * Requires admin authentication.
 *
 * @module
 */

import { NextResponse } from "next/server";
import { getPayload } from "payload";

import { createRequestLogger } from "@/lib/logger";
import { type AuthenticatedRequest, withAdminAuth } from "@/lib/middleware/auth";
import { withRateLimit } from "@/lib/middleware/rate-limit";
import { getScheduleService, startScheduleService, stopScheduleService } from "@/lib/services/schedule-service";
import { internalError } from "@/lib/utils/api-response";
import config from "@/payload.config";

const logger = createRequestLogger("schedule-service-api");

/**
 * GET /api/admin/schedule-service.
 * Returns the current status of the schedule service.
 */
export const GET = withRateLimit(
  withAdminAuth(async (_request: AuthenticatedRequest, _context: unknown): Promise<NextResponse> => {
    try {
      const payload = await getPayload({ config });
      const service = getScheduleService(payload);
      const status = service.getStatus();

      return NextResponse.json({
        success: true,
        status,
      });
    } catch (error) {
      logger.error("Failed to get schedule service status", { error });
      return internalError("Failed to get schedule service status");
    }
  }),
  { type: "API_GENERAL" }
);

/**
 * POST /api/admin/schedule-service/start.
 * Starts the schedule service.
 */
export const POST = withRateLimit(
  withAdminAuth(async (request: AuthenticatedRequest, _context: unknown): Promise<NextResponse> => {
    try {
      const payload = await getPayload({ config });

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
      return internalError("Failed to start schedule service");
    }
  }),
  { type: "API_GENERAL" }
);

/**
 * DELETE /api/admin/schedule-service.
 * Stops the schedule service.
 */
export const DELETE = withRateLimit(
  withAdminAuth(async (_request: AuthenticatedRequest, _context: unknown): Promise<NextResponse> => {
    try {
      stopScheduleService();

      logger.info("Schedule service stopped");

      return NextResponse.json({
        success: true,
        message: "Schedule service stopped",
      });
    } catch (error) {
      logger.error("Failed to stop schedule service", { error });
      return internalError("Failed to stop schedule service");
    }
  }),
  { type: "API_GENERAL" }
);
