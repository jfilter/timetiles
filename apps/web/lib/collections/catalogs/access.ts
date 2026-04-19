/**
 * Access control rules for catalogs collection.
 *
 * @module
 */
import type { Access, Where } from "payload";

import {
  createOwnershipAccess,
  denyPendingDeletion,
  isAuthenticated,
  isEditorOrAdmin,
  isPrivileged,
} from "../shared-fields";

export const catalogsAccess = {
  // Public catalogs can be read by anyone, private ones only by creator or admins
  // eslint-disable-next-line sonarjs/function-return-type -- returns true | Where depending on role
  read: (({ req: { user } }): boolean | Where => {
    // Admins and editors can read all
    if (isPrivileged(user)) return true;

    // Users (including not logged in) can read public catalogs OR their own private catalogs
    if (user) {
      return { or: [{ isPublic: { equals: true } }, { createdBy: { equals: user.id } }] } as Where;
    }

    // Not logged in - only public catalogs
    return { isPublic: { equals: true } };
  }) as Access,

  // Only authenticated users can create catalogs (denied for pending-deletion accounts)
  create: denyPendingDeletion(isAuthenticated),

  // Only creator, editors, or admins can update
  update: createOwnershipAccess("catalogs"),

  // Only creator, editors, or admins can delete
  delete: createOwnershipAccess("catalogs"),

  // Only admins and editors can read version history
  readVersions: isEditorOrAdmin,
};
