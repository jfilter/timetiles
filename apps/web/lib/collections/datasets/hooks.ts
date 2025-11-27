/**
 * Hooks for the Datasets collection.
 *
 * Validates business rules such as:
 * - Datasets in public catalogs must be public
 * - Force public if allowPrivateImports is disabled
 * - Sync isPublic to events for denormalized access control
 *
 * @module
 * @category Collections
 */
import type { CollectionAfterChangeHook, CollectionBeforeChangeHook, PayloadRequest } from "payload";

import { logger } from "@/lib/logger";
import { isFeatureEnabled } from "@/lib/services/feature-flag-service";
import type { Catalog, Dataset, User } from "@/payload-types";

/** Check if private imports are allowed */
const validatePrivateImportAllowed = async (req: PayloadRequest, isPublic: boolean | undefined): Promise<void> => {
  const allowPrivate = await isFeatureEnabled(req.payload, "allowPrivateImports");
  if (!allowPrivate && isPublic === false) {
    throw new Error("Private datasets are currently disabled. Please make the dataset public.");
  }
};

/** Fetch catalog by ID */
const fetchCatalog = async (req: PayloadRequest, catalogId: number | string): Promise<Catalog | null> => {
  try {
    return await req.payload.findByID({
      collection: "catalogs",
      id: catalogId,
      overrideAccess: true,
      req,
    });
  } catch {
    return null;
  }
};

/** Get creator ID from catalog */
const getCatalogCreatorId = (catalog: Catalog): number | null => {
  if (!catalog.createdBy) return null;
  return typeof catalog.createdBy === "object" ? catalog.createdBy.id : catalog.createdBy;
};

/** Validate user can create dataset in this catalog */
const validateCreatePermission = (user: User, catalog: Catalog, catalogCreatorId: number | null): void => {
  const isAdminOrEditor = user.role === "admin" || user.role === "editor";
  const isOwner = catalogCreatorId === user.id;
  const isPublicCatalog = catalog.isPublic ?? false;

  if (!isAdminOrEditor && !isOwner && !isPublicCatalog) {
    throw new Error("You can only create datasets in public catalogs or your own catalogs");
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
  operation: "create" | "update"
): Promise<CatalogFields> => {
  const catalogId = typeof catalogRef === "object" ? catalogRef.id : catalogRef;
  const catalog = await fetchCatalog(req, catalogId);

  if (!catalog) {
    return { catalogIsPublic: false };
  }

  const catalogCreatorId = getCatalogCreatorId(catalog);

  // Validate create permission
  if (operation === "create" && req.user) {
    validateCreatePermission(req.user as User, catalog, catalogCreatorId);
  }

  // Validate visibility
  validateDatasetVisibility(catalog, isPublic);

  return {
    catalogCreatorId: catalogCreatorId ?? undefined,
    catalogIsPublic: catalog.isPublic ?? false,
  };
};

/**
 * Validates that datasets in public catalogs are also public.
 * Also forces datasets to be public if allowPrivateImports is disabled.
 * Sets createdBy and catalogCreatorId on creation/update.
 */
export const validatePublicCatalogDataset: CollectionBeforeChangeHook = async ({ data, req, operation }) => {
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
      const catalogFields = await processCatalogValidation(req, data.catalog, data.isPublic, operation);
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

  const newIsPublic = doc.isPublic ?? false;

  logger.info(`Syncing datasetIsPublic=${newIsPublic} to events in dataset ${doc.id}`);

  await req.payload.update({
    collection: "events",
    where: { dataset: { equals: doc.id } },
    data: { datasetIsPublic: newIsPublic },
    overrideAccess: true,
    req,
  });

  return doc;
};
