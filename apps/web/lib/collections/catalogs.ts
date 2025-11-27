/**
 * Defines the Payload CMS collection configuration for Catalogs.
 *
 * A Catalog is a high-level container for organizing related datasets.
 * It provides a way to group data from different sources under a common theme or project.
 * This collection stores basic metadata for each catalog, such as its name, description, and public visibility.
 *
 * ⚠️ Payload CMS Deadlock Prevention
 * This file uses complex hooks with nested Payload operations.
 * See: apps/docs/content/developer-guide/development/payload-deadlocks.mdx
 *
 * @category Collections
 * @module
 */
import type { CollectionConfig, PayloadRequest } from "payload";

import { QUOTA_ERROR_MESSAGES, QUOTA_TYPES, USAGE_TYPES } from "@/lib/constants/quota-constants";
import { getQuotaService } from "@/lib/services/quota-service";

import { basicMetadataFields, createCommonConfig, createSlugField } from "./shared-fields";

/** Validates that private catalogs are allowed if isPublic is false. */
const validatePrivateVisibility = async (data: Record<string, unknown>, req: PayloadRequest): Promise<void> => {
  const { isFeatureEnabled } = await import("@/lib/services/feature-flag-service");
  const allowPrivate = await isFeatureEnabled(req.payload, "allowPrivateImports");
  if (!allowPrivate && data.isPublic === false) {
    throw new Error("Private catalogs are currently disabled. Please make the catalog public.");
  }
};

/** Checks quota and increments usage for new catalogs. */
const checkAndIncrementQuota = async (req: PayloadRequest): Promise<void> => {
  if (!req.user) return;

  const quotaService = getQuotaService(req.payload);
  const quotaCheck = await quotaService.checkQuota(req.user, QUOTA_TYPES.CATALOGS_PER_USER, 1);

  if (!quotaCheck.allowed) {
    const errorMessage = QUOTA_ERROR_MESSAGES[QUOTA_TYPES.CATALOGS_PER_USER](quotaCheck.current, quotaCheck.limit);
    throw new Error(errorMessage);
  }

  await quotaService.incrementUsage(req.user.id, USAGE_TYPES.CURRENT_CATALOGS, 1, req);
};

/** Detect what changed between previous and new catalog doc */
const detectCatalogChanges = (
  previousDoc: Record<string, unknown> | undefined,
  doc: Record<string, unknown>
): { createdByChanged: boolean; isPublicChanged: boolean; newCreatedBy: unknown; newIsPublic: boolean } => {
  const prevCreatedBy =
    typeof previousDoc?.createdBy === "object" ? (previousDoc.createdBy as { id: unknown }).id : previousDoc?.createdBy;
  const newCreatedBy = typeof doc.createdBy === "object" ? (doc.createdBy as { id: unknown }).id : doc.createdBy;
  const prevIsPublic = (previousDoc?.isPublic as boolean) ?? false;
  const newIsPublic = (doc.isPublic as boolean) ?? false;

  return {
    createdByChanged: prevCreatedBy !== newCreatedBy,
    isPublicChanged: prevIsPublic !== newIsPublic,
    newCreatedBy,
    newIsPublic,
  };
};

/** Sync catalog changes to child datasets */
const syncDatasetsWithCatalog = async (
  req: PayloadRequest,
  catalogId: number,
  changes: { createdByChanged: boolean; isPublicChanged: boolean; newCreatedBy: unknown; newIsPublic: boolean }
): Promise<void> => {
  const datasetUpdates: Record<string, unknown> = {};
  if (changes.createdByChanged) datasetUpdates.catalogCreatorId = changes.newCreatedBy;
  if (changes.isPublicChanged) datasetUpdates.catalogIsPublic = changes.newIsPublic;

  if (Object.keys(datasetUpdates).length > 0) {
    await req.payload.update({
      collection: "datasets",
      where: { catalog: { equals: catalogId } },
      data: datasetUpdates,
      overrideAccess: true,
      req,
    });
  }
};

/** Sync catalog changes to events in a dataset */
const syncEventsWithCatalog = async (
  req: PayloadRequest,
  datasetId: number,
  datasetIsPublic: boolean,
  changes: { createdByChanged: boolean; isPublicChanged: boolean; newCreatedBy: unknown; newIsPublic: boolean }
): Promise<void> => {
  const eventUpdates: Record<string, unknown> = {};
  if (changes.createdByChanged) eventUpdates.catalogOwnerId = changes.newCreatedBy;
  if (changes.isPublicChanged) eventUpdates.datasetIsPublic = datasetIsPublic && changes.newIsPublic;

  if (Object.keys(eventUpdates).length > 0) {
    await req.payload.update({
      collection: "events",
      where: { dataset: { equals: datasetId } },
      data: eventUpdates,
      overrideAccess: true,
      req,
    });
  }
};

/** Validates slug uniqueness for catalogs. */
const validateSlugUniqueness = async (
  data: Record<string, unknown>,
  req: PayloadRequest,
  operation: "create" | "update"
): Promise<void> => {
  const slug = data.slug;
  if (!slug || typeof slug !== "string") return;

  const existing = await req.payload.find({
    collection: "catalogs",
    where: { slug: { equals: slug } },
    limit: 1,
    overrideAccess: true,
  });

  if (existing.docs.length === 0) return;

  if (operation === "update") {
    const currentDocId = req.context?.id;
    const existingDocId = existing.docs[0]?.id;

    if (currentDocId && existingDocId && currentDocId !== existingDocId) {
      throw new Error(`Slug "${slug}" is already in use by another catalog.`);
    }
  } else {
    throw new Error(`Slug "${slug}" is already in use.`);
  }
};

const Catalogs: CollectionConfig = {
  slug: "catalogs",
  ...createCommonConfig(),
  admin: {
    useAsTitle: "name",
    defaultColumns: ["name", "isPublic", "createdBy"],
    group: "Data",
  },
  access: {
    // Public catalogs can be read by anyone, private ones only by creator or admins
    // @ts-expect-error - Payload access control allows returning true | Where query object
    // eslint-disable-next-line sonarjs/function-return-type
    read: ({ req: { user } }) => {
      // Admins and editors can read all
      if (user?.role === "admin" || user?.role === "editor") return true;

      // Users (including not logged in) can read public catalogs OR their own private catalogs
      if (user) {
        return {
          or: [{ isPublic: { equals: true } }, { createdBy: { equals: user.id } }],
        };
      }

      // Not logged in - only public catalogs
      return {
        isPublic: { equals: true },
      };
    },

    // Only authenticated users can create catalogs
    create: ({ req: { user } }) => Boolean(user),

    // Only creator, editors, or admins can update
    update: async ({ req: { user, payload }, id }) => {
      if (user?.role === "admin" || user?.role === "editor") return true;

      if (!user || !id) return false;

      try {
        // Always fetch the existing document to check ownership
        const existingDoc = await payload.findByID({
          collection: "catalogs",
          id,
          overrideAccess: true,
        });

        if (existingDoc?.createdBy) {
          const createdById =
            typeof existingDoc.createdBy === "object" ? existingDoc.createdBy.id : existingDoc.createdBy;
          return user.id === createdById;
        }

        return false;
      } catch {
        return false;
      }
    },

    // Only creator, editors, or admins can delete
    delete: async ({ req: { user, payload }, id }) => {
      if (user?.role === "admin" || user?.role === "editor") return true;

      if (!user || !id) return false;

      try {
        // Always fetch the existing document to check ownership
        const existingDoc = await payload.findByID({
          collection: "catalogs",
          id,
          overrideAccess: true,
        });

        if (existingDoc?.createdBy) {
          const createdById =
            typeof existingDoc.createdBy === "object" ? existingDoc.createdBy.id : existingDoc.createdBy;
          return user.id === createdById;
        }

        return false;
      } catch {
        return false;
      }
    },

    // Only admins and editors can read version history
    readVersions: ({ req: { user } }) => user?.role === "admin" || user?.role === "editor",
  },
  fields: [
    ...basicMetadataFields,
    createSlugField("catalogs"),
    {
      name: "createdBy",
      type: "relationship",
      relationTo: "users",
      admin: {
        position: "sidebar",
        readOnly: true,
        description: "User who created this catalog",
      },
    },
    {
      name: "isPublic",
      type: "checkbox",
      defaultValue: false,
      admin: {
        position: "sidebar",
        components: {
          afterInput: ["/components/admin/private-visibility-notice"],
        },
      },
    },
  ],
  hooks: {
    beforeChange: [
      async ({ data, req, operation }) => {
        // Validate private visibility is allowed
        if (operation === "create" || operation === "update") {
          await validatePrivateVisibility(data, req);
        }

        // Set createdBy on creation (same pattern as media.ts)
        if (operation === "create" && req.user) {
          // eslint-disable-next-line require-atomic-updates -- Sequential hook, no race condition
          data.createdBy = req.user.id;
        }

        // Handle quota check and increment for new catalogs
        if (operation === "create") {
          await checkAndIncrementQuota(req);
        }

        // Validate slug uniqueness
        if (operation === "create" || operation === "update") {
          await validateSlugUniqueness(data, req, operation);
        }

        return data;
      },
    ],
    afterChange: [
      async ({ doc, previousDoc, operation, req }) => {
        // Sync catalog changes to datasets and events (for access control)
        if (operation !== "update") return doc;

        const changes = detectCatalogChanges(previousDoc, doc);
        if (!changes.createdByChanged && !changes.isPublicChanged) return doc;

        // Get all datasets in this catalog (needed for events update)
        const datasets = await req.payload.find({
          collection: "datasets",
          where: { catalog: { equals: doc.id } },
          limit: 1000,
          depth: 0,
          overrideAccess: true,
          req,
        });

        // Sync changes to datasets
        await syncDatasetsWithCatalog(req, doc.id, changes);

        // Sync changes to events in all datasets
        for (const dataset of datasets.docs) {
          await syncEventsWithCatalog(req, dataset.id, dataset.isPublic ?? false, changes);
        }

        return doc;
      },
    ],
    afterDelete: [
      async ({ doc, req }) => {
        // Decrement catalog count when catalog is deleted
        if (doc.createdBy && req.payload) {
          const quotaService = getQuotaService(req.payload);
          await quotaService.decrementUsage(doc.createdBy, USAGE_TYPES.CURRENT_CATALOGS, 1);
        }
      },
    ],
  },
};

export default Catalogs;
