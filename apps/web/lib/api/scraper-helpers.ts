/**
 * Shared helpers for scraper API routes.
 *
 * Encapsulates the common preamble of checking the feature flag, loading
 * the resource, and verifying that the caller can manage it.
 *
 * @module
 * @category API
 */
import type { Payload } from "payload";

import { canManageResource, requireScrapersEnabled } from "@/lib/api/auth-helpers";
import { ForbiddenError, safeFindByID } from "@/lib/api/errors";
import { extractRelationId } from "@/lib/utils/relation-id";
import type { Scraper, ScraperRepo } from "@/payload-types";

type ScraperWithRepo = Omit<Scraper, "repo"> & { repo: ScraperRepo };

const hasPopulatedRepo = (scraper: Scraper): scraper is ScraperWithRepo =>
  scraper.repo != null && typeof scraper.repo === "object";

/**
 * Load a scraper repo after verifying the scrapers feature is enabled and
 * the user has permission to manage it.
 *
 * @throws ForbiddenError if the feature is disabled or the user lacks access
 * @throws NotFoundError if the repo does not exist
 */
export const loadManageableScraperRepo = async (
  payload: Payload,
  user: { id: number; role?: string | null },
  repoId: number
): Promise<ScraperRepo> => {
  await requireScrapersEnabled(payload);

  const repo = await safeFindByID(payload, { collection: "scraper-repos", id: repoId, overrideAccess: true });

  const repoOwnerId = extractRelationId(repo.createdBy);
  if (!canManageResource(user, repoOwnerId)) {
    throw new ForbiddenError("Not authorized");
  }

  return repo;
};

/**
 * Load a scraper (with its repo populated) after verifying the scrapers
 * feature is enabled and the user has permission to manage the parent repo.
 *
 * @throws ForbiddenError if the feature is disabled or the user lacks access
 * @throws NotFoundError if the scraper does not exist
 */
export const loadManageableScraper = async (
  payload: Payload,
  user: { id: number; role?: string | null },
  scraperId: number
): Promise<ScraperWithRepo> => {
  await requireScrapersEnabled(payload);

  const scraper = await safeFindByID(payload, {
    collection: "scrapers",
    id: scraperId,
    depth: 1,
    overrideAccess: true,
  });

  if (!hasPopulatedRepo(scraper)) {
    throw new ForbiddenError("Scraper repo is not populated");
  }

  const repoOwnerId = extractRelationId(scraper.repo.createdBy);
  if (!canManageResource(user, repoOwnerId)) {
    throw new ForbiddenError("Not authorized");
  }

  return scraper;
};
