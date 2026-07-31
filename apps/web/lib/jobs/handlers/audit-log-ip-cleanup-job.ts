/**
 * Background job for clearing raw IP addresses from audit log entries.
 *
 * Runs daily and nulls out the `ipAddress` field on entries older than 30 days,
 * preserving the permanent `ipAddressHash` for long-term correlation.
 *
 * @module
 * @category Jobs
 */
import { IP_RETENTION_DAYS } from "@/lib/constants/account-constants";
import type { JobHandlerContext } from "@/lib/jobs/utils/job-context";
import { logError, logger } from "@/lib/logger";
import { asSystem } from "@/lib/services/system-payload";

const PAGE_SIZE = 500;
/** Cap pages per run so a large backlog cannot occupy the maintenance queue indefinitely. */
const MAX_PAGES = 25;

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
    const sys = asSystem(req.payload);

    try {
      logger.info({ jobId: job?.id }, "Starting audit log IP cleanup job");

      const cutoffDate = new Date(Date.now() - IP_RETENTION_DAYS * 24 * 60 * 60 * 1000);
      let cleared = 0;
      let totalEligible = 0;
      let hasMore = false;

      // Page until the backlog is drained. A single page of 500 per daily run meant any
      // instance producing more than that many IP-carrying entries a day fell further behind
      // every day, and raw IPs outlived the retention window the collection promises. The
      // query always re-reads page 1 because each update removes a row from the result set.
      for (let page = 1; page <= MAX_PAGES; page++) {
        const entries = await sys.find({
          collection: "audit-log",
          where: { and: [{ timestamp: { less_than: cutoffDate.toISOString() } }, { ipAddress: { exists: true } }] },
          limit: PAGE_SIZE,
        });

        // From the first read only: later pages shrink as rows are cleared, so overwriting
        // this would report the drained count instead of the backlog we started with.
        if (page === 1) totalEligible = entries.totalDocs;
        if (entries.docs.length === 0) break;

        let clearedThisPage = 0;
        for (const entry of entries.docs) {
          try {
            await sys.update({ collection: "audit-log", id: entry.id, data: { ipAddress: null } });
            cleared++;
            clearedThisPage++;
          } catch (error) {
            logError(error, "Failed to clear IP from audit entry", { entryId: entry.id });
          }
        }

        // Every row on this page failed to update — retrying the same page would spin.
        if (clearedThisPage === 0) break;
        if (page === MAX_PAGES && entries.docs.length === PAGE_SIZE) hasMore = true;
      }

      if (hasMore) {
        logger.warn({ jobId: job?.id, cleared }, "Audit log IP cleanup hit its page cap; backlog remains");
      }
      logger.info({ jobId: job?.id, cleared, total: totalEligible }, "Audit log IP cleanup completed");

      return { output: { success: true, cleared, totalEligible, hasMore } };
    } catch (error) {
      logError(error, "Audit log IP cleanup job failed", { jobId: job?.id });
      throw error;
    }
  },
};
