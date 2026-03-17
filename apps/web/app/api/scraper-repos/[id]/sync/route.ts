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

import { apiRoute, ForbiddenError, safeFindByID } from "@/lib/api";
import { canManageResource, requireScrapersEnabled } from "@/lib/utils/auth-helpers";
import { extractRelationId } from "@/lib/utils/relation-id";
import type { ScraperRepo } from "@/payload-types";

export const POST = apiRoute({
  auth: "required",
  params: z.object({ id: z.string().regex(/^\d+$/).transform(Number) }),
  handler: async ({ user, payload, params }) => {
    await requireScrapersEnabled(payload);

    const repo = await safeFindByID<ScraperRepo>(payload, {
      collection: "scraper-repos",
      id: params.id,
      overrideAccess: true,
    });

    const repoOwnerId = extractRelationId(repo.createdBy);
    if (!canManageResource(user, repoOwnerId)) {
      throw new ForbiddenError("Not authorized");
    }

    // Queue sync job
    await payload.jobs.queue({ task: "scraper-repo-sync", input: { scraperRepoId: repo.id } });

    return { message: "Repository sync queued" };
  },
});
