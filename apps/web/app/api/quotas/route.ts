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

import { QUOTA_TYPES } from "@/lib/constants/quota-constants";
import { createLogger } from "@/lib/logger";
import { withRateLimit } from "@/lib/middleware/rate-limit";
import { getQuotaService } from "@/lib/services/quota-service";
import { internalError, unauthorized } from "@/lib/utils/api-response";
import config from "@/payload.config";

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
export const GET = withRateLimit(
  async (req: NextRequest, _context: unknown) => {
    try {
      const payload = await getPayload({ config });

      // Get user from session
      const { user } = await payload.auth({ headers: req.headers });

      if (!user) {
        return unauthorized();
      }

      const quotaService = getQuotaService(payload);

      // Get all quota statuses in parallel
      const [fileUploads, urlFetches, importJobs, activeSchedules, totalEvents, eventsPerImport] = await Promise.all([
        quotaService.checkQuota(user, QUOTA_TYPES.FILE_UPLOADS_PER_DAY),
        quotaService.checkQuota(user, QUOTA_TYPES.URL_FETCHES_PER_DAY),
        quotaService.checkQuota(user, QUOTA_TYPES.IMPORT_JOBS_PER_DAY),
        quotaService.checkQuota(user, QUOTA_TYPES.ACTIVE_SCHEDULES),
        quotaService.checkQuota(user, QUOTA_TYPES.TOTAL_EVENTS),
        quotaService.checkQuota(user, QUOTA_TYPES.EVENTS_PER_IMPORT),
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

      return NextResponse.json(response, {
        status: 200,
        headers,
      });
    } catch (error) {
      logger.error("Failed to get quota status", { error });
      return internalError("Failed to retrieve quota information");
    }
  },
  { type: "API_GENERAL" }
);
