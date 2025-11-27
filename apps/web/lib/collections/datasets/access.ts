/**
 * Access control logic for the Datasets collection.
 *
 * Defines read, create, update, and delete permissions based on:
 * - User role (admin/editor has full access)
 * - Public/private status of datasets
 * - Catalog ownership (via denormalized catalogCreatorId)
 *
 * Since dataset.isPublic=true guarantees catalog.isPublic=true (enforced by hook),
 * we only need to check dataset.isPublic for public access.
 * Private datasets are visible to catalog owners.
 *
 * @module
 * @category Collections
 */
import type { Access, Where } from "payload";

/**
 * Read access: Datasets visible if both dataset AND catalog are public, OR if user owns the catalog.
 * Zero queries - just returns a WHERE clause on indexed fields.
 *
 * Note: A "public" dataset in a private catalog should NOT be visible to non-owners.
 * The catalog visibility is the top-level gate.
 */
// eslint-disable-next-line sonarjs/function-return-type -- Payload access control returns boolean | Where by design
export const read: Access = ({ req: { user } }): boolean | Where => {
  // Admin and editor can read all
  if (user?.role === "admin" || user?.role === "editor") return true;

  // Logged-in users can see: (public data in public catalog) OR data in catalogs they own
  if (user) {
    return {
      or: [
        // Both dataset and catalog must be public for general access
        { and: [{ isPublic: { equals: true } }, { catalogIsPublic: { equals: true } }] },
        // Catalog owner can see everything in their catalog
        { catalogCreatorId: { equals: user.id } },
      ],
    } as Where;
  }

  // Anonymous users only see public datasets in public catalogs
  return { and: [{ isPublic: { equals: true } }, { catalogIsPublic: { equals: true } }] } as Where;
};

/**
 * Create access: Any authenticated user can create datasets.
 * The beforeChange hook validates that users can only create in:
 * - Public catalogs (anyone can contribute)
 * - Their own catalogs
 */
export const create: Access = async ({ req: { user, payload } }) => {
  if (!user) return false;

  // Check feature flag - allow any authenticated user, hook validates catalog ownership/publicity
  const { isFeatureEnabled } = await import("@/lib/services/feature-flag-service");
  return isFeatureEnabled(payload, "enableDatasetCreation");
};

/**
 * Update access: Admins/editors can update all datasets, catalog owners can update their own.
 * Uses WHERE clause on indexed catalogCreatorId field for zero queries.
 */
// eslint-disable-next-line sonarjs/function-return-type -- Payload access control returns boolean | Where by design
export const update: Access = ({ req: { user } }): boolean | Where => {
  if (!user) return false;
  if (user.role === "admin" || user.role === "editor") return true;

  // Catalog owner can update datasets in their catalog
  return { catalogCreatorId: { equals: user.id } } as Where;
};

/**
 * Delete access: Only admins/editors can delete datasets.
 */
export const deleteAccess: Access = ({ req: { user } }) => user?.role === "admin" || user?.role === "editor";

/**
 * ReadVersions access: Only admins and editors can read version history.
 */
export const readVersions: Access = ({ req: { user } }) => user?.role === "admin" || user?.role === "editor";
