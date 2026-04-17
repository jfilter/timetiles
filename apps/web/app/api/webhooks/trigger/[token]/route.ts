/**
 * Generic webhook trigger endpoint.
 *
 * Resolves a webhook token to either a scheduled ingest or a scraper,
 * then dispatches to the appropriate job handler. Implements dual-window
 * rate limiting and concurrency prevention.
 *
 * @module
 * @category API
 */
import { z } from "zod";

import { apiRoute, AppError } from "@/lib/api";
import { RATE_LIMITS } from "@/lib/constants/rate-limits";
import { queueWebhookImport } from "@/lib/ingest/trigger-service";
import { logger } from "@/lib/logger";
import { hashOpaqueValue } from "@/lib/security/hash";
import { getRateLimitService } from "@/lib/services/rate-limit-service";
import {
  claimScheduledIngestRunning,
  claimScraperRunning,
  resolveWebhookToken,
  type WebhookTarget,
} from "@/lib/services/webhook-registry";

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

    // Resolve token first — rate limit on resource ID, not token string
    const target = await resolveWebhookToken(payload, token);

    if (!target) {
      logger.warn({ tokenHash: hashOpaqueValue(token) }, "Webhook trigger failed - invalid or disabled token");
      throw new AppError(401, "Invalid or disabled webhook", "INVALID_WEBHOOK");
    }

    // Rate limit keyed on resource ID (survives token rotation, no memory leak for invalid tokens)
    const rateLimitService = getRateLimitService(payload);
    const rateLimitKey = `webhook:${target.type}:${target.id}`;
    const rateLimitCheck = await rateLimitService.checkConfiguredRateLimit(rateLimitKey, RATE_LIMITS.WEBHOOK_TRIGGER);

    if (!rateLimitCheck.allowed) {
      return createRateLimitResponse(rateLimitCheck);
    }

    // Dispatch based on target type
    if (target.type === "scheduled-ingest") {
      return handleScheduledIngestTrigger(payload, target);
    }

    return handleScraperTrigger(payload, target);
  },
});

/** Handle webhook trigger for a scheduled ingest. */
const handleScheduledIngestTrigger = async (
  payload: Parameters<typeof queueWebhookImport>[0],
  target: Extract<WebhookTarget, { type: "scheduled-ingest" }>
): Promise<Record<string, unknown>> => {
  // Atomically claim "running" status to prevent concurrent executions
  const claimed = await claimScheduledIngestRunning(payload, target.id);

  if (!claimed) {
    logger.info(
      { scheduledIngestId: target.id, name: target.name },
      "Webhook trigger skipped - import already running"
    );
    return { message: "Import already running, skipped", status: "skipped" };
  }

  try {
    const { jobId } = await queueWebhookImport(payload, target.record);
    return { message: "Import triggered successfully", status: "triggered", jobId: jobId.toString() };
  } catch {
    throw new AppError(500, "Failed to queue import job");
  }
};

/** Handle webhook trigger for a scraper. */
const handleScraperTrigger = async (
  payload: Parameters<typeof queueWebhookImport>[0],
  target: { id: number; name: string }
): Promise<Record<string, unknown>> => {
  // Atomically claim "running" to prevent concurrent executions
  const claimed = await claimScraperRunning(payload, target.id);

  if (!claimed) {
    logger.info({ scraperId: target.id, name: target.name }, "Webhook trigger skipped - scraper already running");
    return { message: "Scraper already running, skipped", status: "skipped" };
  }

  try {
    const job = await payload.jobs.queue({
      workflow: "scraper-ingest",
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
    throw new AppError(500, "Failed to queue scraper execution job");
  }
};

export const GET = () =>
  Response.json(
    { error: "Method not allowed. Use POST to trigger webhooks.", code: "METHOD_NOT_ALLOWED" },
    { status: 405 }
  );
