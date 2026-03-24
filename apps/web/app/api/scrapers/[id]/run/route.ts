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
import { claimScraperRunning } from "@/lib/services/webhook-registry";

export const POST = apiRoute({
  auth: "required",
  site: "default",
  params: z.object({ id: z.string().regex(/^\d+$/).transform(Number) }),
  handler: async ({ user, payload, params }) => {
    const scraper = await loadManageableScraper(payload, user, params.id);

    // Atomically claim running status to prevent concurrent triggers
    const claimed = await claimScraperRunning(payload, scraper.id);
    if (!claimed) {
      throw new ConflictError("Scraper is already running");
    }

    // Queue execution job — revert "running" status on failure
    await queueJobWithRollback(
      payload,
      { task: "scraper-execution", input: { scraperId: scraper.id, triggeredBy: "manual" } },
      { collection: "scrapers", id: scraper.id, data: { lastRunStatus: "failed" } }
    );

    return { message: "Scraper run queued" };
  },
});
