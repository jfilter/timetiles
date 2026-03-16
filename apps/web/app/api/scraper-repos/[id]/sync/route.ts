/**
 * Force-sync endpoint for scraper repositories.
 *
 * Re-clones the repo and re-parses the scrapers.yml manifest,
 * updating scraper records to match.
 *
 * @module
 * @category API
 */
import { z } from "zod";

import { apiRoute } from "@/lib/api";
import { isFeatureEnabled } from "@/lib/services/feature-flag-service";
import { extractRelationId } from "@/lib/utils/relation-id";
import type { ScraperRepo } from "@/payload-types";

export const POST = apiRoute({
  auth: "required",
  params: z.object({ id: z.string().regex(/^\d+$/).transform(Number) }),
  handler: async ({ user, payload, params }) => {
    const enabled = await isFeatureEnabled(payload, "enableScrapers");
    if (!enabled) {
      return { success: false, error: "Scraper feature is not enabled" };
    }

    let repo: ScraperRepo;
    try {
      repo = await payload.findByID({ collection: "scraper-repos", id: params.id, overrideAccess: true });
    } catch {
      return Response.json({ success: false, error: "Scraper repo not found" }, { status: 404 });
    }

    // Check ownership
    const repoOwnerId = extractRelationId(repo.createdBy);
    if (user.role !== "admin" && user.role !== "editor" && repoOwnerId !== user.id) {
      return Response.json({ success: false, error: "Not authorized" }, { status: 403 });
    }

    // Queue sync job
    await payload.jobs.queue({ task: "scraper-repo-sync", input: { scraperRepoId: repo.id } });

    return { success: true, message: "Repository sync queued" };
  },
});
