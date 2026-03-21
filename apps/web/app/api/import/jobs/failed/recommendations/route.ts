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
import { apiRoute } from "@/lib/api";
import { ErrorRecoveryService } from "@/lib/import/error-recovery";

export const GET = apiRoute({
  auth: "required",
  site: "default",
  rateLimit: { configName: "RETRY_RECOMMENDATIONS" },
  handler: async ({ user, payload }) => {
    // For admins, get all recommendations; for others, let access control filter
    const recommendations =
      user.role === "admin"
        ? await ErrorRecoveryService.getRecoveryRecommendations(payload)
        : await ErrorRecoveryService.getRecoveryRecommendations(payload, user);

    // Group recommendations by action type
    const grouped = {
      autoRetryAvailable: recommendations.filter((r) => r.recommendedAction === "Automatic retry available"),
      manualReviewRequired: recommendations.filter((r) => r.recommendedAction.includes("Manual")),
      maxRetriesExceeded: recommendations.filter((r) => r.recommendedAction.includes("max retries")),
      noActionNeeded: recommendations.filter((r) => r.recommendedAction === "No action recommended"),
    };

    return {
      total: recommendations.length,
      summary: {
        autoRetryAvailable: grouped.autoRetryAvailable.length,
        manualReviewRequired: grouped.manualReviewRequired.length,
        maxRetriesExceeded: grouped.maxRetriesExceeded.length,
        noActionNeeded: grouped.noActionNeeded.length,
      },
      recommendations,
      grouped,
    };
  },
});
