/**
 * Schedule Service Management API..
 *
 * Provides endpoints to manage the schedule service for automated imports.
 * Requires admin authentication.
 *
 * @module
 */

import { z } from "zod";

import { apiRoute } from "@/lib/api";
import { createRequestLogger } from "@/lib/logger";
import { getScheduleService, startScheduleService, stopScheduleService } from "@/lib/services/schedule-service";

const logger = createRequestLogger("schedule-service-api");

/**
 * GET /api/admin/schedule-service.
 * Returns the current status of the schedule service.
 */
export const GET = apiRoute({
  auth: "admin",
  rateLimit: { type: "API_GENERAL" },
  handler: ({ payload }) => {
    const service = getScheduleService(payload);
    const status = service.getStatus();

    return Response.json({ success: true, status });
  },
});

/**
 * POST /api/admin/schedule-service/start.
 * Starts the schedule service.
 */
export const POST = apiRoute({
  auth: "admin",
  rateLimit: { type: "API_GENERAL" },
  body: z.object({ intervalMs: z.number().positive().optional(), enabled: z.boolean().optional() }),
  handler: ({ payload, body }) => {
    const serviceConfig = {
      intervalMs: body.intervalMs ?? 60000, // Default: 1 minute
      enabled: body.enabled !== false, // Default: true
    };

    const service = startScheduleService(payload, serviceConfig);
    const status = service.getStatus();

    logger.info("Schedule service started", { serviceConfig, status });

    return Response.json({ success: true, message: "Schedule service started", status });
  },
});

/**
 * DELETE /api/admin/schedule-service.
 * Stops the schedule service.
 */
export const DELETE = apiRoute({
  auth: "admin",
  rateLimit: { type: "API_GENERAL" },
  handler: () => {
    stopScheduleService();

    logger.info("Schedule service stopped");

    return Response.json({ success: true, message: "Schedule service stopped" });
  },
});
