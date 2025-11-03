/**
 * Webhook trigger endpoint for scheduled imports.
 *
 * Allows external systems to trigger scheduled imports via POST request.
 * Implements dual-window rate limiting and concurrency prevention.
 *
 * @module
 * @category API
 */

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import type { Payload } from "payload";
import { getPayload } from "payload";

import { JOB_TYPES } from "@/lib/constants/import-constants";
import { logError, logger } from "@/lib/logger";
import { getRateLimitService, RATE_LIMITS } from "@/lib/services/rate-limit-service";
import { internalError, methodNotAllowed, unauthorized } from "@/lib/utils/api-response";
import config from "@/payload.config";
import type { ScheduledImport } from "@/payload-types";

interface RateLimitResponse {
  success: false;
  error: string;
  message: string;
  limitType: string | undefined;
  retryAfter: string;
}

const createRateLimitResponse = (rateLimitCheck: {
  failedWindow?: string;
  resetTime?: number;
}): NextResponse<RateLimitResponse> => {
  const message =
    rateLimitCheck.failedWindow === "burst"
      ? "Too many requests. Please wait 10 seconds between webhook calls."
      : "Hourly rate limit exceeded. Maximum 5 requests per hour.";

  return NextResponse.json(
    {
      success: false,
      error: "Rate limit exceeded",
      message,
      limitType: rateLimitCheck.failedWindow,
      retryAfter: new Date(rateLimitCheck.resetTime ?? Date.now()).toISOString(),
    },
    {
      status: 429,
      headers: {
        "Retry-After": Math.ceil(((rateLimitCheck.resetTime ?? Date.now()) - Date.now()) / 1000).toString(),
      },
    }
  );
};

const generateImportName = (scheduledImport: ScheduledImport, currentTime: Date): string => {
  const importName = scheduledImport.importNameTemplate ?? "{{name}} - {{date}}";
  return importName
    .replace("{{name}}", scheduledImport.name)
    .replace("{{date}}", currentTime.toISOString().split("T")[0] ?? "")
    .replace("{{time}}", currentTime.toTimeString().split(" ")[0] ?? "")
    .replace("{{url}}", new URL(scheduledImport.sourceUrl).hostname);
};

const updateExecutionHistory = async (
  payload: Payload,
  scheduledImport: ScheduledImport,
  currentTime: Date,
  jobId: string
): Promise<void> => {
  const executionHistory = scheduledImport.executionHistory ?? [];
  executionHistory.unshift({
    executedAt: currentTime.toISOString(),
    status: "success",
    jobId: jobId,
    triggeredBy: "webhook",
  });

  if (executionHistory.length > 10) {
    executionHistory.splice(10);
  }

  const stats = scheduledImport.statistics ?? {
    totalRuns: 0,
    successfulRuns: 0,
    failedRuns: 0,
    averageDuration: 0,
  };
  stats.totalRuns = (stats.totalRuns ?? 0) + 1;

  await payload.update({
    collection: "scheduled-imports",
    id: scheduledImport.id,
    data: {
      executionHistory,
      statistics: stats,
    },
  });
};

export const POST = async (_request: NextRequest, { params }: { params: Promise<{ token: string }> }) => {
  const { token } = await params;

  try {
    const payload = await getPayload({ config });
    const rateLimitService = getRateLimitService(payload);

    // Check dual-window rate limits
    const rateLimitCheck = rateLimitService.checkConfiguredRateLimit(`webhook:${token}`, RATE_LIMITS.WEBHOOK_TRIGGER);

    if (!rateLimitCheck.allowed) {
      return createRateLimitResponse(rateLimitCheck);
    }

    // Find scheduled import by token
    const scheduledImports = await payload.find({
      collection: "scheduled-imports",
      where: {
        webhookToken: { equals: token },
      },
      limit: 1,
    });

    // Security: Return same error message for invalid token and disabled webhook
    // to prevent token enumeration attacks
    if (scheduledImports.docs.length === 0) {
      logger.warn("Webhook trigger failed - invalid token", {
        token: token.substring(0, 8) + "...",
      });
      return unauthorized("Invalid or disabled webhook", "INVALID_WEBHOOK");
    }

    const scheduledImport = scheduledImports.docs[0] as ScheduledImport;

    if (!scheduledImport.webhookEnabled) {
      logger.warn("Webhook trigger failed - webhook disabled", {
        scheduledImportId: scheduledImport.id,
        name: scheduledImport.name,
      });
      return unauthorized("Invalid or disabled webhook", "INVALID_WEBHOOK");
    }

    // CRITICAL: Check if already running (prevents concurrent executions)
    if (scheduledImport.lastStatus === "running") {
      logger.info("Webhook trigger skipped - import already running", {
        scheduledImportId: scheduledImport.id,
        name: scheduledImport.name,
      });
      return NextResponse.json(
        {
          success: true,
          message: "Import already running, skipped",
          status: "skipped",
        },
        { status: 200 }
      );
    }

    const currentTime = new Date();

    // Generate import name
    const importName = generateImportName(scheduledImport, currentTime);

    // CRITICAL: Set status to "running" BEFORE queuing job
    await payload.update({
      collection: "scheduled-imports",
      id: scheduledImport.id,
      data: {
        lastStatus: "running",
        lastRun: currentTime.toISOString(),
      },
    });

    // Queue URL fetch job
    const urlFetchJob = await payload.jobs.queue({
      task: JOB_TYPES.URL_FETCH,
      input: {
        scheduledImportId: scheduledImport.id,
        sourceUrl: scheduledImport.sourceUrl,
        authConfig: scheduledImport.authConfig,
        catalogId: typeof scheduledImport.catalog === "object" ? scheduledImport.catalog.id : scheduledImport.catalog,
        originalName: importName,
        userId:
          scheduledImport.createdBy && typeof scheduledImport.createdBy === "object"
            ? scheduledImport.createdBy.id
            : scheduledImport.createdBy,
        triggeredBy: "webhook",
      },
    });

    // Update execution history and statistics
    await updateExecutionHistory(payload, scheduledImport, currentTime, urlFetchJob.id.toString());

    logger.info("Webhook triggered import successfully", {
      scheduledImportId: scheduledImport.id,
      name: scheduledImport.name,
      jobId: urlFetchJob.id,
      triggeredBy: "webhook",
    });

    return NextResponse.json(
      {
        success: true,
        message: "Import triggered successfully",
        status: "triggered",
        jobId: urlFetchJob.id.toString(),
      },
      { status: 200 }
    );
  } catch (error) {
    logError(error, "Webhook trigger failed", {
      token: token.substring(0, 8) + "...",
    });
    return internalError("Internal server error");
  }
};

export const GET = () => methodNotAllowed("Method not allowed. Use POST to trigger imports.");
