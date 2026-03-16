/**
 * Generic webhook trigger endpoint.
 *
 * Resolves a webhook token to either a scheduled import or a scraper,
 * then dispatches to the appropriate job handler. Implements dual-window
 * rate limiting and concurrency prevention.
 *
 * @module
 * @category API
 */
import { sql } from "@payloadcms/db-postgres";
import { z } from "zod";

import { apiRoute } from "@/lib/api";
import { RATE_LIMITS } from "@/lib/constants/rate-limits";
import { logger } from "@/lib/logger";
import { getRateLimitService } from "@/lib/services/rate-limit-service";
import { queueWebhookImport } from "@/lib/services/scheduled-import-trigger-service";
import { claimScraperRunning, resolveWebhookToken } from "@/lib/services/webhook-registry";
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

  return Response.json(body, {
    status: 429,
    headers: { "Retry-After": Math.ceil(((rateLimitCheck.resetTime ?? Date.now()) - Date.now()) / 1000).toString() },
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

    // Resolve token to a target (scheduled-import or scraper)
    const target = await resolveWebhookToken(payload, token);

    if (!target) {
      logger.warn({ token: token.substring(0, 8) + "..." }, "Webhook trigger failed - invalid or disabled token");
      return unauthorized("Invalid or disabled webhook", "INVALID_WEBHOOK");
    }

    // Dispatch based on target type
    if (target.type === "scheduled-import") {
      return handleScheduledImportTrigger(payload, target);
    }

    return handleScraperTrigger(payload, target);
  },
});

/** Handle webhook trigger for a scheduled import. */
const handleScheduledImportTrigger = async (
  payload: Parameters<typeof queueWebhookImport>[0],
  target: { id: number; name: string; record: Record<string, unknown> }
): Promise<Response | Record<string, unknown>> => {
  // Atomically claim "running" status to prevent concurrent executions
  const claimResult = (await payload.db.drizzle.execute(sql`
    UPDATE payload.scheduled_imports
    SET last_status = 'running'
    WHERE id = ${target.id}
      AND (last_status IS NULL OR last_status != 'running')
    RETURNING id
  `)) as { rows: Array<{ id: number }> };

  if (claimResult.rows.length === 0) {
    logger.info(
      { scheduledImportId: target.id, name: target.name },
      "Webhook trigger skipped - import already running"
    );
    return { message: "Import already running, skipped", status: "skipped" };
  }

  try {
    const { jobId } = await queueWebhookImport(payload, target.record as unknown as ScheduledImport);
    return { message: "Import triggered successfully", status: "triggered", jobId: jobId.toString() };
  } catch {
    return internalError("Failed to queue import job");
  }
};

/** Handle webhook trigger for a scraper. */
const handleScraperTrigger = async (
  payload: Parameters<typeof queueWebhookImport>[0],
  target: { id: number; name: string }
): Promise<Response | Record<string, unknown>> => {
  // Atomically claim "running" to prevent concurrent executions
  const claimed = await claimScraperRunning(payload, target.id);

  if (!claimed) {
    logger.info({ scraperId: target.id, name: target.name }, "Webhook trigger skipped - scraper already running");
    return { message: "Scraper already running, skipped", status: "skipped" };
  }

  try {
    const job = await payload.jobs.queue({
      task: "scraper-execution",
      input: { scraperId: target.id, triggeredBy: "webhook" },
    });
    logger.info({ scraperId: target.id, jobId: job.id }, "Scraper triggered via webhook");
    return { message: "Scraper triggered successfully", status: "triggered", jobId: String(job.id) };
  } catch {
    // Reset status so scraper isn't permanently stuck as "running"
    try {
      await payload.update({
        collection: "scrapers",
        id: target.id,
        data: { lastRunStatus: null },
        overrideAccess: true,
      });
    } catch {
      logger.error({ scraperId: target.id }, "Failed to reset scraper status after queue failure");
    }
    return internalError("Failed to queue scraper execution job");
  }
};

export const GET = () => methodNotAllowed("Method not allowed. Use POST to trigger webhooks.");
