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

    // The disable toggle must hold for manual runs too. The execution job enforces
    // it as well; rejecting here gives immediate feedback.
    if (scraper.enabled === false) {
      throw new ConflictError("Scraper is disabled");
    }

    // 409 ahead of the rate limit's 429: it is the more actionable response, and
    // the atomic claim below — not the rate limit — prevents duplicate runs.
    if (scraper.lastRunStatus === "running") {
      throw new ConflictError("Scraper is already running");
    }

    // Defense-in-depth limit on re-triggers. Two concurrent triggers can both read
    // the scraper as idle, so the loser may still get a 429 rather than a 409.
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
