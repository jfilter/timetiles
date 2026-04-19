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
import type {
  CollectionAfterChangeHook,
  CollectionAfterErrorHook,
  CollectionBeforeChangeHook,
  PayloadRequest,
  Where,
} from "payload";

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
  const catalog = await safeFetchRecord(req, "catalogs", catalogId);

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

const DATASET_NAME_CONFLICT_MESSAGE = "A dataset with this name already exists in this catalog.";
/** Name of the unique index enforcing (catalog_id, name) uniqueness on datasets.
 *  Kept in sync with migrations/20260417_100000_datasets_catalog_name_unique.ts. */
const DATASET_CATALOG_NAME_UNIQUE_INDEX = "datasets_catalog_name_unique";

/**
 * Validates that dataset names are unique within a catalog.
 *
 * This hook does an optimistic find-first check for clean UX (most conflicts
 * are caught here before the INSERT is attempted). The authoritative guarantee
 * is the DB-level unique index on `(catalog_id, name)` — see
 * `migrations/20260417_100000_datasets_catalog_name_unique.ts`. That index
 * closes the TOCTOU race where two concurrent writers both pass the find
 * check; the `handleDatasetUniqueConstraintError` afterError hook translates
 * the resulting PG 23505 error into the same user-friendly message.
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
    throw new Error(DATASET_NAME_CONFLICT_MESSAGE);
  }

  return data;
};

/**
 * Translates the PG 23505 error from the `datasets_catalog_name_unique`
 * partial index into the same user-friendly message thrown by
 * `validateDatasetNameUniqueness`. The DB index fires when concurrent writers
 * both pass the optimistic find-first check — without this hook, the admin UI
 * would show a raw PostgreSQL error for the race case.
 *
 * This covers REST and GraphQL flows; local API callers still receive the
 * underlying PG error and can inspect `error.code === "23505"` if they care.
 */
// eslint-disable-next-line @typescript-eslint/require-await -- signature is async per Payload's AfterErrorHook contract
export const handleDatasetUniqueConstraintError: CollectionAfterErrorHook = async ({ error }) => {
  const err = error as (Error & { code?: string; constraint?: string; message?: string }) | undefined;
  if (!err) return;
  const message = err.message ?? "";
  const isUniqueViolation =
    err.code === "23505" ||
    err.constraint === DATASET_CATALOG_NAME_UNIQUE_INDEX ||
    message.includes(DATASET_CATALOG_NAME_UNIQUE_INDEX);

  if (isUniqueViolation) {
    throw new Error(DATASET_NAME_CONFLICT_MESSAGE);
  }
};

type DatasetAccessSyncState = {
  combinedIsPublic: boolean;
  didCatalogOwnerChange: boolean;
  didCatalogVisibilityChange: boolean;
  didDatasetVisibilityChange: boolean;
  nextCatalogOwnerId: number | null;
};

const getDatasetAccessSyncState = (doc: Dataset, previousDoc?: Partial<Dataset>): DatasetAccessSyncState => {
  const nextCatalogOwnerId = doc.catalogCreatorId ?? null;
  const previousCatalogOwnerId = previousDoc?.catalogCreatorId ?? null;

  return {
    combinedIsPublic: (doc.isPublic ?? false) && (doc.catalogIsPublic ?? false),
    didDatasetVisibilityChange: (previousDoc?.isPublic ?? false) !== (doc.isPublic ?? false),
    didCatalogVisibilityChange: (previousDoc?.catalogIsPublic ?? false) !== (doc.catalogIsPublic ?? false),
    didCatalogOwnerChange: previousCatalogOwnerId !== nextCatalogOwnerId,
    nextCatalogOwnerId,
  };
};

const auditDatasetVisibilityChange = async (
  req: PayloadRequest,
  doc: Dataset,
  previousDoc?: Partial<Dataset>
): Promise<void> => {
  const datasetOwnerId = extractRelationId<number>(doc.createdBy);
  if (!datasetOwnerId) return;

  try {
    const owner = await req.payload.findByID({
      collection: "users",
      id: datasetOwnerId,
      overrideAccess: true,
      depth: 0,
      req,
    });
    await auditLog(
      req.payload,
      {
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
      },
      { req }
    );
  } catch {
    /* audit is best-effort */
  }
};

const syncDatasetChildAccessFields = async (
  req: PayloadRequest,
  datasetId: number,
  accessFields: { catalogOwnerId: number | null; datasetIsPublic: boolean }
): Promise<void> => {
  await req.payload.update({
    collection: "events",
    where: { dataset: { equals: datasetId } },
    data: accessFields,
    overrideAccess: true,
    req,
  });

  await req.payload.update({
    collection: "dataset-schemas",
    where: { dataset: { equals: datasetId } },
    data: accessFields,
    overrideAccess: true,
    req,
  });
};

/**
 * Sync dataset access-control changes to all child records in this dataset.
 *
 * Updates the denormalized `datasetIsPublic` and `catalogOwnerId` fields used
 * by events and dataset schemas for access control.
 */
export const syncIsPublicToEvents: CollectionAfterChangeHook<Dataset> = async ({
  doc,
  previousDoc,
  operation,
  req,
}) => {
  if (operation !== "update") return doc;

  const syncState = getDatasetAccessSyncState(doc, previousDoc);

  if (
    !syncState.didDatasetVisibilityChange &&
    !syncState.didCatalogVisibilityChange &&
    !syncState.didCatalogOwnerChange
  ) {
    return doc;
  }

  if (syncState.didDatasetVisibilityChange) {
    await auditDatasetVisibilityChange(req, doc, previousDoc);
  }

  const accessFields = {
    datasetIsPublic: syncState.combinedIsPublic,
    catalogOwnerId: syncState.nextCatalogOwnerId,
  };

  logger.info(
    {
      datasetId: doc.id,
      datasetIsPublic: syncState.combinedIsPublic,
      catalogOwnerId: syncState.nextCatalogOwnerId,
    },
    "Syncing dataset access fields to events and dataset schemas"
  );

  await syncDatasetChildAccessFields(req, doc.id, accessFields);

  return doc;
};
