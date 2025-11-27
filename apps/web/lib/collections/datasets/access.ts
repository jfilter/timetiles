/**
 * Access control logic for the Datasets collection.
 *
 * Defines read, create, update, and delete permissions based on:
 * - User role (admin has full access)
 * - Catalog ownership
 * - Public/private status of datasets and catalogs
 *
 * @module
 * @category Collections
 */
import type { Access, Where } from "payload";

/**
 * Read access: Public datasets in public catalogs, or any dataset in owned catalogs.
 */
export const read: Access = async ({ req }) => {
  const { user, payload } = req;

  // Admin and editor can read all
  if (user?.role === "admin" || user?.role === "editor") return true;

  // For non-admin users, we need to check:
  // 1. Public datasets in public catalogs
  // 2. Any dataset (public or private) in catalogs owned by the user

  // Get accessible catalogs using shared helper
  const { publicCatalogIds, ownedCatalogIds } = await (
    await import("@/lib/services/access-control")
  ).getAccessibleCatalogIds(payload, user);

  // Build query:
  // - Public datasets in public catalogs
  // - Any dataset (public or private) in owned catalogs
  // - Datasets created by the user (if authenticated)
  const conditions: Where[] = [];

  if (publicCatalogIds.length > 0) {
    conditions.push({
      and: [{ catalog: { in: publicCatalogIds } }, { isPublic: { equals: true } }],
    });
  }

  if (ownedCatalogIds.length > 0) {
    conditions.push({
      catalog: { in: ownedCatalogIds },
    });
  }

  // Note: Datasets don't have a createdBy field tracked directly
  // They inherit access through catalog ownership
  // Users can create datasets in public catalogs but those datasets
  // follow the standard access rules (must be public to be readable by non-owners)

  if (conditions.length === 0) {
    // Return impossible condition instead of false to allow 200 with empty results
    // This provides graceful degradation when there's no public data
    return { id: { equals: -1 } } as Where; // No dataset has ID -1
  }

  return { or: conditions };
};

/**
 * Create access: Must be authenticated and have access to the target catalog.
 */
export const create: Access = async ({ req: { user, payload }, data }) => {
  if (!user) return false;

  // Check feature flag - even admins can't create if disabled
  const { isFeatureEnabled } = await import("@/lib/services/feature-flag-service");
  if (!(await isFeatureEnabled(payload, "enableDatasetCreation"))) return false;

  if (user?.role === "admin" || user?.role === "editor") return true;

  // Check if user has access to the catalog
  if (data?.catalog) {
    const catalogId = typeof data.catalog === "object" ? data.catalog.id : data.catalog;
    try {
      const catalog = await payload.findByID({
        collection: "catalogs",
        id: catalogId,
        overrideAccess: true,
      });

      // Can create in public catalogs or own private catalogs
      if (catalog?.isPublic) return true;

      if (catalog?.createdBy) {
        const createdById = typeof catalog.createdBy === "object" ? catalog.createdBy.id : catalog.createdBy;
        return user.id === createdById;
      }
    } catch {
      return false;
    }
  }

  return false;
};

/**
 * Helper: Check if user owns the catalog that the dataset belongs to.
 */
const checkCatalogOwnership: Access = async ({ req, id }) => {
  const { user, payload } = req;
  if (user?.role === "admin" || user?.role === "editor") return true;

  if (!user || !id) return false;

  try {
    // Fetch the existing dataset with override to get catalog info
    const existingDataset = await payload.findByID({
      collection: "datasets",
      id,
      overrideAccess: true,
    });

    if (existingDataset?.catalog) {
      const catalogId =
        typeof existingDataset.catalog === "object" ? existingDataset.catalog.id : existingDataset.catalog;
      const catalog = await payload.findByID({
        collection: "catalogs",
        id: catalogId,
        overrideAccess: true,
      });

      if (catalog?.createdBy) {
        const createdById = typeof catalog.createdBy === "object" ? catalog.createdBy.id : catalog.createdBy;
        return user.id === createdById;
      }
    }

    return false;
  } catch {
    return false;
  }
};

/**
 * Update access: Only catalog owner or admins can update.
 */
export const update: Access = checkCatalogOwnership;

/**
 * Delete access: Only catalog owner or admins can delete.
 */
export const deleteAccess: Access = checkCatalogOwnership;

/**
 * ReadVersions access: Only admins and editors can read version history.
 */
export const readVersions: Access = ({ req: { user } }) => user?.role === "admin" || user?.role === "editor";
