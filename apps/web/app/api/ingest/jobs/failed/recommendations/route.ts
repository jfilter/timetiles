/**
 * API route for getting failed import jobs summary.
 *
 * Lists failed import jobs accessible to the user with basic info.
 * Retry is handled by POST /api/ingest-jobs/:id/retry which queues
 * the ingest-process workflow.
 *
 * Access control:
 * - Users see their own failed imports
 * - Admins see all failed imports
 *
 * @module
 * @category API
 */
import { apiRoute } from "@/lib/api";
import { PROCESSING_STAGE } from "@/lib/constants/ingest-constants";

export const GET = apiRoute({
  auth: "required",
  site: "default",
  rateLimit: { configName: "RETRY_RECOMMENDATIONS" },
  handler: async ({ user, payload }) => {
    const failedJobs = await payload.find({
      collection: "ingest-jobs",
      where: { stage: { equals: PROCESSING_STAGE.FAILED } },
      limit: 100,
      overrideAccess: user.role === "admin",
      user,
    });

    return {
      total: failedJobs.totalDocs,
      jobs: failedJobs.docs.map((job) => ({
        id: job.id,
        stage: job.stage,
        errorLog: job.errorLog,
        updatedAt: job.updatedAt,
      })),
    };
  },
});
