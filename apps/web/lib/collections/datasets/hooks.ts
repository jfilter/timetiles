/**
 * Hooks for the Datasets collection.
 *
 * Validates business rules such as:
 * - Datasets in public catalogs must be public
 * - Force public if allowPrivateImports is disabled
 *
 * @module
 * @category Collections
 */
import type { CollectionBeforeChangeHook } from "payload";

import { isFeatureEnabled } from "@/lib/services/feature-flag-service";

/**
 * Validates that datasets in public catalogs are also public.
 * Also forces datasets to be public if allowPrivateImports is disabled.
 * Sets createdBy on creation.
 */
export const validatePublicCatalogDataset: CollectionBeforeChangeHook = async ({ data, req, operation }) => {
  // Set createdBy on creation (same pattern as media.ts)
  if (operation === "create" && req.user) {
    data.createdBy = req.user.id;
  }

  // Check if private imports are allowed - block if not
  if (operation === "create" || operation === "update") {
    const allowPrivate = await isFeatureEnabled(req.payload, "allowPrivateImports");
    if (!allowPrivate && data?.isPublic === false) {
      throw new Error("Private datasets are currently disabled. Please make the dataset public.");
    }
  }

  // Validate: Datasets in public catalogs must be public
  if ((operation === "create" || operation === "update") && data?.catalog) {
    const catalogId = typeof data.catalog === "object" ? data.catalog.id : data.catalog;
    try {
      const catalog = await req.payload.findByID({
        collection: "catalogs",
        id: catalogId,
        overrideAccess: true,
      });

      // If catalog is public, dataset must also be public
      if (catalog?.isPublic && data.isPublic === false) {
        throw new Error("Datasets in public catalogs must be public");
      }
    } catch (error) {
      // Re-throw validation errors
      if (error instanceof Error && error.message.includes("must be public")) {
        throw error;
      }
      // Catalog not found - will be caught by required validation
    }
  }

  return data;
};
