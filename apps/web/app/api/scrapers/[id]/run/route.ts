/**
 * Manual trigger endpoint for scraper execution.
 *
 * Queues a scraper-ingest workflow for the given scraper ID.
 * Requires authentication and ownership of the scraper's repo.
 *
 * @module
 * @category API
 */
import { commitTransaction, createLocalReq, initTransaction, killTransaction } from "payload";
import { z } from "zod";

import { apiRoute, ConflictError } from "@/lib/api";
import { loadManageableScraper } from "@/lib/api/scraper-helpers";
import { checkRateLimit } from "@/lib/middleware/rate-limit";
import { NumericIdParamSchema } from "@/lib/schemas/common";
import { claimScraperRunning } from "@/lib/services/webhook-registry";

export const POST = apiRoute({
  auth: "required",
  site: "default",
  // Rate limiting is applied inside the handler (after the "already running"
  // check) rather than declaratively here, so a 409 takes precedence over a 429.
  params: z.object({ id: NumericIdParamSchema }),
  handler: async ({ req, user, payload, params }) => {
    const scraper = await loadManageableScraper(payload, user, params.id);

    // Reject disabled scrapers up-front: the disable toggle must hold for manual
    // runs too, not just the cron scheduler. The execution job enforces this
    // centrally as well, but rejecting here gives immediate feedback and avoids
    // queueing a job that would only fail.
    if (scraper.enabled === false) {
      throw new ConflictError("Scraper is disabled");
    }

    // Report "already running" (409) ahead of the rate limit (429): 409 is the
    // more specific, actionable response, and the atomic claim below — not the
    // rate limit — is what actually prevents duplicate concurrent runs. The
    // rate limit still bounds genuine re-triggers once the scraper is idle.
    if (scraper.lastRunStatus === "running") {
      throw new ConflictError("Scraper is already running");
    }

    // Defense-in-depth rate limit on re-triggers, checked after the running
    // check so a *stored* "running" status always wins over the limit. It does
    // not order the two absolutely: two concurrent triggers can both read the
    // scraper as idle, and the loser can then hit the limit here and get a 429
    // rather than the 409 the atomic claim below would have produced.
    const rateLimited = await checkRateLimit(req, user, {
      configName: "SCRAPER_TRIGGER",
      keyPrefix: (u) => `scraper-run:${u!.id}`,
    });
    if (rateLimited) return rateLimited;

    const jobReq = await createLocalReq({ user }, payload);
    const ownsTransaction = await initTransaction(jobReq);
    try {
      // Publish the atomic claim and workflow together, preserving the old status/time on failure.
      const claimed = await claimScraperRunning(payload, scraper.id, jobReq);
      if (!claimed) throw new ConflictError("Scraper is no longer available for triggering");
      await payload.jobs.queue({
        workflow: "scraper-ingest",
        input: { scraperId: scraper.id, triggeredBy: "manual" },
        req: jobReq,
      });
      if (ownsTransaction) await commitTransaction(jobReq);
    } catch (error) {
      if (ownsTransaction) await killTransaction(jobReq);
      throw error;
    }

    return { message: "Scraper run queued" };
  },
});
