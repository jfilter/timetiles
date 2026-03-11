/**
 * Schedule Service Management API.
 *
 * Provides endpoints to check scheduling status and manually trigger
 * the schedule manager job. Requires admin authentication.
 *
 * @module
 */

import { apiRoute } from "@/lib/api";
import { createRequestLogger } from "@/lib/logger";

const logger = createRequestLogger("schedule-service-api");

/**
 * GET /api/admin/schedule-service.
 * Returns the current scheduling status (native cron + feature flag).
 */
export const GET = apiRoute({
  auth: "admin",
  rateLimit: { type: "API_GENERAL" },
  handler: async ({ payload }) => {
    const { isFeatureEnabled } = await import("@/lib/services/feature-flag-service");
    const enabled = await isFeatureEnabled(payload, "enableScheduledJobExecution");

    const recentJobs = await payload.find({
      collection: "payload-jobs",
      where: { taskSlug: { equals: "schedule-manager" } },
      limit: 1,
      sort: "-createdAt",
    });

    return Response.json({
      success: true,
      status: {
        schedulingMethod: "payload-native-cron",
        cron: "* * * * *",
        featureFlagEnabled: enabled,
        lastJobCreatedAt: recentJobs.docs[0]?.createdAt ?? null,
      },
    });
  },
});

/**
 * POST /api/admin/schedule-service.
 * Manually triggers a one-off schedule manager job.
 */
export const POST = apiRoute({
  auth: "admin",
  rateLimit: { type: "API_GENERAL" },
  handler: async ({ payload }) => {
    const job = await payload.jobs.queue({ task: "schedule-manager", input: {} });

    logger.info({ jobId: job.id }, "Schedule manager job manually queued");

    return Response.json({ success: true, message: "Schedule manager job queued", jobId: job.id });
  },
});
