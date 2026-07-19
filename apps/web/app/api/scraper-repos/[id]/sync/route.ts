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
import { loadManageableScraperRepo, queueScraperRepoSync } from "@/lib/api/scraper-helpers";

export const POST = apiRoute({
  auth: "required",
  site: "default",
  rateLimit: { configName: "SCRAPER_TRIGGER", keyPrefix: (u) => `scraper-sync:${u!.id}` },
  params: z.object({ id: z.string().regex(/^\d+$/).transform(Number) }),
  handler: async ({ user, payload, params }) => {
    const repo = await loadManageableScraperRepo(payload, user, params.id);

    // Atomic queue: the sync task supersedes older pending jobs (delete + insert),
    // so a bare non-transactional enqueue could drop the only pending sync.
    await queueScraperRepoSync(payload, repo.id);

    return { message: "Repository sync queued" };
  },
});
