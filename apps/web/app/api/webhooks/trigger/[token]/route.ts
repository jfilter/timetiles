/**
 * Webhook trigger endpoint for scheduled imports.
 *
 * Allows external systems to trigger scheduled imports via POST request.
 * Implements dual-window rate limiting and concurrency prevention.
 *
 * @module
 * @category API
 */
import { z } from "zod";

import { apiRoute } from "@/lib/api";
import { logger } from "@/lib/logger";
import { getRateLimitService, RATE_LIMITS } from "@/lib/services/rate-limit-service";
import { queueWebhookImport } from "@/lib/services/scheduled-import-trigger-service";
import { internalError, methodNotAllowed, unauthorized } from "@/lib/utils/api-response";
import type { ScheduledImport } from "@/payload-types";

interface RateLimitResponse {
  success: false;
  error: string;
  message: string;
  limitType: string | undefined;
  retryAfter: string;
}

const createRateLimitResponse = (rateLimitCheck: { failedWindow?: string; resetTime?: number }): Response => {
  const message =
    rateLimitCheck.failedWindow === "burst"
      ? "Too many requests. Please wait 10 seconds between webhook calls."
      : "Hourly rate limit exceeded. Maximum 5 requests per hour.";

  const body: RateLimitResponse = {
    success: false,
    error: "Rate limit exceeded",
    message,
    limitType: rateLimitCheck.failedWindow,
    retryAfter: new Date(rateLimitCheck.resetTime ?? Date.now()).toISOString(),
  };

  return new Response(JSON.stringify(body), {
    status: 429,
    headers: {
      "Content-Type": "application/json",
      "Retry-After": Math.ceil(((rateLimitCheck.resetTime ?? Date.now()) - Date.now()) / 1000).toString(),
    },
  });
};

export const POST = apiRoute({
  auth: "none",
  params: z.object({ token: z.string() }),
  handler: async ({ params, payload }) => {
    const { token } = params;
    const rateLimitService = getRateLimitService(payload);

    // Check dual-window rate limits
    const rateLimitCheck = rateLimitService.checkConfiguredRateLimit(`webhook:${token}`, RATE_LIMITS.WEBHOOK_TRIGGER);

    if (!rateLimitCheck.allowed) {
      return createRateLimitResponse(rateLimitCheck);
    }

    // Find scheduled import by token
    const scheduledImports = await payload.find({
      collection: "scheduled-imports",
      where: { webhookToken: { equals: token } },
      limit: 1,
    });

    // Security: Return same error message for invalid token and disabled webhook
    // to prevent token enumeration attacks
    if (scheduledImports.docs.length === 0) {
      logger.warn({ token: token.substring(0, 8) + "..." }, "Webhook trigger failed - invalid token");
      return unauthorized("Invalid or disabled webhook", "INVALID_WEBHOOK");
    }

    const scheduledImport = scheduledImports.docs[0] as ScheduledImport;

    if (!scheduledImport.webhookEnabled) {
      logger.warn(
        { scheduledImportId: scheduledImport.id, name: scheduledImport.name },
        "Webhook trigger failed - webhook disabled"
      );
      return unauthorized("Invalid or disabled webhook", "INVALID_WEBHOOK");
    }

    // CRITICAL: Check if already running (prevents concurrent executions)
    if (scheduledImport.lastStatus === "running") {
      logger.info(
        { scheduledImportId: scheduledImport.id, name: scheduledImport.name },
        "Webhook trigger skipped - import already running"
      );
      return Response.json(
        { success: true, message: "Import already running, skipped", status: "skipped" },
        { status: 200 }
      );
    }

    try {
      const { jobId } = await queueWebhookImport(payload, scheduledImport);
      return Response.json(
        { success: true, message: "Import triggered successfully", status: "triggered", jobId: jobId.toString() },
        { status: 200 }
      );
    } catch {
      return internalError("Failed to queue import job");
    }
  },
});

export const GET = () => methodNotAllowed("Method not allowed. Use POST to trigger imports.");
