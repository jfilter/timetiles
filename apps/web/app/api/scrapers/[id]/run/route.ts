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

import { apiRoute, AppError, ConflictError } from "@/lib/api";
import { loadManageableScraper } from "@/lib/api/scraper-helpers";
import { logError } from "@/lib/logger";
import { claimScraperRunning } from "@/lib/services/webhook-registry";

export const POST = apiRoute({
  auth: "required",
  params: z.object({ id: z.string().regex(/^\d+$/).transform(Number) }),
  handler: async ({ user, payload, params }) => {
    const scraper = await loadManageableScraper(payload, user, params.id);

    // Atomically claim running status to prevent concurrent triggers
    const claimed = await claimScraperRunning(payload, scraper.id);
    if (!claimed) {
      throw new ConflictError("Scraper is already running");
    }

    // Queue execution job — revert "running" status on failure
    try {
      await payload.jobs.queue({ task: "scraper-execution", input: { scraperId: scraper.id, triggeredBy: "manual" } });
    } catch (error) {
      logError(error, "Failed to queue scraper execution, reverting status", { scraperId: scraper.id });
      await payload.update({
        collection: "scrapers",
        id: scraper.id,
        overrideAccess: true,
        data: { lastRunStatus: "failed" },
      });
      throw new AppError(500, "Failed to queue scraper execution");
    }

    return { message: "Scraper run queued" };
  },
});
