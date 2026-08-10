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
import type { Access } from "payload";

import { createOwnershipAccess, createPublicReadAccess, denyPendingDeletion, isEditorOrAdmin } from "../shared-fields";

/**
 * Read access: Datasets visible if both dataset AND catalog are public, OR if user owns the catalog.
 * Zero queries - just returns a WHERE clause on indexed fields.
 *
 * Note: A "public" dataset in a private catalog should NOT be visible to non-owners.
 * The catalog visibility is the top-level gate.
 */
export const read: Access = createPublicReadAccess(
  // Both dataset and catalog must be public for general access
  { and: [{ isPublic: { equals: true } }, { catalogIsPublic: { equals: true } }] },
  // Catalog owner can see everything in their catalog
  (userId) => ({ catalogCreatorId: { equals: userId } })
);

/**
 * Create access: Any authenticated user can create datasets (denied for pending-deletion accounts).
 * The beforeChange hook validates that users can only create in their own catalogs
 * (admins/editors can create in any catalog).
 */
export const create: Access = denyPendingDeletion(async ({ req: { user, payload } }) => {
  if (!user) return false;

  // Check feature flag - allow any authenticated user, hook validates catalog ownership/publicity
  const { getFeatureFlagService } = await import("@/lib/services/feature-flag-service");
  return getFeatureFlagService(payload).isEnabled("enableDatasetCreation");
});

/**
 * Update access: Admins/editors can update all datasets, catalog owners can update their own.
 * Uses WHERE clause on indexed catalogCreatorId field for zero queries.
 */
export const update: Access = createOwnershipAccess("catalogCreatorId");

/**
 * Delete access: Only admins/editors can delete datasets.
 */
export const deleteAccess: Access = isEditorOrAdmin;

/**
 * ReadVersions access: Only admins and editors can read version history.
 */
export const readVersions: Access = isEditorOrAdmin;
