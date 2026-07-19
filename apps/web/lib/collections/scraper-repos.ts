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

import { createLogger } from "@/lib/logger";
import { hasUrlEmbeddedCredentials, isPrivateUrl } from "@/lib/security/url-validation";
import { getFeatureFlagService } from "@/lib/services/feature-flag-service";
import { createQuotaService } from "@/lib/services/quota-service";

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
 * Queue a manifest sync for a repo after a source change.
 *
 * A generic `PATCH /api/scraper-repos/:id` touching `gitUrl` / `gitBranch` /
 * `code` auto-triggers this. Rapid edits are coalesced by the job's own
 * `supersedes` concurrency (see scraper-repo-sync-job): a newly queued sync
 * atomically deletes any older PENDING sync for the same repo, and the running
 * sync is followed by a successor that reads the LATEST state — so a burst of
 * edits collapses to one follow-up, with no lost update and no manual
 * check-then-queue race.
 *
 * Queued WITH `req`: the job insert joins the PATCH transaction, so the worker
 * cannot see (and start on) the job until the source change has committed — it
 * always reads the new state — and if enqueuing fails the whole edit rolls back
 * rather than committing a source change with no sync. The error propagates for
 * exactly that reason.
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
  await req.payload.jobs.queue({ task: SCRAPER_REPO_SYNC_TASK, input: { scraperRepoId: repoId }, req });
  logger.info({ repoId, operation }, "Queued scraper repo sync");
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

        // Auto-trigger repo sync on create, or on update when source fields change
        const shouldSync =
          operation === "create" ||
          (operation === "update" &&
            (doc.gitUrl !== previousDoc?.gitUrl ||
              doc.gitBranch !== previousDoc?.gitBranch ||
              JSON.stringify(doc.code) !== JSON.stringify(previousDoc?.code)));

        // Queue the sync BEFORE clearing the create-quota claim: enqueuing can
        // throw (it now runs in the PATCH transaction), and if it does the claim
        // must still be set so afterError compensates the reserved quota.
        if (shouldSync) {
          await maybeQueueRepoSync({ repoId: doc.id, operation, req });
        }

        if (operation === "create") {
          clearScraperRepoQuotaClaim(req);
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
