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
import { AUDIT_ACTIONS, auditLog } from "@/lib/services/audit-log-service";
import { getQuotaService } from "@/lib/services/quota-service";
import { extractRelationId } from "@/lib/utils/relation-id";

import {
  basicMetadataFields,
  createCommonConfig,
  createCreatedByField,
  createIsPublicField,
  createOwnershipAccess,
  createSlugField,
  isAuthenticated,
  isEditorOrAdmin,
  setCreatedByHook,
} from "./shared-fields";

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
  const prevCreatedBy = extractRelationId<unknown>(previousDoc?.createdBy);
  const newCreatedBy = extractRelationId<unknown>(doc.createdBy);
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

/** Sync catalog changes to dataset-schemas in a dataset */
const syncDatasetSchemasWithCatalog = async (
  req: PayloadRequest,
  datasetId: number,
  datasetIsPublic: boolean,
  changes: { createdByChanged: boolean; isPublicChanged: boolean; newCreatedBy: unknown; newIsPublic: boolean }
): Promise<void> => {
  const schemaUpdates: Record<string, unknown> = {};
  if (changes.createdByChanged) schemaUpdates.catalogOwnerId = changes.newCreatedBy;
  if (changes.isPublicChanged) schemaUpdates.datasetIsPublic = datasetIsPublic && changes.newIsPublic;

  if (Object.keys(schemaUpdates).length > 0) {
    await req.payload.update({
      collection: "dataset-schemas",
      where: { dataset: { equals: datasetId } },
      data: schemaUpdates,
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
    // oxlint-disable-next-line sonarjs/function-return-type
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
    create: isAuthenticated,

    // Only creator, editors, or admins can update
    update: createOwnershipAccess("catalogs"),

    // Only creator, editors, or admins can delete
    delete: createOwnershipAccess("catalogs"),

    // Only admins and editors can read version history
    readVersions: isEditorOrAdmin,
  },
  fields: [
    ...basicMetadataFields,
    createSlugField("catalogs"),
    createCreatedByField("User who created this catalog"),
    createIsPublicField({ showPrivateNotice: true }),
  ],
  hooks: {
    beforeChange: [
      setCreatedByHook,
      async ({ data, req, operation }) => {
        // Validate private visibility is allowed
        if (operation === "create" || operation === "update") {
          await validatePrivateVisibility(data, req);
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

        // Audit visibility and ownership changes (best-effort)
        const ownerId = extractRelationId<number>(doc.createdBy);
        if (ownerId) {
          try {
            const owner = await req.payload.findByID({
              collection: "users",
              id: ownerId,
              overrideAccess: true,
              depth: 0,
            });

            if (changes.isPublicChanged) {
              await auditLog(req.payload, {
                action: AUDIT_ACTIONS.CATALOG_VISIBILITY_CHANGED,
                userId: ownerId,
                userEmail: owner.email,
                performedBy: req.user?.id !== ownerId ? req.user?.id : undefined,
                details: {
                  catalogId: doc.id,
                  catalogName: doc.name,
                  previousIsPublic: !changes.newIsPublic,
                  newIsPublic: changes.newIsPublic,
                },
              });
            }

            if (changes.createdByChanged) {
              const prevOwnerId = extractRelationId<number>(previousDoc?.createdBy);
              await auditLog(req.payload, {
                action: AUDIT_ACTIONS.CATALOG_OWNERSHIP_TRANSFERRED,
                userId: prevOwnerId ?? ownerId,
                userEmail: owner.email,
                performedBy: req.user?.id,
                details: {
                  catalogId: doc.id,
                  catalogName: doc.name,
                  previousOwnerId: prevOwnerId,
                  newOwnerId: ownerId,
                },
              });
            }
          } catch {
            /* audit is best-effort */
          }
        }

        // Get all datasets in this catalog (needed for events update)
        const datasets = await req.payload.find({
          collection: "datasets",
          where: { catalog: { equals: doc.id } },
          pagination: false,
          depth: 0,
          overrideAccess: true,
          req,
        });

        // Sync changes to datasets
        await syncDatasetsWithCatalog(req, doc.id, changes);

        // Sync changes to events and dataset-schemas in all datasets
        for (const dataset of datasets.docs) {
          await syncEventsWithCatalog(req, dataset.id, dataset.isPublic ?? false, changes);
          await syncDatasetSchemasWithCatalog(req, dataset.id, dataset.isPublic ?? false, changes);
        }

        return doc;
      },
    ],
    afterDelete: [
      async ({ doc, req }) => {
        // Decrement catalog count when catalog is deleted
        if (doc.createdBy && req.payload) {
          const quotaService = getQuotaService(req.payload);
          await quotaService.decrementUsage(doc.createdBy, USAGE_TYPES.CURRENT_CATALOGS, 1, req);
        }
      },
    ],
  },
};

export default Catalogs;
