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
import type { CollectionConfig, Where } from "payload";

import { createLogger } from "@/lib/logger";
import { hasUrlEmbeddedCredentials, isPrivateUrl } from "@/lib/security/url-validation";
import { getFeatureFlagService } from "@/lib/services/feature-flag-service";
import { createQuotaService } from "@/lib/services/quota-service";

const COLLECTION_SLUG = "scraper-repos" as const;
const logger = createLogger(COLLECTION_SLUG);

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
  ...createCommonConfig({ versions: false, drafts: false }),
  admin: { useAsTitle: "name", defaultColumns: ["name", "sourceType", "createdBy", "updatedAt"], group: "Scrapers" },
  access: {
    // eslint-disable-next-line sonarjs/function-return-type -- Payload access control returns boolean | Where by design
    read: ({ req: { user } }): boolean | Where => {
      if (isPrivileged(user)) return true;
      if (!user) return false;
      return { createdBy: { equals: user.id } } as Where;
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

        if (shouldSync) {
          try {
            await req.payload.jobs.queue({ task: "scraper-repo-sync", input: { scraperRepoId: doc.id } });
            logger.info({ repoId: doc.id, operation }, "Queued scraper repo sync");
          } catch (error) {
            logger.error({ repoId: doc.id, error }, "Failed to queue scraper repo sync");
          }
        }

        return doc;
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
  },
};

export default ScraperRepos;
