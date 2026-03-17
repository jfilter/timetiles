/**
 * Background job for executing scheduled account deletions.
 *
 * This job runs periodically to check for users whose deletion grace period
 * has expired and executes the actual deletion process. It transfers public
 * data to the system user and permanently deletes private data.
 *
 * @module
 * @category Jobs
 */
import type { JobHandlerContext } from "@/lib/jobs/utils/job-context";
import { logError, logger } from "@/lib/logger";
import { createAccountDeletionService } from "@/lib/services/account-deletion-service";

/**
 * Job handler for executing scheduled account deletions.
 */
export const executeAccountDeletionJob = {
  slug: "execute-account-deletion",
  handler: async ({ job, req }: JobHandlerContext) => {
    const { payload } = req;

    try {
      logger.info({ jobId: job?.id }, "Starting account deletion execution job");

      const deletionService = createAccountDeletionService(payload);
      const dueDeletions = await deletionService.findDueDeletions();

      logger.info({ count: dueDeletions.length, jobId: job?.id }, "Found users with due deletions");

      let successCount = 0;
      let errorCount = 0;

      for (const user of dueDeletions) {
        try {
          await deletionService.executeDeletion(user.id, { deletionType: "scheduled" });
          successCount++;
          logger.info({ userId: user.id }, "Successfully executed scheduled deletion");
        } catch (error) {
          errorCount++;
          logError(error, "Failed to execute scheduled deletion", { userId: user.id, email: user.email });
        }
      }

      logger.info(
        { jobId: job?.id, totalDue: dueDeletions.length, success: successCount, errors: errorCount },
        "Account deletion execution job completed"
      );

      return {
        output: {
          success: true,
          totalDue: dueDeletions.length,
          successfulDeletions: successCount,
          failedDeletions: errorCount,
        },
      };
    } catch (error) {
      logError(error, "Account deletion execution job failed", { jobId: job?.id });
      throw error;
    }
  },
};
