/**
 * API endpoint for checking user quotas and usage.
 *
 * GET /api/quotas - Returns current user's quota status
 *
 * @module
 */

import { apiRoute } from "@/lib/api";
import { createQuotaService } from "@/lib/services/quota-service";

/**
 * Get current user's quota status.
 *
 * Returns comprehensive quota information including:
 * - Current usage for all quota types
 * - Limits based on trust level
 * - Remaining allowances
 * - Reset times for daily quotas
 */
export const GET = apiRoute({
  auth: "required",
  rateLimit: { type: "API_GENERAL" },
  handler: async ({ user, payload }) => {
    const quotaService = createQuotaService(payload);

    // Per-request cache: all 6 checks share one DB lookup for usage record
    const cache = { context: {} as Record<string, unknown> };

    // Get all quota statuses in parallel
    const [fileUploads, urlFetches, importJobs, activeSchedules, totalEvents, eventsPerImport] = await Promise.all([
      quotaService.checkQuota(user, "FILE_UPLOADS_PER_DAY", 1, cache),
      quotaService.checkQuota(user, "URL_FETCHES_PER_DAY", 1, cache),
      quotaService.checkQuota(user, "IMPORT_JOBS_PER_DAY", 1, cache),
      quotaService.checkQuota(user, "ACTIVE_SCHEDULES", 1, cache),
      quotaService.checkQuota(user, "TOTAL_EVENTS", 1, cache),
      quotaService.checkQuota(user, "EVENTS_PER_IMPORT", 1, cache),
    ]);

    // Get effective quotas for additional info
    const effectiveQuotas = quotaService.getEffectiveQuotas(user);

    // Helper to normalize quotas - cap very high limits to prevent admin identification
    // Security: Admins have unlimited/very high quotas, which makes them identifiable
    // By capping displayed limits, we prevent enumeration of privileged accounts
    const MAX_DISPLAYED_LIMIT = 10000; // Cap shown to normal users
    const normalizeLimit = (limit: number | null): number => {
      if (limit === null || limit > MAX_DISPLAYED_LIMIT) {
        return MAX_DISPLAYED_LIMIT;
      }
      return limit;
    };

    // Return only necessary information - don't expose role, trustLevel, or system architecture details
    const response = {
      quotas: {
        fileUploadsPerDay: {
          used: fileUploads.current,
          limit: normalizeLimit(fileUploads.limit),
          remaining: fileUploads.remaining,
        },
        urlFetchesPerDay: {
          used: urlFetches.current,
          limit: normalizeLimit(urlFetches.limit),
          remaining: urlFetches.remaining,
        },
        importJobsPerDay: {
          used: importJobs.current,
          limit: normalizeLimit(importJobs.limit),
          remaining: importJobs.remaining,
        },
        activeSchedules: {
          used: activeSchedules.current,
          limit: normalizeLimit(activeSchedules.limit),
          remaining: activeSchedules.remaining,
        },
        totalEvents: {
          used: totalEvents.current,
          limit: normalizeLimit(totalEvents.limit),
          remaining: totalEvents.remaining,
        },
        eventsPerImport: {
          used: eventsPerImport.current,
          limit: normalizeLimit(eventsPerImport.limit),
          remaining: eventsPerImport.remaining,
        },
        maxFileSizeMB: {
          limit: Math.min(effectiveQuotas.maxFileSizeMB, 100), // Cap at 100MB displayed
        },
      },
    };

    // Add quota headers
    const headers = await quotaService.getQuotaHeaders(user);

    return Response.json(response, { status: 200, headers });
  },
});
