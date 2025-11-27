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

import { logError } from "@/lib/logger";
import { type AuthenticatedRequest, withAuth } from "@/lib/middleware/auth";
import { withRateLimit } from "@/lib/middleware/rate-limit";
import { ErrorRecoveryService } from "@/lib/services/error-recovery";
import { internalError } from "@/lib/utils/api-response";
import config from "@/payload.config";

export const GET = withRateLimit(
  withAuth(async (request: AuthenticatedRequest): Promise<NextResponse> => {
    try {
      const payload = await getPayload({ config });

      // Get recommendations (respects access control)
      const recommendations = await ErrorRecoveryService.getRecoveryRecommendations(payload);

      // Filter recommendations based on user access
      // For non-admins, we need to filter based on import file ownership
      let filteredRecommendations = recommendations;

      if (request.user && request.user.role !== "admin") {
        // Get all import files owned by this user - only fetch IDs (id is auto-included)
        const userImportFiles = await payload.find({
          collection: "import-files",
          where: { user: { equals: request.user.id } },
          limit: 1000,
          pagination: false,
          overrideAccess: true, // We'll do manual filtering
          select: { status: true },
        });

        const userImportFileIds = userImportFiles.docs.map((file) => file.id);

        // Get all import jobs for these files - only fetch IDs (id is auto-included)
        const userImportJobs = await payload.find({
          collection: "import-jobs",
          where: { importFile: { in: userImportFileIds } },
          limit: 1000,
          pagination: false,
          overrideAccess: true,
          select: { stage: true },
        });

        const userImportJobIds = new Set(userImportJobs.docs.map((job) => String(job.id)));

        // Filter recommendations to only include user's jobs
        filteredRecommendations = recommendations.filter((rec) => userImportJobIds.has(String(rec.jobId)));
      }

      // Group recommendations by action type
      const grouped = {
        autoRetryAvailable: filteredRecommendations.filter((r) => r.recommendedAction === "Automatic retry available"),
        manualReviewRequired: filteredRecommendations.filter((r) => r.recommendedAction.includes("Manual")),
        maxRetriesExceeded: filteredRecommendations.filter((r) => r.recommendedAction.includes("max retries")),
        noActionNeeded: filteredRecommendations.filter((r) => r.recommendedAction === "No action recommended"),
      };

      return NextResponse.json({
        total: filteredRecommendations.length,
        summary: {
          autoRetryAvailable: grouped.autoRetryAvailable.length,
          manualReviewRequired: grouped.manualReviewRequired.length,
          maxRetriesExceeded: grouped.maxRetriesExceeded.length,
          noActionNeeded: grouped.noActionNeeded.length,
        },
        recommendations: filteredRecommendations,
        grouped,
      });
    } catch (error) {
      logError(error, "Failed to get retry recommendations", { userId: request.user?.id });

      return internalError("Failed to get retry recommendations");
    }
  }),
  { configName: "RETRY_RECOMMENDATIONS" }
);
