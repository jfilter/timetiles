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
import { AUDIT_ACTIONS, auditLog } from "@/lib/services/audit-log-service";

const logger = createRequestLogger("schedule-service-api");

/**
 * GET /api/admin/schedule-service.
 * Returns the current scheduling status (native cron + feature flag).
 */
export const GET = apiRoute({
  auth: "admin",
  rateLimit: { type: "API_GENERAL" },
  handler: async ({ payload }) => {
    const { getFeatureFlagService } = await import("@/lib/services/feature-flag-service");
    const enabled = await getFeatureFlagService(payload).isEnabled("enableScheduledJobExecution");

    const recentJobs = await payload.find({
      collection: "payload-jobs",
      where: { taskSlug: { equals: "schedule-manager" } },
      limit: 1,
      sort: "-createdAt",
    });

    return {
      status: {
        schedulingMethod: "payload-native-cron",
        cron: "* * * * *",
        featureFlagEnabled: enabled,
        lastJobCreatedAt: recentJobs.docs[0]?.createdAt ?? null,
      },
    };
  },
});

/**
 * POST /api/admin/schedule-service.
 * Manually triggers a one-off schedule manager job.
 */
export const POST = apiRoute({
  auth: "admin",
  rateLimit: { type: "API_GENERAL" },
  handler: async ({ payload, user }) => {
    const job = await payload.jobs.queue({ task: "schedule-manager", input: {} });

    logger.info({ jobId: job.id, adminUserId: user.id }, "Schedule manager job manually queued");

    await auditLog(payload, {
      action: AUDIT_ACTIONS.SCHEDULE_MANAGER_TRIGGERED,
      userId: user.id,
      userEmail: user.email,
      performedBy: user.id,
      details: { jobId: String(job.id) },
    });

    return { message: "Schedule manager job queued", jobId: job.id };
  },
});
