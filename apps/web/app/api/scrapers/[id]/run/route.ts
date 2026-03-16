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

import { apiRoute } from "@/lib/api";
import { isFeatureEnabled } from "@/lib/services/feature-flag-service";
import { claimScraperRunning } from "@/lib/services/webhook-registry";
import { extractRelationId } from "@/lib/utils/relation-id";
import type { Scraper, ScraperRepo } from "@/payload-types";

export const POST = apiRoute({
  auth: "required",
  params: z.object({ id: z.string().regex(/^\d+$/).transform(Number) }),
  handler: async ({ user, payload, params }) => {
    const enabled = await isFeatureEnabled(payload, "enableScrapers");
    if (!enabled) {
      return { success: false, error: "Scraper feature is not enabled" };
    }

    let scraper: Scraper;
    try {
      scraper = await payload.findByID({ collection: "scrapers", id: params.id, depth: 1, overrideAccess: true });
    } catch {
      return Response.json({ success: false, error: "Scraper not found" }, { status: 404 });
    }

    // Check ownership
    const repo = scraper.repo as ScraperRepo;
    const repoOwnerId = repo ? extractRelationId(repo.createdBy) : null;
    if (user.role !== "admin" && user.role !== "editor" && repoOwnerId !== user.id) {
      return Response.json({ success: false, error: "Not authorized" }, { status: 403 });
    }

    // Atomically claim running status to prevent concurrent triggers
    const claimed = await claimScraperRunning(payload, scraper.id);
    if (!claimed) {
      return Response.json({ success: false, error: "Scraper is already running" }, { status: 409 });
    }

    // Queue execution job
    await payload.jobs.queue({ task: "scraper-execution", input: { scraperId: scraper.id, triggeredBy: "manual" } });

    return { success: true, message: "Scraper run queued" };
  },
});
