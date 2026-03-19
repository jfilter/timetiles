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
import { loadManageableScraperRepo } from "@/lib/api/scraper-helpers";

export const POST = apiRoute({
  auth: "required",
  params: z.object({ id: z.string().regex(/^\d+$/).transform(Number) }),
  handler: async ({ user, payload, params }) => {
    const repo = await loadManageableScraperRepo(payload, user, params.id);

    // Queue sync job
    await payload.jobs.queue({ task: "scraper-repo-sync", input: { scraperRepoId: repo.id } });

    return { message: "Repository sync queued" };
  },
});
