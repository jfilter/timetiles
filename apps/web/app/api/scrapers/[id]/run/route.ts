/**
 * Manual trigger endpoint for scraper execution.
 *
 * Queues a scraper-execution job for the given scraper ID.
 * Requires authentication and ownership of the scraper's repo.
 *
 * @module
 * @category API
 */
import { z } from "zod";

import { apiRoute, ConflictError } from "@/lib/api";
import { queueJobWithRollback } from "@/lib/api/job-helpers";
import { loadManageableScraper } from "@/lib/api/scraper-helpers";
import { checkRateLimit } from "@/lib/middleware/rate-limit";
import { claimScraperRunning } from "@/lib/services/webhook-registry";

export const POST = apiRoute({
  auth: "required",
  site: "default",
  // Rate limiting is applied inside the handler (after the "already running"
  // check) rather than declaratively here, so a 409 takes precedence over a 429.
  params: z.object({ id: z.string().regex(/^\d+$/).transform(Number) }),
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

    // Atomically claim running status to guard against a concurrent trigger
    // that slipped past the read above.
    const claimed = await claimScraperRunning(payload, scraper.id);
    if (!claimed) {
      throw new ConflictError("Scraper is already running");
    }

    // Queue scraper-ingest workflow (execution + auto-import pipeline).
    // Previously queued standalone task which skipped the import pipeline.
    await queueJobWithRollback(
      payload,
      { workflow: "scraper-ingest", input: { scraperId: scraper.id, triggeredBy: "manual" } },
      { collection: "scrapers", id: scraper.id, data: { lastRunStatus: "failed" } }
    );

    return { message: "Scraper run queued" };
  },
});
