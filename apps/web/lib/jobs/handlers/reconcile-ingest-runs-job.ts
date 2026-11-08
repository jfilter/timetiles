/**
 * Periodic pass over ingest runs that are not settled and accounted yet.
 *
 * Catches transitions without a workflow (an approval that completes a job
 * directly, a deleted sheet) and a reconciliation that failed after a child
 * transition. See ADR 0043.
 *
 * @module
 * @category Jobs
 */
import { COLLECTION_NAMES } from "@/lib/constants/ingest-constants";
import { logError, logger } from "@/lib/logger";

import type { JobHandlerContext } from "../utils/job-context";
import { reconcileRun } from "../utils/reconcile-run";

export const reconcileIngestRunsJob = {
  slug: "reconcile-ingest-runs",
  schedule: [{ cron: "* * * * *", queue: "maintenance" as const }],
  concurrency: () => "reconcile-ingest-runs",
  handler: async ({ req }: JobHandlerContext) => {
    const { docs } = await req.payload.find({
      collection: COLLECTION_NAMES.INGEST_RUNS,
      where: {
        dispatchedAt: { exists: true },
        or: [{ outcome: { in: ["pending", "awaiting_review"] } }, { accountedAt: { exists: false } }],
      },
      pagination: false,
      depth: 0,
      select: {},
    });

    let failed = 0;
    for (const run of docs) {
      try {
        await reconcileRun(req.payload, run.id);
      } catch (error) {
        failed++;
        logError(error, "Failed to reconcile ingest run", { runId: run.id });
      }
    }
    if (docs.length > 0) logger.info({ checked: docs.length, failed }, "Reconciled open ingest runs");
    return { output: { checked: docs.length, failed } };
  },
};
