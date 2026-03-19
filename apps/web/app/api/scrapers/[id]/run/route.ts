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

import { apiRoute, AppError, ConflictError, ForbiddenError, safeFindByID } from "@/lib/api";
import { canManageResource, requireScrapersEnabled } from "@/lib/api/auth-helpers";
import { logError } from "@/lib/logger";
import { claimScraperRunning } from "@/lib/services/webhook-registry";
import { extractRelationId } from "@/lib/utils/relation-id";
import type { Scraper, ScraperRepo } from "@/payload-types";

export const POST = apiRoute({
  auth: "required",
  params: z.object({ id: z.string().regex(/^\d+$/).transform(Number) }),
  handler: async ({ user, payload, params }) => {
    await requireScrapersEnabled(payload);

    const scraper = await safeFindByID<Scraper>(payload, {
      collection: "scrapers",
      id: params.id,
      depth: 1,
      overrideAccess: true,
    });

    const repo = scraper.repo as ScraperRepo;
    const repoOwnerId = repo ? extractRelationId(repo.createdBy) : null;
    if (!canManageResource(user, repoOwnerId)) {
      throw new ForbiddenError("Not authorized");
    }

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
