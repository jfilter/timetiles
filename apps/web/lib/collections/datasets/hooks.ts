/**
 * Hooks for the Datasets collection.
 *
 * Validates business rules such as:
 * - Datasets in public catalogs must be public
 * - Force public if allowPrivateImports is disabled
 * - Sync isPublic to events for denormalized access control
 * - Dataset names must be unique within a catalog
 *
 * @module
 * @category Collections
 */
import type { CollectionAfterChangeHook, CollectionBeforeChangeHook, PayloadRequest, Where } from "payload";

import { safeFetchRecord } from "@/lib/collections/catalog-ownership";
import { isPrivileged } from "@/lib/collections/shared-fields";
import { logger } from "@/lib/logger";
import { AUDIT_ACTIONS, auditLog } from "@/lib/services/audit-log-service";
import { getFeatureFlagService } from "@/lib/services/feature-flag-service";
import { extractRelationId, requireRelationId } from "@/lib/utils/relation-id";
import type { Catalog, Dataset, User } from "@/payload-types";

/** Check if private imports are allowed */
const validatePrivateImportAllowed = async (req: PayloadRequest, isPublic: boolean | undefined): Promise<void> => {
  if (isPublic === false) {
    const enabled = await getFeatureFlagService(req.payload).isEnabled("allowPrivateImports");
    if (!enabled) {
      throw new Error("Private datasets are currently disabled. Please make the dataset public.");
    }
  }
};

/** Get creator ID from catalog */
const getCatalogCreatorId = (catalog: Catalog): number | null => {
  if (!catalog.createdBy) return null;
  return extractRelationId(catalog.createdBy) ?? null;
};

/** Validate user can create dataset in this catalog */
const validateCreatePermission = (user: User, catalogCreatorId: number | null): void => {
  const isOwner = catalogCreatorId === user.id;

  if (!isPrivileged(user) && !isOwner) {
    throw new Error("You can only create datasets in your own catalogs");
  }
};

/** Validate dataset visibility matches catalog requirements */
const validateDatasetVisibility = (catalog: Catalog, isPublic: boolean | undefined): void => {
  if (catalog.isPublic && isPublic === false) {
    throw new Error("Datasets in public catalogs must be public");
  }
};

interface CatalogFields {
  catalogCreatorId?: number;
  catalogIsPublic: boolean;
}

/** Process catalog validation and extract denormalized fields */
const processCatalogValidation = async (
  req: PayloadRequest,
  catalogRef: number | Catalog,
  isPublic: boolean | undefined,
  operation: "create" | "update",
  originalDoc?: Partial<Dataset>
): Promise<CatalogFields> => {
  const catalogId = requireRelationId(catalogRef, "dataset.catalog");
  const catalog = await safeFetchRecord<Catalog>(req, "catalogs", catalogId);

  if (!catalog) {
    return { catalogIsPublic: false };
  }

  const catalogCreatorId = getCatalogCreatorId(catalog);

  // Validate create permission
  if (operation === "create" && req.user) {
    validateCreatePermission(req.user, catalogCreatorId);
  }

  // Validate update permission when catalog is being changed
  if (operation === "update" && req.user) {
    const previousCatalogId = originalDoc?.catalog ? extractRelationId(originalDoc.catalog) : undefined;
    if (previousCatalogId !== catalogId) {
      validateCreatePermission(req.user, catalogCreatorId);
    }
  }

  // Validate visibility
  validateDatasetVisibility(catalog, isPublic);

  return { catalogCreatorId: catalogCreatorId ?? undefined, catalogIsPublic: catalog.isPublic ?? false };
};

/**
 * Validates that datasets in public catalogs are also public.
 * Also forces datasets to be public if allowPrivateImports is disabled.
 * Sets createdBy and catalogCreatorId on creation/update.
 */
export const validatePublicCatalogDataset: CollectionBeforeChangeHook = async ({
  data,
  req,
  operation,
  originalDoc,
}) => {
  // Set createdBy on creation
  if (operation === "create" && req.user) {
    data.createdBy = req.user.id;
  }

  // Validate private imports are allowed
  if (operation === "create" || operation === "update") {
    await validatePrivateImportAllowed(req, data?.isPublic);
  }

  // Process catalog validation and set denormalized fields
  if ((operation === "create" || operation === "update") && data?.catalog) {
    try {
      const catalogFields = await processCatalogValidation(req, data.catalog, data.isPublic, operation, originalDoc);
      Object.assign(data, catalogFields);
    } catch (error) {
      // Re-throw validation errors, swallow others (catalog not found)
      if (
        error instanceof Error &&
        (error.message.includes("must be public") || error.message.includes("can only create"))
      ) {
        throw error;
      }
    }
  }

  return data;
};

/**
 * Validates that dataset names are unique within a catalog.
 * Prevents two datasets in the same catalog from having the same name.
 */
export const validateDatasetNameUniqueness: CollectionBeforeChangeHook = async ({
  data,
  req,
  operation,
  originalDoc,
}) => {
  if (operation !== "create" && operation !== "update") return data;

  const name = data?.name;
  const catalogRef = data?.catalog;
  if (!name || !catalogRef) return data;

  const catalogId = extractRelationId(catalogRef);
  if (!catalogId) return data;

  const conditions: Where[] = [{ name: { equals: name } }, { catalog: { equals: catalogId } }];

  // Exclude current document on update
  if (operation === "update" && originalDoc?.id) {
    conditions.push({ id: { not_equals: originalDoc.id } });
  }

  const existing = await req.payload.find({
    collection: "datasets",
    where: { and: conditions },
    limit: 1,
    overrideAccess: true,
    depth: 0,
  });

  if (existing.docs.length > 0) {
    throw new Error("A dataset with this name already exists in this catalog.");
  }

  return data;
};

/**
 * Sync isPublic changes to all events in this dataset.
 * Updates the denormalized datasetIsPublic field for access control.
 */
export const syncIsPublicToEvents: CollectionAfterChangeHook<Dataset> = async ({
  doc,
  previousDoc,
  operation,
  req,
}) => {
  if (operation !== "update") return doc;
  if (previousDoc?.isPublic === doc.isPublic) return doc;

  // Audit visibility change (best-effort)
  const datasetOwnerId = extractRelationId<number>(doc.createdBy);
  if (datasetOwnerId) {
    try {
      const owner = await req.payload.findByID({
        collection: "users",
        id: datasetOwnerId,
        overrideAccess: true,
        depth: 0,
      });
      await auditLog(req.payload, {
        action: AUDIT_ACTIONS.DATASET_VISIBILITY_CHANGED,
        userId: datasetOwnerId,
        userEmail: owner.email,
        performedBy: req.user?.id === datasetOwnerId ? undefined : req.user?.id,
        details: {
          datasetId: doc.id,
          datasetName: doc.name,
          previousIsPublic: previousDoc?.isPublic ?? false,
          newIsPublic: doc.isPublic ?? false,
        },
      });
    } catch {
      /* audit is best-effort */
    }
  }

  const newIsPublic = doc.isPublic ?? false;
  const catalogIsPublic = doc.catalogIsPublic ?? false;
  const combinedIsPublic = newIsPublic && catalogIsPublic;

  logger.info(`Syncing datasetIsPublic=${combinedIsPublic} to events and dataset-schemas in dataset ${doc.id}`);

  await req.payload.update({
    collection: "events",
    where: { dataset: { equals: doc.id } },
    data: { datasetIsPublic: combinedIsPublic },
    overrideAccess: true,
    req,
  });

  await req.payload.update({
    collection: "dataset-schemas",
    where: { dataset: { equals: doc.id } },
    data: { datasetIsPublic: combinedIsPublic },
    overrideAccess: true,
    req,
  });

  return doc;
};
