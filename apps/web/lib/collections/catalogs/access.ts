/**
 * Access control rules for catalogs collection.
 *
 * @module
 */
import {
  createOwnershipAccess,
  createPublicReadAccess,
  denyPendingDeletion,
  isAuthenticated,
  isEditorOrAdmin,
} from "../shared-fields";

export const catalogsAccess = {
  // Public catalogs can be read by anyone, private ones only by creator or admins
  read: createPublicReadAccess({ isPublic: { equals: true } }, (userId) => ({ createdBy: { equals: userId } })),

  // Only authenticated users can create catalogs (denied for pending-deletion accounts)
  create: denyPendingDeletion(isAuthenticated),

  // Only creator, editors, or admins can update
  update: createOwnershipAccess(),

  // Only creator, editors, or admins can delete
  delete: createOwnershipAccess(),

  // Only admins and editors can read version history
  readVersions: isEditorOrAdmin,
};
