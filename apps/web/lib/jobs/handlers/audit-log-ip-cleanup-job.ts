/**
 * Background job for clearing raw IP addresses from audit log entries.
 *
 * Runs daily and nulls out the `ipAddress` field on entries older than 30 days,
 * preserving the permanent `ipAddressHash` for long-term correlation.
 *
 * @module
 * @category Jobs
 */
import type { JobHandlerContext } from "@/lib/jobs/utils/job-context";
import { logError, logger } from "@/lib/logger";

/** Number of days to retain raw IP addresses before clearing. */
const IP_RETENTION_DAYS = 30;

export const auditLogIpCleanupJob = {
  slug: "audit-log-ip-cleanup",
  schedule: [
    {
      cron: "0 4 * * *", // Every day at 4:00 AM
      queue: "maintenance",
    },
  ],
  retries: 2,
  handler: async ({ job, req }: JobHandlerContext) => {
    const { payload } = req;

    try {
      logger.info({ jobId: job?.id }, "Starting audit log IP cleanup job");

      const cutoffDate = new Date(Date.now() - IP_RETENTION_DAYS * 24 * 60 * 60 * 1000);
      let cleared = 0;

      // Find entries older than retention period that still have raw IPs
      const entries = await payload.find({
        collection: "audit-log",
        where: { and: [{ timestamp: { less_than: cutoffDate.toISOString() } }, { ipAddress: { exists: true } }] },
        limit: 500,
        overrideAccess: true,
      });

      for (const entry of entries.docs) {
        try {
          await payload.update({
            collection: "audit-log",
            id: entry.id,
            data: { ipAddress: null },
            overrideAccess: true,
          });
          cleared++;
        } catch (error) {
          logError(error, "Failed to clear IP from audit entry", { entryId: entry.id });
        }
      }

      logger.info({ jobId: job?.id, cleared, total: entries.totalDocs }, "Audit log IP cleanup completed");

      return { output: { success: true, cleared, totalEligible: entries.totalDocs } };
    } catch (error) {
      logError(error, "Audit log IP cleanup job failed", { jobId: job?.id });
      throw error;
    }
  },
};
