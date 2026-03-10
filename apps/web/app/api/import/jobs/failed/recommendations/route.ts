/**
 * API route for getting retry recommendations for failed import jobs.
 *
 * This endpoint analyzes all failed import jobs accessible to the user
 * and provides recommendations on whether they should be retried automatically,
 * require manual intervention, or have exceeded retry limits.
 *
 * Access control:
 * - Users see recommendations for their own failed imports
 * - Admins see recommendations for all failed imports
 *
 * @module
 * @category API
 */
import { NextResponse } from "next/server";
import { getPayload } from "payload";

import { logger } from "@/lib/logger";
import { type AuthenticatedRequest, withAuth } from "@/lib/middleware/auth";
import { withRateLimit } from "@/lib/middleware/rate-limit";
import { ErrorRecoveryService } from "@/lib/services/error-recovery";
import { createErrorHandler } from "@/lib/utils/api-response";
import config from "@/payload.config";

export const GET = withRateLimit(
  withAuth(async (request: AuthenticatedRequest): Promise<NextResponse> => {
    const handleError = createErrorHandler("fetch retry recommendations", logger);
    try {
      const payload = await getPayload({ config });

      // For admins, get all recommendations; for others, let access control filter
      const recommendations =
        request.user?.role === "admin"
          ? await ErrorRecoveryService.getRecoveryRecommendations(payload)
          : await ErrorRecoveryService.getRecoveryRecommendations(payload, request.user);

      // Group recommendations by action type
      const grouped = {
        autoRetryAvailable: recommendations.filter((r) => r.recommendedAction === "Automatic retry available"),
        manualReviewRequired: recommendations.filter((r) => r.recommendedAction.includes("Manual")),
        maxRetriesExceeded: recommendations.filter((r) => r.recommendedAction.includes("max retries")),
        noActionNeeded: recommendations.filter((r) => r.recommendedAction === "No action recommended"),
      };

      return NextResponse.json({
        total: recommendations.length,
        summary: {
          autoRetryAvailable: grouped.autoRetryAvailable.length,
          manualReviewRequired: grouped.manualReviewRequired.length,
          maxRetriesExceeded: grouped.maxRetriesExceeded.length,
          noActionNeeded: grouped.noActionNeeded.length,
        },
        recommendations,
        grouped,
      });
    } catch (error) {
      return handleError(error);
    }
  }),
  { configName: "RETRY_RECOMMENDATIONS" }
);
