/**
 * API endpoint for checking user quotas and usage.
 *
 * GET /api/quotas - Returns current user's quota status
 *
 * @module
 */

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getPayload } from "payload";

import { QUOTA_TYPES } from "@/lib/constants/permission-constants";
import { createLogger } from "@/lib/logger";
import { getPermissionService } from "@/lib/services/permission-service";
import configPromise from "@/payload.config";

const logger = createLogger("api-quotas");

/**
 * Get current user's quota status.
 *
 * Returns comprehensive quota information including:
 * - Current usage for all quota types
 * - Limits based on trust level
 * - Remaining allowances
 * - Reset times for daily quotas
 */
export const GET = async (req: NextRequest) => {
  try {
    const payload = await getPayload({ config: configPromise });

    // Get user from session
    const { user } = await payload.auth({ headers: req.headers });

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const permissionService = getPermissionService(payload);

    // Get all quota statuses in parallel
    const [fileUploads, urlFetches, importJobs, activeSchedules, totalEvents, eventsPerImport] = await Promise.all([
      permissionService.checkQuota(user, QUOTA_TYPES.FILE_UPLOADS_PER_DAY),
      permissionService.checkQuota(user, QUOTA_TYPES.URL_FETCHES_PER_DAY),
      permissionService.checkQuota(user, QUOTA_TYPES.IMPORT_JOBS_PER_DAY),
      permissionService.checkQuota(user, QUOTA_TYPES.ACTIVE_SCHEDULES),
      permissionService.checkQuota(user, QUOTA_TYPES.TOTAL_EVENTS),
      permissionService.checkQuota(user, QUOTA_TYPES.EVENTS_PER_IMPORT),
    ]);

    // Get effective quotas for additional info
    const effectiveQuotas = permissionService.getEffectiveQuotas(user);

    const response = {
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        trustLevel: user.trustLevel,
      },
      quotas: {
        fileUploadsPerDay: {
          ...fileUploads,
          description: "Maximum file uploads allowed per day",
        },
        urlFetchesPerDay: {
          ...urlFetches,
          description: "Maximum URL fetches allowed per day",
        },
        importJobsPerDay: {
          ...importJobs,
          description: "Maximum import jobs allowed per day",
        },
        activeSchedules: {
          ...activeSchedules,
          description: "Maximum active scheduled imports",
        },
        totalEvents: {
          ...totalEvents,
          description: "Maximum total events across all time",
        },
        eventsPerImport: {
          ...eventsPerImport,
          description: "Maximum events per single import",
        },
        maxFileSizeMB: {
          limit: effectiveQuotas.maxFileSizeMB,
          description: "Maximum file size in megabytes",
        },
      },
      summary: {
        hasUnlimitedAccess: user.role === "admin" || user.trustLevel === "5",
        nextResetTime: fileUploads.resetTime,
      },
    };

    // Add quota headers
    const headers = await permissionService.getQuotaHeaders(user);

    return NextResponse.json(response, {
      status: 200,
      headers,
    });
  } catch (error) {
    logger.error("Failed to get quota status", { error });
    return NextResponse.json({ error: "Failed to retrieve quota information" }, { status: 500 });
  }
};
