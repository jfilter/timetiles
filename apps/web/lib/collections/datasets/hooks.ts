/**
 * Hooks for the Datasets collection.
 *
 * Validates business rules such as:
 * - Datasets in public catalogs must be public
 *
 * @module
 * @category Collections
 */
import type { CollectionBeforeChangeHook } from "payload";

/**
 * Validates that datasets in public catalogs are also public.
 */
export const validatePublicCatalogDataset: CollectionBeforeChangeHook = async ({ data, req, operation }) => {
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
