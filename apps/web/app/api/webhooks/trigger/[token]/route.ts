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
import { AUDIT_ACTIONS, auditLog } from "@/lib/services/audit-log-service";
import { getRateLimitService } from "@/lib/services/rate-limit-service";
import {
  claimScheduledIngestRunning,
  claimScraperRunning,
  resolveWebhookToken,
  type WebhookTarget,
} from "@/lib/services/webhook-registry";
import { extractRelationId } from "@/lib/utils/relation-id";

interface RateLimitResponse {
  success: false;
  error: string;
  message: string;
  limitType: string | undefined;
  retryAfter: string;
}

// Round reset times UP to the next 10-second boundary so the response does not
// leak exact window boundaries (would otherwise let an attacker coordinate
// bursts right at window close).
const RETRY_AFTER_BUCKET_MS = 10_000;
const bucketResetTime = (resetTime: number | undefined): number => {
  const raw = resetTime ?? Date.now();
  return Math.ceil(raw / RETRY_AFTER_BUCKET_MS) * RETRY_AFTER_BUCKET_MS;
};

const createRateLimitResponse = (rateLimitCheck: { failedWindow?: string; resetTime?: number }): Response => {
  const message =
    rateLimitCheck.failedWindow === "burst"
      ? "Too many requests. Please wait 10 seconds between webhook calls."
      : "Hourly rate limit exceeded. Maximum 5 requests per hour.";

  const bucketedReset = bucketResetTime(rateLimitCheck.resetTime);

  const body: RateLimitResponse = {
    success: false,
    error: "Rate limit exceeded",
    message,
    limitType: rateLimitCheck.failedWindow,
    retryAfter: new Date(bucketedReset).toISOString(),
  };

  return Response.json(body, {
    status: 429,
    headers: { "Retry-After": Math.ceil((bucketedReset - Date.now()) / 1000).toString() },
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

    // Audit the trigger against the resource's creator/owner. Webhooks are
    // unauthenticated, but every scheduled ingest and scraper has an owning
    // user — attribute to them so an admin review can spot unexpected
    // activity on a specific resource.
    await recordWebhookAudit(payload, target);

    // Dispatch based on target type
    if (target.type === "scheduled-ingest") {
      return handleScheduledIngestTrigger(payload, target);
    }

    return handleScraperTrigger(payload, target);
  },
});

/**
 * Record an audit entry attributing a webhook trigger to its resource owner.
 * Non-throwing: auditLog already swallows its own errors, so a failure here
 * can never block the trigger itself.
 */
const recordWebhookAudit = async (
  payload: Parameters<typeof queueWebhookImport>[0],
  target: WebhookTarget
): Promise<void> => {
  const creator = target.type === "scheduled-ingest" ? target.record.createdBy : target.record.repoCreatedBy;
  const ownerId = extractRelationId(creator);
  if (ownerId == null) return;

  const creatorObject = typeof creator === "object" && creator !== null ? (creator as { email?: unknown }) : null;
  const ownerEmail = typeof creatorObject?.email === "string" ? creatorObject.email : "unknown";

  await auditLog(payload, {
    action: AUDIT_ACTIONS.WEBHOOK_TRIGGERED,
    userId: typeof ownerId === "number" ? ownerId : Number(ownerId),
    userEmail: ownerEmail,
    details: { targetType: target.type, targetId: target.id, targetName: target.name },
  });
};

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
