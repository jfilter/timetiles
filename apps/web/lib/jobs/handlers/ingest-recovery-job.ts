/**
 * Hourly report of ingest work whose worker died (ADR 0043).
 *
 * Records what recovery would do in `ingest-recovery-runs` and changes nothing
 * else. Operators apply it with `timetiles ingest recover --apply`.
 *
 * @module
 * @category Jobs
 */
import { logger } from "@/lib/logger";

import { runIngestRecovery } from "../utils/ingest-recovery";
import type { JobHandlerContext } from "../utils/job-context";

export const ingestRecoveryJob = {
  slug: "ingest-recovery",
  schedule: [{ cron: "15 * * * *", queue: "maintenance" as const }],
  concurrency: () => "ingest-recovery",
  handler: async ({ req }: JobHandlerContext) => {
    const report = await runIngestRecovery(req.payload, { apply: false });
    const found = report.findings.length;
    if (found > 0) {
      logger.warn(
        { found, kinds: report.findings.map((finding) => finding.kind) },
        "Abandoned ingest work found; run `timetiles ingest recover` to review and apply"
      );
    }
    return { output: { found } };
  },
};
