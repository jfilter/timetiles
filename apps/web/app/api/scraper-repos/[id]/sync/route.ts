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
import { NumericIdParamSchema } from "@/lib/schemas/common";
import { buildResourceIdMatch } from "@/lib/services/payload-job-queries";
import { asSystem } from "@/lib/services/system-payload";

/** Expose only whether this authorized repository still has sync work pending. */
export const GET = apiRoute({
  auth: "required",
  site: "default",
  params: z.object({ id: NumericIdParamSchema }),
  handler: async ({ user, payload, params }) => {
    const repo = await loadManageableScraperRepo(payload, user, params.id);
    const jobs = await asSystem(payload).count({
      collection: "payload-jobs",
      where: {
        and: [
          { taskSlug: { equals: "scraper-repo-sync" } },
          buildResourceIdMatch("input.scraperRepoId", repo.id),
          { completedAt: { exists: false } },
          { hasError: { equals: false } },
        ],
      },
    });
    return { pending: jobs.totalDocs > 0 };
  },
});

export const POST = apiRoute({
  auth: "required",
  site: "default",
  rateLimit: { configName: "SCRAPER_TRIGGER", keyPrefix: (u) => `scraper-sync:${u!.id}` },
  params: z.object({ id: NumericIdParamSchema }),
  handler: async ({ user, payload, params }) => {
    const repo = await loadManageableScraperRepo(payload, user, params.id);

    // Atomic queue: the sync task supersedes older pending jobs (delete + insert),
    // so a bare non-transactional enqueue could drop the only pending sync.
    await queueScraperRepoSync(payload, repo.id);

    return { message: "Repository sync queued" };
  },
});
