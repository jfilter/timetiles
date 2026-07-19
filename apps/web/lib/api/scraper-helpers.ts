/**
 * Shared helpers for scraper API routes.
 *
 * Encapsulates the common preamble of checking the feature flag, loading
 * the resource, and verifying that the caller can manage it.
 *
 * @module
 * @category API
 */
import { commitTransaction, initTransaction, killTransaction, type Payload, type PayloadRequest } from "payload";

import { canManageResource, requireScrapersEnabled } from "@/lib/api/auth-helpers";
import { ForbiddenError, safeFindByID } from "@/lib/api/errors";
import { extractRelationId } from "@/lib/utils/relation-id";
import type { Scraper, ScraperRepo } from "@/payload-types";

/**
 * Queue a scraper-repo sync atomically.
 *
 * The `scraper-repo-sync` task uses `supersedes` concurrency, which Payload
 * implements as DELETE-pending-then-INSERT. Without a transaction, an insert
 * that fails after the delete succeeded drops the only pending sync and leaves
 * the repo unsynced. Wrapping both in one transaction makes it all-or-nothing —
 * necessary for callers (e.g. the manual `/sync` route) that don't already run
 * inside a request transaction. Callers within a request transaction pass their
 * own `req` to `jobs.queue` instead.
 */
export const queueScraperRepoSync = async (payload: Payload, scraperRepoId: number): Promise<void> => {
  const req = { payload, transactionID: undefined, context: {} } as Pick<
    PayloadRequest,
    "payload" | "transactionID" | "context"
  >;
  const ownsTransaction = await initTransaction(req);
  try {
    // jobs.queue types `req` as a full PayloadRequest; only the transaction id is
    // actually read, so the transaction-carrying partial is sufficient at runtime.
    await payload.jobs.queue({ task: "scraper-repo-sync", input: { scraperRepoId }, req: req as PayloadRequest });
    if (ownsTransaction) await commitTransaction(req);
  } catch (error) {
    if (ownsTransaction) await killTransaction(req);
    throw error;
  }
};

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
