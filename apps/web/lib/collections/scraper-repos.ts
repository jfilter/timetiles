/**
 * Defines the Payload CMS collection for scraper source code repositories.
 *
 * A scraper repo holds either a Git URL or uploaded code that contains
 * one or more scrapers defined via a `scrapers.yml` manifest.
 * See ADR 0015 for full architecture.
 *
 * @category Collections
 * @module
 */
import type { CollectionConfig, PayloadRequest, Where } from "payload";

import { RATE_LIMITS } from "@/lib/constants/rate-limits";
import { hasPendingPayloadJob } from "@/lib/jobs/utils/stuck-detection";
import { createLogger } from "@/lib/logger";
import { hasUrlEmbeddedCredentials, isPrivateUrl } from "@/lib/security/url-validation";
import { getFeatureFlagService } from "@/lib/services/feature-flag-service";
import { createQuotaService } from "@/lib/services/quota-service";
import { getRateLimitService } from "@/lib/services/rate-limit-service";

const COLLECTION_SLUG = "scraper-repos" as const;
const logger = createLogger(COLLECTION_SLUG);

type ScraperRepoQuotaRequest = PayloadRequest & { scraperRepoQuotaClaimedForUser?: string | number };

const markScraperRepoQuotaClaimed = (req: PayloadRequest): void => {
  if (req.user) (req as ScraperRepoQuotaRequest).scraperRepoQuotaClaimedForUser = req.user.id;
};

const clearScraperRepoQuotaClaim = (req: PayloadRequest): void => {
  (req as ScraperRepoQuotaRequest).scraperRepoQuotaClaimedForUser = undefined;
};

const SCRAPER_REPO_SYNC_TASK = "scraper-repo-sync" as const;

/**
 * Queue a manifest sync for a repo, but only when it is neither already pending
 * nor rate-limited.
 *
 * A generic `PATCH /api/scraper-repos/:id` that touches `gitUrl` / `gitBranch` /
 * `code` auto-triggers this sync. Without gating, that owner-reachable path
 * bypasses the SCRAPER_TRIGGER limit the dedicated `/sync` route enforces (each
 * sync is an expensive git clone + manifest re-parse) and can pile duplicate
 * jobs onto the queue. Dedup caps it to one pending/running sync per repo; the
 * rate limit (shared bucket with the manual `/sync` route via the same
 * `scraper-sync:<userId>` key) throttles serial re-triggers. Neither rejects the
 * edit — only the side-effect sync is skipped, and the user can still sync
 * manually once the window clears.
 */
const maybeQueueRepoSync = async ({
  repoId,
  operation,
  req,
}: {
  repoId: number | string;
  operation: "create" | "update";
  req: PayloadRequest;
}): Promise<void> => {
  // Dedup: a sync already waiting or running for this repo covers the change.
  if (await hasPendingPayloadJob(req.payload, "input.scraperRepoId", repoId, SCRAPER_REPO_SYNC_TASK)) {
    logger.info({ repoId, operation }, "Scraper repo sync already pending; skipping duplicate");
    return;
  }

  // Throttle re-syncs from generic updates. A create's initial sync always runs
  // (repo creation is already quota + trust gated and cannot be looped cheaply).
  if (operation === "update" && req.user) {
    const check = await getRateLimitService(req.payload).checkConfiguredRateLimit(
      `scraper-sync:${req.user.id}`,
      RATE_LIMITS.SCRAPER_TRIGGER
    );
    if (!check.allowed) {
      logger.warn({ repoId, userId: req.user.id }, "Scraper repo sync rate-limited; skipping auto-sync");
      return;
    }
  }

  try {
    await req.payload.jobs.queue({ task: SCRAPER_REPO_SYNC_TASK, input: { scraperRepoId: repoId } });
    logger.info({ repoId, operation }, "Queued scraper repo sync");
  } catch (error) {
    logger.error({ repoId, error }, "Failed to queue scraper repo sync");
  }
};

const compensateScraperRepoQuotaOnError = async (req: PayloadRequest): Promise<void> => {
  const marked = req as ScraperRepoQuotaRequest;
  const userId = marked.scraperRepoQuotaClaimedForUser;
  if (userId == null) return;

  marked.scraperRepoQuotaClaimedForUser = undefined;

  try {
    const quotaService = createQuotaService(req.payload);
    await quotaService.decrementUsage(userId, "SCRAPER_REPOS", 1, req);
  } catch (error) {
    logger.error({ userId, error }, "Failed to compensate scraper repo quota after create failure");
  }
};

const validateGitRepoUrl = (value: string): string | true => {
  let url: URL;

  try {
    url = new URL(value);
  } catch {
    return "Please provide a valid HTTPS Git URL";
  }

  if (url.protocol !== "https:") {
    return "Only HTTPS URLs are allowed";
  }

  if (hasUrlEmbeddedCredentials(url)) {
    return "Git URLs must not include embedded credentials";
  }

  if (isPrivateUrl(value)) {
    return "URLs pointing to private or internal networks are not allowed";
  }

  return true;
};

// Characters git forbids in ref names, plus whitespace and `\` — anything outside
// this safe set is rejected. We do not need git's full ref grammar here, only a
// conservative allow-list that keeps the value from being mistaken for a flag or
// containing shell/path metacharacters. Clone runs via execFile (no shell), so
// this is defence-in-depth, not the primary injection guard.
const VALID_GIT_BRANCH_RE = /^[A-Za-z0-9._/-]+$/;

const validateGitBranch = (value: string): string | true => {
  // A leading "-" / "--" would be parsed as a git flag rather than a branch name.
  if (value.startsWith("-")) {
    return "Branch name must not start with '-'";
  }
  if (value.includes("..")) {
    return "Branch name must not contain '..'";
  }
  if (!VALID_GIT_BRANCH_RE.test(value)) {
    return "Branch name may only contain letters, digits, '.', '_', '/', and '-'";
  }
  return true;
};

import {
  basicMetadataFields,
  createCommonConfig,
  createCreatedByField,
  createOwnershipAccess,
  createSlugField,
  isEditorOrAdmin,
  isPrivileged,
  setCreatedByHook,
} from "./shared-fields";

const ScraperRepos: CollectionConfig = {
  slug: COLLECTION_SLUG,
  // trash: false — a soft-deleted repo would leave its scrapers enabled and
  // scheduled (running code from a "deleted" repo) and fires no delete hooks,
  // so the quota slot would never be released. Deletes are real deletes and
  // cascade scrapers (which cascade their runs) via beforeDelete.
  ...createCommonConfig({ versions: false, drafts: false, trash: false }),
  admin: { useAsTitle: "name", defaultColumns: ["name", "sourceType", "createdBy", "updatedAt"], group: "Scrapers" },
  access: {
    // eslint-disable-next-line sonarjs/function-return-type -- Payload access control returns boolean | Where by design
    read: ({ req: { user } }): boolean | Where => {
      if (isPrivileged(user)) return true;
      if (!user) return false;
      return { createdBy: { equals: user.id } };
    },
    create: async ({ req: { user, payload } }) => {
      if (!user) return false;
      const enabled = await getFeatureFlagService(payload).isEnabled("enableScrapers");
      if (!enabled) return false;
      // Trust level 3+ required
      const trustLevel = typeof user.trustLevel === "string" ? Number(user.trustLevel) : (user.trustLevel ?? 0);
      return trustLevel >= 3 || user.role === "admin";
    },
    update: createOwnershipAccess(COLLECTION_SLUG),
    delete: createOwnershipAccess(COLLECTION_SLUG),
    readVersions: isEditorOrAdmin,
  },
  fields: [
    ...basicMetadataFields,
    createSlugField(COLLECTION_SLUG),
    createCreatedByField("User who created this scraper repo"),
    // Source type
    {
      name: "sourceType",
      type: "select",
      required: true,
      defaultValue: "git",
      options: [
        { label: "Git Repository", value: "git" },
        { label: "Uploaded Code", value: "upload" },
      ],
    },
    // Git fields
    {
      name: "gitUrl",
      type: "text",
      admin: {
        description: "Git repository URL (e.g., https://github.com/user/repo.git)",
        condition: (data) => data?.sourceType === "git",
      },
      validate: (value: unknown, { data }: { data: Record<string, unknown> }) => {
        if (data?.sourceType === "git" && !value) return "Git URL is required for git source type";
        if (value && typeof value === "string") {
          return validateGitRepoUrl(value);
        }
        return true;
      },
    },
    {
      name: "gitBranch",
      type: "text",
      defaultValue: "main",
      admin: { description: "Branch to clone (default: main)", condition: (data) => data?.sourceType === "git" },
      validate: (value: unknown) => {
        // Empty is allowed — the runner falls back to the repository default branch.
        if (value == null || value === "") return true;
        if (typeof value !== "string") return "Branch name must be a string";
        return validateGitBranch(value);
      },
    },
    // Upload fields
    {
      name: "code",
      type: "json",
      admin: {
        description: 'Inline scraper code as {"filename": "content"} map',
        condition: (data) => data?.sourceType === "upload",
      },
    },
    // Relationships
    {
      name: "catalog",
      type: "relationship",
      relationTo: "catalogs",
      admin: { description: "Catalog for scraped data" },
    },
    // Sync status
    {
      name: "lastSyncAt",
      type: "date",
      admin: { readOnly: true, position: "sidebar", description: "Last manifest sync time" },
    },
    {
      name: "lastSyncStatus",
      type: "select",
      options: [
        { label: "Success", value: "success" },
        { label: "Failed", value: "failed" },
      ],
      admin: { readOnly: true, position: "sidebar" },
    },
    {
      name: "lastSyncError",
      type: "text",
      admin: { readOnly: true, condition: (data) => data?.lastSyncStatus === "failed" },
    },
  ],
  hooks: {
    beforeChange: [
      setCreatedByHook,
      async ({ data, req, operation }) => {
        if (req.context?.seed) return data;
        if (operation === "create" && req.user) {
          const quotaService = createQuotaService(req.payload);
          await quotaService.checkAndIncrementUsage(req.user, "SCRAPER_REPOS", 1, req);
          markScraperRepoQuotaClaimed(req);
        }
        return data;
      },
    ],
    afterChange: [
      async ({ doc, previousDoc, operation, req }) => {
        if (req.context?.seed) return doc;
        if (operation === "create") {
          clearScraperRepoQuotaClaim(req);
        }
        // Auto-trigger repo sync on create, or on update when source fields change
        const shouldSync =
          operation === "create" ||
          (operation === "update" &&
            (doc.gitUrl !== previousDoc?.gitUrl ||
              doc.gitBranch !== previousDoc?.gitBranch ||
              JSON.stringify(doc.code) !== JSON.stringify(previousDoc?.code)));

        if (shouldSync) {
          await maybeQueueRepoSync({ repoId: doc.id, operation, req });
        }

        return doc;
      },
    ],
    beforeDelete: [
      // scrapers.repo_id is NOT NULL, so a repo delete with surviving
      // scrapers always fails at the FK. Cascade them (each scraper's
      // beforeDelete cascades its runs) before the repo row goes away.
      async ({ req, id }) => {
        await req.payload.delete({
          collection: "scrapers",
          where: { repo: { equals: id } },
          overrideAccess: true,
          req,
        });
      },
    ],
    afterDelete: [
      async ({ doc, req }) => {
        const createdById = typeof doc.createdBy === "object" ? doc.createdBy?.id : doc.createdBy;
        if (createdById && req.payload) {
          try {
            const quotaService = createQuotaService(req.payload);
            await quotaService.decrementUsage(createdById, "SCRAPER_REPOS", 1, req);
          } catch (error) {
            logger.error({ repoId: doc.id, error }, "Failed to decrement scraper repo quota");
          }
        }
      },
    ],
    afterError: [
      async ({ req }) => {
        await compensateScraperRepoQuotaOnError(req);
      },
    ],
  },
};

export default ScraperRepos;
